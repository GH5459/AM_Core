import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {meetingPublication} from '../modules/meetings/publication-target.js';
process.env.MEETING_HUB_PREVIEW='1';const {fixture:f}=await import('./test-meeting-hub.mjs');const {pg,service,host,guest,key,row,platform}=f;
async function call(path,value,token='host',origin=platform.publicBaseUrl){const req=Readable.from([Buffer.from(JSON.stringify(value))]);req.method='POST';req.headers={authorization:'Bearer '+token,origin};let status=200,result;const res={setHeader(){},writeHead(s){status=s;},get headersSent(){return false;},set statusCode(s){status=s;},end(s){result=JSON.parse(s);}};await service.handle(req,res,new URL(platform.publicBaseUrl+path));return {status,...result};}
const hub=v=>call('/meetings/review/hub/api',v);
try{
 const input={action:'create',conversationKey:key,operationId:'delete-test-operation-001',topic:'合成未完成會議',start:'2026-10-21T10:00:00+08:00',end:'2026-10-21T11:00:00+08:00',location:'合成',accounts:['222'],calendar:true,cancelled:false};
 const made=await hub(input);assert.equal(made.status,200,JSON.stringify(made));const id=made.id;let r=await service.store.get(id);const prior=structuredClone(r),plan=(await pg.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1',[id])).rows[0];
 const remove=revision=>hub({action:'delete-meeting',id,revision}),restore=revision=>hub({action:'restore-meeting',id,revision});
 const list=(await hub({action:'list'})).items.find(x=>x.id===id);assert.equal(list.canDelete,true);assert.equal(list.revision,Number(r.revision));
 assert.equal((await call('/meetings/review/hub/api',{action:'delete-meeting',id,revision:1},'guest')).status,403);
 assert.equal((await call('/meetings/review/hub/api',{action:'delete-meeting',id,revision:1},'host','https://other.example')).status,403);
 const oldBot=row.bot_id;row.bot_id='U'+'d'.repeat(32);assert.equal((await remove(1)).status,403);row.bot_id=oldBot;
 await pg.query("UPDATE central_archive.meeting_plans SET tenant_key='other-service' WHERE workspace_id=$1",[id]);assert.equal((await remove(1)).status,409);await pg.query("UPDATE central_archive.meeting_plans SET tenant_key='fixture' WHERE workspace_id=$1",[id]);
 assert.equal((await remove(0)).status,400);assert.equal((await remove(2)).status,409);
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='processing' WHERE id=$1",[id]);assert.equal((await remove(1)).status,409);
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='publishing' WHERE id=$1",[id]);assert.equal((await remove(1)).status,409);
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='published' WHERE id=$1",[id]);assert.equal((await remove(1)).status,409);
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='setup' WHERE id=$1",[id]);
 await pg.query("UPDATE central_archive.meeting_calendar_links SET lease_until=now()+interval '2 minutes' WHERE workspace_id=$1",[id]);assert.equal((await remove(1)).status,409);await pg.query('UPDATE central_archive.meeting_calendar_links SET lease_until=NULL WHERE workspace_id=$1',[id]);
 assert.equal((await remove(1)).status,200);assert.equal((await remove(1)).status,200,'Lost delete response may safely retry');r=await service.store.get(id);assert.equal(r.state,'declined');assert(r.receipt.deletion.active);assert.deepEqual(r.fields,prior.fields);assert.equal(r.filename,prior.filename);assert.deepEqual((await pg.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1',[id])).rows[0],plan);
 assert(!(await hub({action:'list'})).items.some(x=>x.id===id));assert(!(await hub({action:'list',scope:'shared'})).items.some(x=>x.id===id));assert((await hub({action:'trash-list'})).items.some(x=>x.id===id));assert(!(await call('/meetings/review/hub/api',{action:'trash-list'},'guest')).items.some(x=>x.id===id));
 for(const area of ['api','hub'])assert.equal((await call('/meetings/review/work/'+id+'/'+area,{action:area==='api'?'read':'plan-read'})).status,410);
 assert.equal((await hub(input)).status,409,'Create replay cannot silently restore');
 const pub=meetingPublication({pool:{query:(...a)=>pg.query(...a)},store:service.store,botId:row.bot_id,getConversation:async()=>row,assertMember:async()=>{}});assert.equal((await pub.claim(prior)).rows.length,0,'An earlier worker claim must not wake deleted work');
 let syncedDeleted=false;const oldSync=platform.syncMeetingCalendar;platform.syncMeetingCalendar=async(t,v)=>{if(v.meetingId===id)syncedDeleted=true;return oldSync(t,v);};await service.drain();await service.settle();assert(!syncedDeleted,'Deleted draft does not sync Calendar');platform.syncMeetingCalendar=oldSync;
 assert.equal((await restore(1)).status,409);assert.equal((await restore(Number(r.revision))).status,200);assert.equal((await restore(Number(r.revision))).status,200,'Lost restore response safely retries');r=await service.store.get(id);assert.equal(r.state,'setup');assert.deepEqual(r.fields,prior.fields);assert((await hub({action:'list'})).items.some(x=>x.id===id));assert(!(await hub({action:'trash-list'})).items.some(x=>x.id===id));
 assert.equal((await remove(1)).status,409,'An old delete cannot remove a restored meeting');
 const edits=(await pg.query("SELECT * FROM central_archive.meeting_workspace_edits WHERE workspace_id=$1 AND field='deletion' ORDER BY revision",[id])).rows;assert.equal(edits.length,2);assert.equal(edits[0].actor_id,host);assert.equal(edits[1].after_value.active,false);
 // Recovery works for produced but unpublished minutes too.
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='review' WHERE id=$1",[id]);assert.equal((await remove(Number(r.revision))).status,200);r=await service.store.get(id);assert.equal((await restore(Number(r.revision))).status,200);assert.equal((await service.store.get(id)).state,'review');
 console.log('Pending meeting deletion: host/tenant/origin/revision gates, active-job refusal, retry-safe trash/restore, private lists, original fields/calendar retention, deleted-reader refusal and stale worker-claim protection passed.');
}finally{await pg.close();}

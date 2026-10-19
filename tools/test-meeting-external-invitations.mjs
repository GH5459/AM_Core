import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const {pg,service,platform,key}=f;
async function call(path,v,token='host'){let status=200,out;const req=Readable.from([Buffer.from(JSON.stringify(v))]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:platform.publicBaseUrl};await service.handle(req,{writeHead(v){status=v;},setHeader(){},set statusCode(v){status=v;},get headersSent(){return false;},end(s){out=JSON.parse(s);}},new URL(platform.publicBaseUrl+path));return {status,...out};}
const rows=(await pg.query("SELECT id FROM central_archive.meeting_workspaces WHERE receipt->>'externalCalendar'='true'")).rows,id=rows[0].id;
const detail=(v,t='host')=>call('/meetings/review/work/'+id+'/hub',v,t),writes=[];
platform.syncMeetingCalendar=async(t,v)=>{if(v.action){assert(['calendar-week','calendar-read'].includes(v.action));return {ok:true,calendarId:'fixture-calendar',googleAccount:'fixture@example.test',items:[{id:'instance-one',iCalUID:'synthetic-occurrence@fixture.test',topic:'Calendar合成會議',start:'2026-10-27T02:00:00Z',end:'2026-10-27T03:00:00Z',allDay:false,location:'合成'}]};}writes.push(v);return {calendarId:'guest-calendar',eventId:'same-event',googleAccount:'guest@fixture.test',reused:true};};
try{
 await pg.query("UPDATE central_archive.meeting_plans SET end_at='2026-10-27T03:00:00Z' WHERE workspace_id=$1",[id]);
 // Legacy imports have only the flag. Resolve the original ID by signed, actor-
 // bound Calendar listing rather than a matching title or attendee name.
 await pg.query("UPDATE central_archive.meeting_workspaces SET receipt=receipt-'externalCalendarSource' WHERE id=$1",[id]);
 const input={action:'invite-save',version:1,accounts:['222','222'],calendar:true};
 assert.equal((await detail(input,'guest')).status,403);
 assert.equal((await detail({...input,accounts:['333']})).status,409);
 let result=await detail(input);assert.equal(result.status,200,JSON.stringify(result));assert.deepEqual(result.plan.participants,[{account:'222',name:'參與者'}]);assert.equal(result.plan.topic,'Calendar合成會議');assert.equal(result.plan.location,'合成');
 assert.equal((await detail(input)).status,409,'Stale invitation cannot overwrite');
 assert.equal((await detail({action:'plan-read'},'guest')).status,200);
 assert((await call('/meetings/review/hub/api',{action:'list'},'guest')).items.some(x=>x.id===id&&x.kind==='受邀會議'));
 await service.drain();assert.equal(writes.length,1);assert.equal(writes[0].account,'222','Never copy the original host event');assert.equal(writes[0].externalSource.iCalUID,'synthetic-occurrence@fixture.test');
 result=await detail({action:'plan-read'});assert.equal(result.calendar[0].state,'reused');
 result=await detail({...input,version:2});assert.equal(result.status,200);await service.drain();assert.equal(writes.length,2);assert.equal(writes[1].meetingId,writes[0].meetingId);
 result=await detail({...input,version:3,accounts:[]});assert.equal(result.status,200);await service.drain();assert(writes.at(-1).removed);assert.equal((await detail({action:'plan-read'},'guest')).status,403);
 result=await detail({...input,version:4,calendar:false});assert.equal(result.status,200);assert.equal((await detail({action:'plan-read'},'guest')).status,200,'Internal membership independent of Google');
 const normalSync=platform.syncMeetingCalendar;platform.syncMeetingCalendar=async()=>{throw Object.assign(Error('disconnected'),{code:'GOOGLE_NOT_CONNECTED'});};result=await detail({...input,version:5});assert.equal(result.status,200);await service.drain();result=await detail({action:'plan-read'});assert.equal(result.calendar[0].state,'failed');assert.equal((await detail({action:'plan-read'},'guest')).status,200,'Google failure must not discard internal invite');platform.syncMeetingCalendar=normalSync;
 assert.equal((await pg.query('SELECT preparation FROM central_archive.meeting_plans WHERE workspace_id=$1',[id])).rows[0].preparation,'');
 console.log('External Calendar invitations: legacy source recovery, host-only/tenant/roster/version checks, participant access and inbox, no host copy, per-recipient sync/retry/revoke, independent internal membership and unchanged original metadata passed.');
}finally{await pg.close();}

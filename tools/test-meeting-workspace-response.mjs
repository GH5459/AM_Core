import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {workspaceResponse,WORKSPACE_REFRESH_CONTRACT} from '../modules/meetings/workspace-response.js';
import {TASK_PROGRESS_CONTRACT} from '../modules/meetings/task-progress.js';

const nativeFetch=globalThis.fetch;
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
try{
 const row=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0],id=row.id,todo=Object.keys(row.fields).find(k=>k.startsWith('todo:'));
 const unchangedPushes=f.pushes.length;
 async function api(input,token='host'){
  let code=200,body='';const headers={},req=Readable.from([JSON.stringify(input)]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:f.platform.publicBaseUrl};
  await f.service.handle(req,{headersSent:false,setHeader(k,v){headers[k]=v;},writeHead(s){code=s;},set statusCode(s){code=s;},end(v){body=v;}},new URL(f.platform.publicBaseUrl+'/meetings/review/work/'+id+'/api'));
  return {code,value:JSON.parse(body),bytes:Buffer.byteLength(body),headers};
 }
 const hydrate=(base,response)=>{if(!response.delta)return response;const next={...base};for(const key of response.removed)delete next[key];return {...next,...response.values,refresh:response.refresh};};
 const rawQuery=f.pool.query;let queries=0;f.pool.query=(...args)=>{queries++;return rawQuery(...args);};
 const before=queries;
 const templates=(await f.pool.query('SELECT name,prompt,version FROM central_archive.meeting_workspace_templates WHERE conversation_key=$1 ORDER BY name',[row.conversation_key])).rows;
 const pending=(await f.pool.query("SELECT revision,error_code FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending' ORDER BY revision LIMIT 1",[id])).rows[0]||null;
 const dispatch=(await f.pool.query('SELECT * FROM central_archive.meeting_task_dispatches WHERE workspace_id=$1',[id])).rows[0]||null;
 const editing=await f.service.store.effective(row),changes=await f.service.store.changes(id);
 const legacyQueries=queries-before;
 const after=queries,view=await f.service.store.readView(row,row.conversation_key),snapshotQueries=queries-after;
 assert.deepEqual(view.templates,templates);assert.deepEqual(view.pendingRevision,pending);assert.deepEqual(view.editing,editing);
 assert.deepEqual(view.changes,JSON.parse(JSON.stringify(changes)));assert.equal(view.dispatch.task_tenant,dispatch.task_tenant);
 assert.equal(snapshotQueries,1);assert.equal(legacyQueries,6);
 let status='done',progressCalls=0;f.platform.readMeetingTaskProgress=async()=>{progressCalls++;return {contract:TASK_PROGRESS_CONTRACT,items:[{todoId:todo,status,due:'2026-10-25',result:status==='done'?'合成成果':'',hasEvidence:status==='done'}]};};
 const record=Array.from({length:100},(_,i)=>'合成會議內容 '+i+'：保留來源、決議與討論。').join('\n');
 await f.pg.query("UPDATE central_archive.meeting_workspaces SET fields=jsonb_set(fields,'{record}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(record)]);
 let full=await api({action:'read'});assert.equal(full.code,200);assert.equal(full.headers['X-Meeting-Refresh'],WORKSPACE_REFRESH_CONTRACT);assert(full.headers['Server-Timing'].includes('meeting_view;dur='));
 const compact=await api({action:'read',known:full.value.refresh});assert.equal(compact.code,200);assert(compact.value.delta);assert(!compact.value.values.reader);assert(!compact.value.values.editing);assert(compact.value.values.audioUrl,'Playback ticket is refreshed separately');assert(compact.bytes<full.bytes/3);
 let current=hydrate(full.value,compact.value);assert.equal(current.reader.record,record);assert.equal(current.taskProgress.counts.done,1);
 const callsBeforeSave=progressCalls,savingRow=await f.service.store.get(id);
 const saved=await api({action:'sharing',enabled:false,revision:Number(savingRow.revision),version:Number(savingRow.sharing_version),response:'saved'});assert.equal(saved.code,200);assert(saved.value.progressDeferred);assert.equal(progressCalls,callsBeforeSave,'A committed save does not wait for external task progress');assert.equal(saved.value.taskProgress,null);assert.equal(saved.value.sharing.version,Number(savingRow.sharing_version)+1);
 status='in_progress';let changed=await api({action:'read',known:current.refresh});assert(changed.value.delta);assert.equal(changed.value.values.taskProgress.counts.in_progress,1);assert(!changed.value.values.reader);current=hydrate(current,changed.value);
 await f.pg.query("UPDATE central_archive.meeting_workspaces SET fields=jsonb_set(jsonb_set(fields,'{record}',$2::jsonb),'{transcript}',$3::jsonb) WHERE id=$1",[id,JSON.stringify(record+'\n新版正文'),JSON.stringify('新版逐字稿')]);
 changed=await api({action:'read',known:current.refresh});assert(changed.value.values.reader.record.endsWith('新版正文'));assert.equal(changed.value.values.reader.transcript,'新版逐字稿');assert.equal(changed.value.values.editing.fields.transcript,'新版逐字稿');assert.equal(changed.value.values.workspace.fields.transcript,'新版逐字稿');current=hydrate(current,changed.value);
 await f.pg.query("UPDATE central_archive.meeting_task_dispatches SET error_code='合成派發等待' WHERE workspace_id=$1",[id]);
 changed=await api({action:'read',known:current.refresh});assert.equal(changed.value.values.assignment.message,'合成派發等待');current=hydrate(current,changed.value);
 const oldName=f.row.display_name;f.row.display_name='同一來源的新名稱';changed=await api({action:'read',known:current.refresh});assert.equal(changed.value.values.workspace.sourceName,f.row.display_name);current=hydrate(current,changed.value);f.row.display_name=oldName;
 const organization={tenantKey:'fixture',people:[{account:'333',name:'指定夥伴'}]};f.platform.meetingOrganization=async()=>organization;
 let active=true;const outside='U'+'3'.repeat(32);f.platform.meetingShareIdentity=async(user,tenant)=>active&&user===outside&&tenant==='fixture'?{account:'333',tenantKey:'fixture',name:'指定夥伴'}:null;
 let stored=await f.service.store.get(id);assert.equal((await api({action:'sharing',enabled:false,accounts:['333'],revision:Number(stored.revision),version:Number(stored.sharing_version)})).code,200);
 const recipient=await api({action:'read',known:current.refresh},'outside');assert.equal(recipient.code,200);assert(!recipient.value.delta,'Access scope change requires a full replacement');assert.equal(recipient.value.access,'recipient');assert(!recipient.value.editing);assert(!recipient.value.sharing);assert(!recipient.value.changes);
 assert((await api({action:'read',known:recipient.value.refresh},'outside')).value.delta);
 active=false;assert.equal((await api({action:'read',known:recipient.value.refresh},'outside')).code,403,'A matching section token cannot bypass revoked identity');active=true;
 stored=await f.service.store.get(id);await api({action:'sharing',enabled:false,accounts:[],revision:Number(stored.revision),version:Number(stored.sharing_version)});
 assert.equal((await api({action:'read',known:recipient.value.refresh},'outside')).code,403,'Removed sharing cannot reuse a previous response');
 assert.equal(f.pushes.length,unchangedPushes,'Read optimization and share configuration send no LINE notices');
 const publicData={ok:true,access:'public',actor:{name:'分享觀看'},workspace:{id,state:'published',revision:1},reader:{record:'合成'}};
 const publicView=workspaceResponse(publicData,{action:'read'});assert(!workspaceResponse(publicData,{action:'read',known:current.refresh}).delta);
 const stale={...publicView.refresh,keys:{...publicView.refresh.keys,obsolete:'old'}};assert(workspaceResponse(publicData,{action:'read',known:stale}).removed.includes('obsolete'));
 assert(!workspaceResponse(publicData,{action:'read',known:{...stale,contract:'unknown'}}).delta);
 const english={...publicData,experience:{locale:'en',revision:1}};assert(!workspaceResponse(english,{action:'read',known:publicView.refresh}).delta,'Language change replaces the entire response');
 const firstAudience=workspaceResponse(publicData,{action:'read'},'first');assert(!workspaceResponse(publicData,{action:'read',known:firstAudience.refresh},'second').delta,'Same display name cannot reuse another identity scope');
 console.log(JSON.stringify({test:'authorized meeting response',readModelQueries:{before:legacyQueries,after:snapshotQueries,additionalFormerProgressQuery:1},largeFixtureBytes:{full:full.bytes,unchanged:compact.bytes},checks:'same-view equivalence, task/delivery/name changes without revision, recipient isolation, revoked identity/share, fallback and no LINE writes'}));
}finally{globalThis.fetch=nativeFetch;await f.pg.close();}

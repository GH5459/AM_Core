import assert from 'node:assert/strict';
import {Readable,Writable} from 'node:stream';
import http from 'node:http';
import {audioTickets,readerData} from '../modules/meetings/workspace-access.js';
const nativeFetch=globalThis.fetch;
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
const r=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0],id=r.id,host=r.host_id;
async function api(input,token='host'){
 let status=200,body='';const req=Readable.from([JSON.stringify(input)]);req.method='POST';req.headers={...(token?{authorization:'Bearer '+token}:{}),origin:f.platform.publicBaseUrl};
 await f.service.handle(req,{setHeader(){},get headersSent(){return false;},writeHead(s){status=s;},set statusCode(s){status=s;},end(v){body=v;}},new URL(f.platform.publicBaseUrl+'/meetings/review/work/'+id+'/api'));return {status,value:JSON.parse(body)};
}
assert.equal((await api({action:'read'},'')).status,401);
assert.equal((await api({action:'sharing',enabled:true,revision:Number(r.revision)},'member')).status,403);
let result=await api({action:'sharing',enabled:true,revision:Number(r.revision),version:0});assert.equal(result.status,200);assert(result.value.sharing.enabled);
const publicRead=await api({action:'read'},'');assert.equal(publicRead.status,200);assert.equal(publicRead.value.access,'public');assert(publicRead.value.reader.record);
for(const secret of [r.host_id,r.conversation_key,r.message_id,'整理要求'])assert(!JSON.stringify(publicRead.value).includes(secret));assert(!publicRead.value.workspace.fields);assert(!publicRead.value.presence);assert(!publicRead.value.types);
for(const action of ['members','history','sharing','edit','revise','publish'])assert.equal((await api({action},'')).status,401);
const snapshot=await f.service.store.get(id),ticket=publicRead.value.audioUrl.split('ticket=')[1],audio=audioTickets(f.platform.publicLinkSecret);
assert.equal(audio.verify(snapshot,decodeURIComponent(ticket)),'public');
// Exercise the actual streaming route over HTTP, including the browser's Range
// request, rather than only testing ticket helpers or loading a full Blob.
let forwardedRange='',upstreamReads=0;const fixtureFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{if(String(url).includes('googleapis.com')){upstreamReads++;forwardedRange=options.headers.Range||'';return new Response(new Uint8Array([2,3]),{status:206,headers:{'content-type':'audio/mp4','content-range':'bytes 1-2/3','content-length':'2','accept-ranges':'bytes'}});}return fixtureFetch(url,options);};
const server=http.createServer((req,res)=>f.service.handle(req,res,new URL(req.url,f.platform.publicBaseUrl)).catch(()=>res.end()));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const audioUrl='http://127.0.0.1:'+server.address().port+'/meetings/review/work/'+id+'/audio?ticket='+ticket;
let playback=await nativeFetch(audioUrl,{headers:{Range:'bytes=1-2'}});assert.equal(playback.status,206);assert.equal(playback.headers.get('content-range'),'bytes 1-2/3');assert.equal((await playback.arrayBuffer()).byteLength,2);assert.equal(forwardedRange,'bytes=1-2');assert.equal(upstreamReads,1);
assert.equal((await nativeFetch(audioUrl,{headers:{Range:'bytes=bad'}})).status,416);assert.equal(upstreamReads,1);
assert.throws(()=>audio.verify({...snapshot,id:'b'.repeat(64)},decodeURIComponent(ticket)),/失效/);
assert.throws(()=>audio.verify(snapshot,decodeURIComponent(ticket)+'x'),/失效/);
const exp=audioTickets(f.platform.publicLinkSecret,()=>1000).mint(snapshot,host);assert.throws(()=>audioTickets(f.platform.publicLinkSecret,()=>1900000).verify(snapshot,exp),/失效/);
assert.equal((await api({action:'sharing',enabled:false,revision:Number(snapshot.revision),version:0})).status,409);
result=await api({action:'sharing',enabled:false,revision:Number(snapshot.revision),version:1});assert.equal(result.status,200);
assert.equal((await nativeFetch(audioUrl)).status,403);assert.equal(upstreamReads,1);await new Promise(resolve=>server.close(resolve));globalThis.fetch=fixtureFetch;
assert.equal((await api({action:'read'},'')).status,401);assert.equal((await api({action:'read'},'outside')).status,403);
assert.throws(()=>audio.verify({...snapshot,sharing_enabled:false,sharing_version:Number(snapshot.sharing_version)+1},decodeURIComponent(ticket)),/失效/);

let current=await f.service.store.get(id),fields=structuredClone(current.fields);delete fields.settings;fields.record='主持人修訂後的完整內容\n保留來源證據';const todo=Object.keys(fields).find(k=>k.startsWith('todo:'));fields[todo].content='修訂後的同一項任務';fields[todo].due='2026-11-01';
assert.equal((await api({action:'revise',fields,revision:Number(current.revision)},'member')).status,403);
f.row.enabled=false;assert.equal((await api({action:'revise',fields,revision:Number(current.revision)})).status,409);f.row.enabled=true;
assert.equal((await api({action:'revise',fields,revision:Number(current.revision)-1})).status,409);
assert.equal((await api({action:'revise',fields:{record:'缺少完整內容'},revision:Number(current.revision)})).status,400);
let revisionCalls=0;f.platform.publishMeetingTasks=async input=>{assert.equal(input.id,id);assert.equal(input.previousFields.record,current.fields.record);assert.equal(input.fields[todo].due,'2026-11-01');revisionCalls++;if(revisionCalls===1)throw Error('reply_lost_after_task_commit');return {tasks:[{id:'same-task',owner:'222',due:'2026-11-01'}]};};
result=await api({action:'revise',fields,revision:Number(current.revision)});assert.equal(result.status,200);await f.service.drain();await f.service.settle();
assert.equal((await f.service.store.get(id)).fields.record,current.fields.record,'Prior published content stays visible while sync is incomplete');
const pending=await f.pg.query("SELECT * FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending'",[id]);assert.equal(pending.rows.length,1);
assert.equal((await api({action:'sharing',enabled:true,revision:Number(current.revision),version:2})).status,200);
assert.equal((await api({action:'sharing',enabled:false,revision:Number(current.revision),version:3})).status,200,'Revocation must work while revision synchronization is pending');
assert.equal((await api({action:'read'},'')).status,401);
for(let i=0;i<3;i++){await f.pg.query("UPDATE central_archive.meeting_workspace_revisions SET lease_until=NULL WHERE workspace_id=$1 AND state='pending'",[id]);await f.service.drain();await f.service.settle();}
const revised=await f.service.store.get(id);assert.equal(revised.fields.record,fields.record);assert.equal(revised.fields[todo].due,'2026-11-01');assert.equal(Number(revised.revision),Number(current.revision)+1);assert.equal(revised.receipt.notionId,current.receipt.notionId);assert.equal(revisionCalls,2);
assert.equal((await f.pg.query("SELECT count(*) AS n FROM central_archive.meeting_workspace_revisions WHERE state='applied'")).rows[0].n,1);
const text=f.pages.get('fixture-page').children.map(b=>b.paragraph.rich_text[0].text.content);assert.equal(text.filter(s=>s.startsWith('會議修訂 ')).length,1);assert(text.includes(current.fields.record));assert(text.includes(fields.record));
assert.equal((await api({action:'revise',fields,revision:Number(current.revision)})).status,409);assert.equal(f.taskIds.size,1);
assert.equal(readerData(revised).todos[0].owner,'編輯者');
const history=(await api({action:'history'})).value.history;assert(history.some(h=>h.field==='sharing'&&h.before_value===true&&h.after_value===false));assert(history.some(h=>h.field==='published_revision'&&h.after_value.record===fields.record));
// Public opt-in never exposes setup or in-progress drafts, including personal meetings.
await f.pg.query("UPDATE central_archive.meeting_workspaces SET state='review',sharing_enabled=true WHERE id=$1",[id]);assert.equal((await api({action:'read'},'')).status,401);
await f.pg.close();console.log('Reader sharing and revisions: default-private, host-only opt-in/revocation, public response minimization, no guest mutations, scoped expiring audio tickets, stale host edits, durable revision retry, preserved original Notion page/task IDs and prior snapshot passed.');

import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {JSDOM} from 'jsdom';
import {hubHtml} from '../modules/meetings/hub-ui.js';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const r=(await f.pg.query('SELECT * FROM central_archive.meeting_workspaces ORDER BY id LIMIT 1')).rows[0],todo='todo:11111111-1111-4111-8111-111111111111';
const fields={...r.fields,[todo]:{content:'合成任務',ownerId:f.host,due:'2026-10-19'}};
await f.pg.query("UPDATE central_archive.meeting_workspaces SET state='published',fields=$2::jsonb,receipt=receipt||$3::jsonb WHERE id=$1",[r.id,JSON.stringify(fields),JSON.stringify({tasksSaved:true,taskTenant:'fixture'})]);
let status='done';f.platform.readMeetingTaskProgress=async()=>({contract:'meeting-live-task-progress-v1',items:[{todoId:todo,status,due:'2026-10-19',result:'私人成果不得進入清單',hasEvidence:true,url:'https://private.example/task'}]});
async function api(v,token='host'){let code=200,body;const req=Readable.from([Buffer.from(JSON.stringify(v))]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:f.platform.publicBaseUrl};const res={setHeader(){},writeHead(s){code=s;},set statusCode(s){code=s;},get statusCode(){return code;},end(v){body=JSON.parse(v);}};await f.service.handle(req,res,new URL(f.platform.publicBaseUrl+'/meetings/review/hub/api'));return {code,...body};}
try{
 const before=await f.service.store.get(r.id);
 let p=await api({action:'task-progress',id:r.id});assert.equal(p.code,200);assert.equal(p.progress.counts.done,1);assert(!JSON.stringify(p).includes('private.example'));assert(!JSON.stringify(p).includes('私人成果'));assert(!p.progress.items);
 status='in_progress';p=await api({action:'task-progress',id:r.id});assert.equal(p.progress.counts.done,0);assert.equal(p.progress.counts.in_progress,1);assert.equal(p.progress.counts.overdue,1);
 assert.equal((await api({action:'task-progress',id:r.id},'outsider')).code,403);
 await f.pg.query('UPDATE central_archive.meeting_workspaces SET shared_people=$2::jsonb WHERE id=$1',[r.id,JSON.stringify([{tenantKey:'fixture',account:'333'}])]);assert.equal((await api({action:'task-progress',id:r.id},'outsider')).code,200);
 await f.pg.query("UPDATE central_archive.meeting_workspaces SET shared_people='[]'::jsonb WHERE id=$1",[r.id]);assert.equal((await api({action:'task-progress',id:r.id},'outsider')).code,403);
 assert.equal((await api({action:'task-progress',id:'x'})).code,400);
 assert.equal((await api({action:'task-progress',id:'f'.repeat(64)})).code,404);
 const list=await api({action:'list'});assert.equal(list.items.find(x=>x.id===r.id).taskTotal,1);
 const after=await f.service.store.get(r.id);assert.deepEqual(after.fields,before.fields);assert.equal(after.revision,before.revision);
 // Execute actual shipped hub HTML with delayed reads: the list must render first.
 const dom=new JSDOM(hubHtml({liffId:'fixture'}),{url:'https://fixture.example/meetings/review/hub',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,timers=[];
 w.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'fixture'};w.setInterval=fn=>timers.push(fn);
 let unavailable=false,done=2,resolveRead,reads=0;
 w.fetch=async(url,o)=>{const v=JSON.parse(o.body);let value={ok:true};
  if(v.action==='list')value={items:[{date:'2026-10-19',id:r.id,topic:'合成會議 <安全文字>',host:'主持人',state:'published',start:'2026-10-19',url:'/original',taskTotal:6}],next:null};
  if(v.action==='calendar-week')value={items:[]};
  if(v.action==='task-progress'){reads++;if(reads===1)await new Promise(resolve=>{resolveRead=resolve;});if(unavailable)return {ok:false,json:async()=>({error:'暫時失敗'})};value={progress:{available:true,checkedAt:'2026-10-20T02:30:00Z',counts:{total:6,done,in_progress:1,blocked:1,pending_confirmation:1,overdue:1}}};}
  return {ok:true,json:async()=>value};
 };
 for(const script of w.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 const tick=async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate);};await tick();
 const el=()=>w.document.querySelector('[data-progress-id]');assert(el());assert.equal(el().textContent,'📋 6　✅ …');assert(w.document.querySelector('#status').textContent.startsWith('已讀取'));
 resolveRead();await tick();assert(el().textContent.includes('✅ 2'));assert(el().textContent.includes('🔎 1'));assert(el().textContent.includes('⛔ 1'));assert(el().title.includes('更新：'));assert(!w.document.querySelector('.meeting-info script'));
 assert.equal(timers.length,0,'No recurring status refresh');assert.equal(reads,1,'Same meeting in shared and own lists reads once');
 done=3;w.document.dispatchEvent(new w.Event('visibilitychange'));await tick();assert.equal(reads,1,'Switching back to the page does not refresh');assert(el().textContent.includes('✅ 2'));
 await w.document.querySelector('#refresh').onclick();await tick();assert.equal(reads,2);assert(el().textContent.includes('✅ 3'));
 unavailable=true;await w.document.querySelector('#refresh').onclick();await tick();assert(el().textContent.includes('✅ —'));assert(!el().textContent.includes('✅ 3'));
 unavailable=false;await w.document.querySelector('#refresh').onclick();await tick();assert(el().textContent.includes('✅ 3'));const readsBeforeReopen=reads;
 const reopened=new JSDOM(hubHtml({liffId:'fixture'}),{url:'https://fixture.example/meetings/review/hub',runScripts:'outside-only',pretendToBeVisual:true});reopened.window.liff=w.liff;reopened.window.fetch=w.fetch;reopened.window.setInterval=()=>{throw Error('Unexpected recurring refresh');};for(const script of reopened.window.document.querySelectorAll('script:not([src])'))reopened.window.eval(script.textContent);await tick();assert.equal(reads,readsBeforeReopen+1);assert(reopened.window.document.querySelector('[data-progress-id]').textContent.includes('✅ 3'));reopened.window.close();dom.window.close();
 console.log('Meeting list: read-only source counts, live reopening/overdue, private evidence omitted, access/share/revocation, no blocked list rendering, emoji summary, one read per meeting per opening, no timer or focus refresh, explicit refresh/failure/recovery and reopening passed.');
}finally{await f.pg.close();}

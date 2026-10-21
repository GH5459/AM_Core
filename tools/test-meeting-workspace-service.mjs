import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createMeetingWorkspace} from '../modules/meetings/workspace-service.js';
import {meetingToday} from '../modules/meetings/workspace-model.js';
const pg=new PGlite(),originalFetch=globalThis.fetch;
for(const f of ['core/central-archive/schema.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
await pg.exec("CREATE FUNCTION pg_try_advisory_lock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true'; CREATE FUNCTION pg_advisory_unlock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true';");
const pool={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})},bot='U'+'b'.repeat(32),host='U'+'1'.repeat(32),member='U'+'2'.repeat(32),outsider='U'+'3'.repeat(32),group='C'+'c'.repeat(32),key='a'.repeat(64);
const row={key,bot_id:bot,source_kind:'group',source_id:group,enabled:true,display_name:'合成測試對話',connection_state:'active'};
await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,bot,'group',group]);
const pushes=[],pages=new Map(),taskIds=new Set(),identityCalls=[];let createLost=true,taskLost=true,foreign=false,idsUnavailable=false,missingIdentity=false,revisionLost=false;
globalThis.fetch=async(url,opts)=>{
 if(String(url).startsWith('https://api.line.me/oauth2/v2.1/verify'))return Response.json({client_id:'123',expires_in:3600});
 if(String(url)==='https://api.line.me/v2/profile'){const token=opts.headers.Authorization.slice(7);return Response.json({userId:token==='member'?member:token==='outside'?outsider:host,displayName:token==='member'?'編輯者':'主持人'});}
 if(String(url).includes('googleapis.com'))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mp4'}});
 throw Error('Unexpected external request');
};
const workId=id=>({userId:id,account:id===host?'111':'222',bindingId:'binding-'+id,name:id===host?'主持人':'編輯者',tenantKey:'fixture'});
const platform={publicBaseUrl:'https://meeting.example.test',publicLinkSecret:'synthetic-audio-secret-not-production',drive:{getAccessToken:async()=> 'fixture'},lineGet:async path=>{
 if(path.endsWith('/summary'))return {groupId:group};
 if(path.includes('/members/ids')){if(idsUnavailable)throw Error('unavailable');return {memberIds:[host,member]};}
 const userId=path.split('/').at(-1);if(userId===outsider||foreign&&userId===member)throw Error('not_member');return {userId,displayName:userId===host?'主持人':'編輯者'};
},pushLineMessage:async(to,message,mention,delivery)=>pushes.push({to,message,key:delivery.retryKey}),meetingTaskIdentity:async id=>{identityCalls.push(id);return missingIdentity?null:workId(id);},meetingTaskDirectory:async()=>[{userId:member},{userId:outsider}],publishMeetingTasks:async input=>{
 for(const t of input.preparedPayload.tasks)taskIds.add(input.preparedPayload.id+':'+t.id);
 if(taskLost){taskLost=false;throw Error('reply_lost_after_commit');}return {tasks:[...taskIds]};
}};
async function request(path,method='GET',body){
 if(path.includes('/query'))return {results:[...pages.values()].filter(p=>p.marker===body.filter.rich_text.equals)};
 if(path==='/pages'&&method==='POST'){const page={id:'fixture-page',marker:body.properties['來源識別'].rich_text[0].text.content,children:[]};pages.set(page.id,page);if(createLost){createLost=false;throw Error('response_lost');}return page;}
 const page=pages.get('fixture-page');if(path.includes('/children')&&method==='GET')return {results:page.children,has_more:false};
 if(path.includes('/children')&&method==='PATCH'){page.children.push(...body.children);if(revisionLost&&body.children.some(b=>b.paragraph.rich_text[0].text.content.startsWith('會議修訂 '))){revisionLost=false;throw Error('revision_reply_lost');}return {};}
 throw Error('Unexpected Notion');
}
const env={AMCORE_PUBLIC_BASE_URL:platform.publicBaseUrl};
const meetingConfig={liffId:'123-fixture'};
const service=createMeetingWorkspace({pool,botId:bot,platform,env,archive:{original:async()=>({file:{id:'file',size:3,webViewLink:'https://drive.google.com/file/d/fixture/view'}})},
 context:async()=>({tenant:{key:'fixture'}}),tenantFor:()=>({config:{meetings:meetingConfig}}),getConversation:async()=>row,ensureDatabase:async()=>({dbId:'fixture-db'}),request,
 meetingModule:{generateWorkspace:async()=>({parsed:{highlights:['合成摘要'],minutes:[{heading:'討論',points:['保留依據']}],conclusions:['確認'],todos:[{content:'檢查資料',owner:'編輯者',due:'2026-10-25'}]},diarized:'[00:01] 主持人：請檢查資料',segments:[{start:1000,speaker:'主持人',text:'請檢查資料'}],warning:''})},logger:{warn(){}}});
const event={source:{type:'group',groupId:group,userId:host},message:{id:'fixture-recording',type:'audio'},timestamp:Date.now()};
let r=await service.offer(row,event,'fixture.m4a','主持人'),id=r.id;
assert.equal(pushes[0].message.template.actions[0].data,'meetingwork:yes:'+id);
await service.offer(row,event,'fixture.m4a','主持人');assert.equal(pushes.length,1);
await service.choice({source:{...event.source,userId:member},postback:{data:'meetingwork:yes:'+id}},key);assert.equal((await service.store.get(id)).state,'offered');
await service.choice({source:event.source,postback:{data:'meetingwork:yes:'+id}},key);assert.equal((await service.store.get(id)).state,'setup');assert(pushes[1].message.includes('/meetings/review/work/'+id));
async function api(input,token='host',origin=platform.publicBaseUrl){let status=200,encoded='';const req=Readable.from([JSON.stringify(input)]);req.method='POST';req.headers={authorization:'Bearer '+token,origin};const res={headersSent:false,setHeader(){},writeHead(s){status=s;},set statusCode(s){status=s;},get statusCode(){return status;},end(v){encoded=v;}};await service.handle(req,res,new URL(platform.publicBaseUrl+'/meetings/review/work/'+id+'/api'));return {status,value:JSON.parse(encoded)};}
async function page(origin,path='/meetings/review/work/'+id){const headers={};let status=200,html='';const handled=await service.handle({method:'GET',headers:{host:new URL(origin).host}},{writeHead(v,h){status=v;Object.assign(headers,h);},setHeader(k,v){headers[k]=v;},set statusCode(v){status=v;},get statusCode(){return status;},end(v){html=v||'';}},new URL(origin+path));return {status,headers,html,handled};}
assert.equal((await page(platform.publicBaseUrl)).status,200);
meetingConfig.liffEndpointUrl='https://registered.example.test/meetings/review';
const moved=await page(platform.publicBaseUrl);assert.equal(moved.status,302);assert.equal(moved.headers.Location,'https://registered.example.test/meetings/review/work/'+id);assert.equal(moved.headers['Cache-Control'],'no-store');
const canonical=await page('https://registered.example.test');assert.equal(canonical.status,200);assert(canonical.html.includes('123-fixture'));assert(!canonical.headers.Location);
assert(canonical.html.includes('"loginUrl":"https://registered.example.test/meetings/review/work/'+id+'"'));
assert(canonical.html.indexOf('location.replace(BOOT.loginUrl)')<canonical.html.indexOf('if(!BOOT.publicAvailable&&!await login())'));
const primary=await page('https://registered.example.test','/meetings/review?liff.state='+encodeURIComponent('/work/'+id));assert.equal(primary.handled,true);assert.equal(primary.status,200);assert.equal(primary.html,canonical.html);assert(!primary.headers.Location);
assert(primary.html.includes("'/meetings/review/work/'+BOOT.id+'/api'"));assert(primary.html.includes('preload="metadata"'));assert(!primary.html.includes("location.pathname+'/api'"));
assert.equal((await page('https://registered.example.test','/meetings/review?liff.state='+encodeURIComponent('/work/'+id+'/api'))).handled,false);
assert.equal((await page('https://registered.example.test','/meetings/review?liff.state='+encodeURIComponent('//foreign.test/work/'+id))).handled,false);
assert.equal((await api({action:'read'},'host','https://registered.example.test')).status,200);
assert.equal((await api({action:'read'},'outside','https://registered.example.test')).status,403);
meetingConfig.liffEndpointUrl='http://unsafe.example.test/meetings/review';assert.equal((await page(platform.publicBaseUrl)).status,503);
delete meetingConfig.liffEndpointUrl;
env.AMCORE_MEETINGS_LIFF_ENDPOINT_URL='https://registered.example.test/meetings/review';
assert.equal((await page(platform.publicBaseUrl)).headers.Location,'https://registered.example.test/meetings/review/work/'+id);
assert.equal((await page('https://registered.example.test')).html,canonical.html);
delete env.AMCORE_MEETINGS_LIFF_ENDPOINT_URL;
assert.equal((await api({action:'read'},'outside')).status,403);assert.equal((await api({action:'read'},'host','https://foreign.test')).status,403);
let v=(await api({action:'read'})).value;const settings={...v.workspace.fields.settings,topic:'共同確認測試',projectGoal:'準確追蹤事項'};
assert.equal((await api({action:'edit',field:'settings',value:settings,version:0},'member')).status,200);
v=(await api({action:'read'})).value;assert.equal((await api({action:'start',revision:v.workspace.revision},'member')).status,403);
assert.equal((await api({action:'start',revision:v.workspace.revision})).status,200);await service.drain();await service.settle();
for(let n=0;n<5&&(await service.store.get(id)).state==='processing';n++){await new Promise(setImmediate);await service.settle();}
r=await service.store.get(id);assert.equal(r.state,'review');const todo=Object.keys(r.fields).find(k=>k.startsWith('todo:'));assert.equal(r.fields[todo].ownerId,'');assert.equal(r.fields[todo].due,meetingToday());
assert.equal((await api({action:'edit',field:todo,value:{...r.fields[todo],ownerId:member,due:'2026-10-25'},version:1},'member')).status,200);
v=(await api({action:'members'})).value;assert.equal(v.members.people.length,2);assert(v.members.complete);
idsUnavailable=true;v=(await api({action:'members'})).value;assert.equal(v.members.people.length,2);assert.equal(v.members.complete,false);
v=(await api({action:'read'})).value;assert.equal((await api({action:'publish',revision:v.workspace.revision},'member')).status,403);
identityCalls.length=0;assert.equal((await api({action:'publish',revision:v.workspace.revision-1})).status,409);assert.equal(identityCalls.length,0);
missingIdentity=true;
assert.equal((await api({action:'publish',revision:v.workspace.revision})).status,200);
for(let n=0;n<3;n++){
 await service.drain();await service.settle();await new Promise(setImmediate);
 await pg.query("UPDATE central_archive.meeting_workspaces SET lease_until=NULL WHERE id=$1 AND state='publishing'",[id]);
}
await service.drain();await service.settle();r=await service.store.get(id);assert.equal(r.state,'published');assert.equal(pages.size,1);assert.equal(taskIds.size,0,'Missing UOF binding must not block publication');
await service.taskDispatch.run(id);assert.equal((await api({action:'read'})).value.assignment.items[0].state,'pending');
missingIdentity=false;await service.taskDispatch.run(id);await service.taskDispatch.run(id);assert.equal(taskIds.size,1);assert.equal((await api({action:'read'})).value.assignment.items[0].state,'delivered');
assert.equal(r.fields[todo].due,'2026-10-25');assert.equal((await api({action:'publish',revision:v.workspace.revision})).status,200);assert.equal(taskIds.size,1);
const blocks=pages.get('fixture-page').children.map(b=>b.paragraph.rich_text[0].text.content);assert.equal(blocks.filter(s=>s==='會議記錄').length,1);assert(blocks.some(s=>s.includes('編輯者')));assert.equal(pushes.filter(p=>p.key==='workspace-published:'+id).length,1);
assert.equal((await api({action:'edit',field:'record',value:'舊頁偷改',version:1})).status,409);
foreign=true;assert.equal((await api({action:'read'},'member')).status,403);
if(!process.env.MEETING_WORKSPACE_PREVIEW){globalThis.fetch=originalFetch;await pg.close();}
export const fixture={service,pool,pg,platform,row,event,env,pages,taskIds,pushes,resetMembership:()=>{foreign=false;},loseRevision:()=>{revisionLost=true;}};
console.log('Full workspace service: LINE offer/host consent, current member auth, foreign-origin refusal, generation without publication, roster fallback, host immutable publication, lost Notion create and task-response recovery without duplicates passed.');

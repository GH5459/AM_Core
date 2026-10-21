import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createCentralArchive} from '../core/central-archive/index.js';
import {digest} from '../core/central-archive/store.js';
import {createConversationMeetings} from '../modules/meetings/conversation-service.js';
import {keyFor} from '../modules/meetings/conversation-store.js';
import {managementSignature,verifyManagementRequest} from '../modules/meetings/management-auth.js';
import {meetingManagementProxy,meetingManagementRoute} from '../modules/meetings/management-proxy.mjs';
import {resolveMeetingRolloutPolicy} from '../modules/meetings/policy.js';
import meetings,{__test} from '../modules/meetings/index.js';
const pg=new PGlite();
await pg.exec(fs.readFileSync(new URL('../core/central-archive/schema.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../modules/meetings/conversations.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../modules/meetings/workspace.sql',import.meta.url),'utf8'));
await pg.exec(`CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT';
 CREATE FUNCTION pg_try_advisory_lock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true';
 CREATE FUNCTION pg_advisory_unlock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true';`);
const pool={query:(...args)=>pg.query(...args),connect:async()=>({...pool,release(){}})};
const bot='U'+'1'.repeat(32),user='U'+'2'.repeat(32),group='C'+'3'.repeat(32),room='R'+'4'.repeat(32);
const parent='1'.repeat(32),secret='synthetic-only-secret-'.repeat(3),tenant={key:'sample',runtimeEnabled:true,modules:['meetings'],config:{meetings:{formalTasksEnabled:false}}};
const event=(type,sourceKind='user',msg='a1')=>({type:'message',timestamp:Date.now(),webhookEventId:msg,source:{type:sourceKind,...sourceKind==='user'?{userId:user}:sourceKind==='group'?{groupId:group,userId:user}:{roomId:room,userId:user}},message:{id:msg,type,...type==='text'?{text:'會議主題與本人'}:{}},replyToken:'NEVER_PERSIST',deliveryContext:{isRedelivery:false}});
for(const kind of ['user','group','room']){const e=event('audio',kind),key=keyFor(bot,e.source);await pool.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id,display_name) VALUES($1,$2,$3,$4,$5)',[key,bot,kind,e.source.groupId||e.source.roomId||user,'synthetic '+kind]);}
const memory=new Set(),calls=[],dbs=new Map(),pages=new Map();let sequence=10;
const request=async(path,method='GET',body)=>{
 calls.push({path,method,body});
 if(path.startsWith('/blocks/'))return {results:[...dbs.values()].map(d=>({id:d.id,type:'child_database',child_database:{title:d.title[0].text.content}}))};
 if(path==='/databases'&&method==='POST'){const n=String(sequence++).padStart(32,'0'),d={id:n,parent:body.parent,title:body.title,description:body.description,data_sources:[{id:'source-'+n}]};dbs.set(n,d);return d;}
 if(path.startsWith('/databases/'))return dbs.get(path.slice(11));
 if(path.startsWith('/pages/'))return pages.get(path.slice(7))||{parent:{data_source_id:'unrelated'}};
 throw Error('Unexpected Notion path '+path);
};
const archive={pool,config:{botId:bot},notion:{request},original:async(messageId,source)=>{assert.equal(typeof messageId,'string');assert(source.userId||source.groupId);return {file:{webViewLink:'https://drive.google.com/file/d/synthetic/view'}};}};
const platform={lineGet:async path=>path.endsWith('/summary')?{groupId:path.split('/')[4]}:{count:2},registerTenantDataSource:async(t,ds)=>{assert.equal(t.parentPageId,parent);assert(ds.startsWith('source-'));},resolveSenderName:async()=> '本人'};
const mod={isAudio:m=>m?.type==='audio',hasPending:(t,id)=>memory.has(id),onAudio:async ctx=>{calls.push({audio:ctx.groupId});memory.add(ctx.groupId);await platform.saveMeetingPending({tenant:ctx.tenant,archiveSource:ctx,filename:ctx.filename,createdAt:ctx.createdAt||Date.now()});},onMessage:async ctx=>{calls.push({roster:ctx.groupId});await platform.completeMeetingPending(ctx.tenant,'processing');memory.delete(ctx.groupId);await platform.completeMeetingPending(ctx.tenant,'completed');}};
const env={AMCORE_CONVERSATION_MEETINGS_ENABLED:'1',AMCORE_MEETINGS_PARENT_PAGE_ID:parent,AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETING_WORKSPACE_CUTOVER_AT:'9999999999999'};
let resolvedRoute={};
const service=createConversationMeetings({env,archive,platform,router:{resolveGroupBinding:async()=>resolvedRoute},tenants:[tenant],meetingModule:mod});
await service.store.seed();assert.equal((await service.store.list()).length,3);assert((await service.store.list()).every(r=>!r.enabled&&r.todo_mode==='record_only'));
// Read the signed management API: lifecycle changes hide options, not history.
async function readOptions(){const path='/integrations/meeting-management/conversations',timestamp=String(Date.now()),actor='123';let output,status;const headers={'x-meeting-time':timestamp,'x-meeting-actor':actor,'x-meeting-signature':managementSignature(secret,{method:'GET',path,timestamp,actor})};await service.handle({method:'GET',url:path,headers},{setHeader(){},writeHead(s){status=s;},set statusCode(s){status=s;},end(v){output=JSON.parse(v);}},new URL('https://example.test'+path));assert.equal(status,200);return output.conversations;}
assert.equal((await readOptions()).length,3);
const optionGroupKey=keyFor(bot,event('audio','group').source);
await pg.query("UPDATE central_archive.meeting_settings SET connection_state='left' WHERE conversation_key=$1",[optionGroupKey]);assert.equal((await readOptions()).length,2);assert.equal((await service.store.list()).length,3);
await pg.query("UPDATE central_archive.meeting_settings SET connection_state='active' WHERE conversation_key=$1",[optionGroupKey]);assert.equal((await readOptions()).length,3);
const liveRead=platform.lineGet;platform.lineGet=async()=>{throw Object.assign(Error('missing'),{lineStatus:404});};assert.equal((await readOptions()).length,1,'missing groups hidden; private conversation retained');platform.lineGet=liveRead;
const key=keyFor(bot,event('audio').source),input={key,enabled:true,todoMode:'record_only',tenantKey:'',version:1,operationId:'operation-0000000001'};
const result=await service.store.change(input,'123');assert.equal(result.version,2);assert.deepEqual(await service.store.change(input,'123'),result);
await assert.rejects(()=>service.store.change({...input,enabled:false},'123'),/操作識別/);
await assert.rejects(()=>service.store.change({...input,operationId:'different-00000001'},'123'),/設定已被更新/);
const target=await service.ensureDatabase(await service.store.get(key));await service.ensureDatabase(await service.store.get(key));assert.equal(dbs.size,1);
assert.equal((await platform.archiveConversationMeetingAudio({event:event('audio')})),'https://drive.google.com/file/d/synthetic/view');
// Exercise the real central archive adapter too: its argument contract and
// same-conversation verification must agree with meeting intake.
const originalFetch=global.fetch;let central;
try{
 global.fetch=async()=>Response.json({id:'synthetic-root-folder',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}});
 central=await createCentralArchive({env:{AMCORE_CENTRAL_ARCHIVE_ENABLED:'1',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot,AMCORE_CENTRAL_ARCHIVE_NOTION_PARENT_PAGE_ID:parent,AMCORE_CENTRAL_ARCHIVE_DRIVE_ROOT_FOLDER_ID:'synthetic-root-folder',NOTION_TOKEN:'synthetic'},pool,
  line:{configured:true,lineGet:async()=>({userId:bot}),setArchiveObserver(){}},drive:{configured:true,getAccessToken:async()=> 'synthetic',verifyAttachment:async(file,folder)=>{assert.equal(file,'synthetic-file');assert.equal(folder,'synthetic-folder');return {id:file,webViewLink:'https://drive.google.com/file/d/synthetic/view'};}},notion:{request:async()=>({})},logger:{warn(){},error(){}}});
 await pool.query('UPDATE central_archive.conversations SET drive_folder_id=$2 WHERE key=$1',[key,'synthetic-folder']);
 await pool.query(`INSERT INTO central_archive.jobs(key,conversation_key,event_at,payload,state,result) VALUES($1,$2,now(),'{}','completed',$3::jsonb)`,['in:'+digest(bot+':message:real-adapter'),key,JSON.stringify({driveId:'synthetic-file',size:100,md5:'synthetic-md5'})]);
 archive.original=central.original;
 assert.equal(await platform.archiveConversationMeetingAudio({event:event('audio','user','real-adapter')}),'https://drive.google.com/file/d/synthetic/view');
 await assert.rejects(()=>platform.archiveConversationMeetingAudio({event:event('audio','group','real-adapter')}),/source_mismatch/);
}finally{global.fetch=originalFetch;await central?.close();}
pages.set('private-page',{parent:{data_source_id:target.dbId}});const owner=await platform.resolveConversationMeetingOwner('private-page');assert.equal(owner.config.meetings.conversationOwnerId,user);
assert.equal((await service.capture([event('audio','group','disabled')])).length,1);assert.equal((await pool.query('SELECT * FROM central_archive.meeting_events')).rows.length,0);
await service.capture([event('audio')]);await service.capture([event('text','user','roster1')]);await service.drain();assert.equal(calls.filter(c=>c.audio).length,1);assert.equal(calls.filter(c=>c.roster).length,1);
await service.capture([event('audio')]);await service.drain();assert.equal(calls.filter(c=>c.audio).length,1,'Redelivery must not process twice');
await service.capture([event('audio','user','a2')]);await service.drain();memory.clear();await service.drain();assert(memory.has(user),'Wait restored after memory loss');
assert(!(JSON.stringify((await pool.query('SELECT payload FROM central_archive.meeting_events')).rows).includes('NEVER_PERSIST')));
assert.equal(resolveMeetingRolloutPolicy({tenant,binding:{status:'停用',meetingEnabled:true,meetingMode:'record_only'}}).enabled,false);
assert.equal(resolveMeetingRolloutPolicy({tenant,binding:{status:'啟用',meetingEnabled:false,meetingMode:'review_only'}}).enabled,false);
const groupKey=keyFor(bot,event('audio','group').source);await pool.query("UPDATE central_archive.meeting_settings SET enabled=true,tenant_key='sample' WHERE conversation_key=$1",[groupKey]);resolvedRoute={tenant:{key:'foreign'},binding:{projectPageId:'foreign-project'}};const beforeAudio=calls.filter(c=>c.audio).length;await service.capture([event('audio','group','wrong-owner')]);await service.drain();await service.settle();assert.equal(calls.filter(c=>c.audio).length,beforeAudio,'A changed tenant must not supply project context to the old owner');assert.equal((await pool.query("SELECT state FROM central_archive.meeting_events WHERE payload->'message'->>'id'='wrong-owner'")).rows[0].state,'failed');resolvedRoute={};
const path='/integrations/meeting-management/conversations',timestamp=String(Date.now()),body=JSON.stringify(input),actor='123';
const req={method:'PUT',url:path,headers:{'x-meeting-time':timestamp,'x-meeting-actor':actor,'x-meeting-signature':managementSignature(secret,{method:'PUT',path,timestamp,actor,body})}};
assert(verifyManagementRequest(secret,req,body));assert(!verifyManagementRequest(secret,req,body+' '));assert(!verifyManagementRequest(secret,req,body,Date.now()+120000));
let forwarded;
const proxy=await meetingManagementProxy(new Request('https://internal/api/meeting-management/conversations',{method:'PUT',body,headers:{Cookie:'NEVER_FORWARD'}}),{AMCORE_MEETING_MANAGEMENT_SECRET:secret},actor,{fetchImpl:async(url,options)=>{forwarded=options;assert(verifyManagementRequest(secret,{method:options.method,url:new URL(url).pathname,headers:options.headers},options.body));return Response.json({ok:true});}});
assert.equal(proxy.status,200);assert(!Object.keys(forwarded.headers).some(h=>h.toLowerCase()==='cookie'));
const proxyRequest=()=>new Request('https://internal/api/meeting-management/conversations');
let originCalls=0;
const originEnv={AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETING_MANAGEMENT_ORIGIN:'https://upstream.example.test'};
assert.equal((await meetingManagementProxy(proxyRequest(),originEnv,actor,{fetchImpl:async(url,options)=>{originCalls++;assert.equal(url,'https://upstream.example.test'+path);assert.equal(options.redirect,'manual');assert(verifyManagementRequest(secret,{method:'GET',url:path,headers:options.headers}));return Response.json({ok:true});}})).status,200);
for(const origin of ['http://sample.test','https://sample.test/path','https://user:secret@sample.test','https://sample.test?token=x','https://sample.test/#x'])assert.equal((await meetingManagementProxy(proxyRequest(),{...originEnv,AMCORE_MEETING_MANAGEMENT_ORIGIN:origin},actor,{fetchImpl:()=>{originCalls++;throw Error('must not fetch');}})).status,503);
assert.equal(originCalls,1);
const warnings=[],oldWarn=console.warn;console.warn=(...args)=>warnings.push(args);
try{
 for(const fetchImpl of [async()=>new Response('private upstream content',{status:403,headers:{'Content-Type':'text/html'}}),async()=>Response.json({private:'upstream content'},{status:302,headers:{Location:'https://other.example.test'}}),async()=>{throw new TypeError('private transport content');}]){
  const failed=await meetingManagementProxy(proxyRequest(),originEnv,actor,{fetchImpl});assert.equal(failed.status,503);assert.equal(failed.headers.get('Cache-Control'),'no-store');assert(!(await failed.text()).includes('private'));
 }
}finally{console.warn=oldWarn;}
assert.equal(warnings.length,3);assert(!JSON.stringify(warnings).includes('private'));assert(!JSON.stringify(warnings).includes(secret));
await assert.rejects(()=>meetingManagementRoute({csrf(){throw Error('csrf rejected');},env:{}},new Request('https://sample/api/management/meetings/conversations',{method:'PUT',body}),{account:actor}),/csrf rejected/);
meetings.init({publicBaseUrl:'https://sample.test',publicLinkSecret:secret});assert.equal(meetings.publicMeetingUrl('a'.repeat(32),owner),'');
await __test.assertReviewGroupMember({tenant:owner,groupId:user},user,'本人');
await assert.rejects(()=>__test.assertReviewGroupMember({tenant:owner,groupId:user,hostName:'本人',hostUserId:user},'U'+'9'.repeat(32),'本人'),/只有此個人對話本人/);
const groupOwner=service.tenantFor(await service.store.get(keyFor(bot,event('audio','group').source)));
meetings.init({lineGet:async()=>{throw Error('no longer a group member');}});
await assert.rejects(()=>__test.assertReviewGroupMember({tenant:groupOwner,groupId:group,hostName:'同名',hostUserId:user,memberMap:{同名:user}},user,'同名'),/現有成員/);
meetings.init({lineGet:async path=>{assert(path.includes('/room/'+room+'/member/'+user));return {userId:user};}});
await __test.assertReviewGroupMember({tenant:groupOwner,groupId:room},user);
let recordedProps,transcriptCount=0;
meetings.init({resolveConversationMeetingTarget:async()=>({dbId:target.dbId,perGroup:true}),notionRequest:async(p,o)=>{if(p==='/v1/pages'){recordedProps=o.body.properties;return {id:'p',url:'https://www.notion.so/p'};}if(o?.method==='PATCH'){transcriptCount+=(o.body.children||[]).filter(b=>b.type==='paragraph'&&b.paragraph.rich_text[0].text.content.startsWith('transcript')).length;return {results:[{id:'toggle'}]};}return {};},pushLineMessage:async()=>{}});
await __test.publishMeeting({tenant:owner,binding:owner.meetingBinding,parsed:{title:'test',highlights:[],conclusions:[],todos:[],minutes:[]},diarized:'transcript'.repeat(20000),legend:new Map(),roster:{speakers:[]},groupId:user,filename:'test.m4a',audioDriveUrl:'https://drive.google.com/file/d/synthetic/view',sourceMessageId:'a1'});
assert.equal(recordedProps['Google Drive 錄音'].url,'https://drive.google.com/file/d/synthetic/view');assert.equal(recordedProps['來源識別'].rich_text[0].text.content,'a1');assert(transcriptCount>90,'Long transcript must not be truncated');
await pg.close();console.log('Conversation meetings: defaults, durable settings/retries, source isolation, private owner, audio identity, restart wait, duplicate protection, HMAC, CSRF, Drive fields and complete transcript passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {createLeafTasks} from '../core/leaf-tasks.js';
import {createFirstUseMeetingGuard} from '../core/first-use-meetings.js';
import {createMeetingWorkspace} from '../modules/meetings/workspace-service.js';
import {managementSignature} from '../modules/meetings/management-auth.js';
import {meetingShareIdentityRead,MEETING_SHARE_IDENTITY_CONTRACT} from '../versions/AM-IMP-2026.1106.06/meeting-share-identity/meeting-share-identity.mjs';

const require=createRequire(import.meta.url),{patchWorker}=require('../versions/AM-IMP-2026.1106.06/meeting-share-identity/patch-worker.cjs');
const user='U'+'1'.repeat(32),bot='U'+'b'.repeat(32),key='synthetic-service-key-with-at-least-32-bytes',secret='synthetic-management-key-with-at-least-32-bytes';
const origin='https://fixture.example',prefix='/api/integrations/leaf-snail/tasks/';
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function fixture(tenantKeys=['fixture']){
 const configs=new Map(),calls=[],internal=[],order=[];
 const state={prior:null,native:{userId:user,account:'111',identityId:'native-binding'},active:true,locale:'zh-Hant',bound:true,error:null,hook:null,delay:0};
 const tenants=tenantKeys.map(key=>({key,tenantId:'synthetic-'+key,runtimeEnabled:true}));
 const original={async fetch(request){const path=new URL(request.url).pathname.split('/').at(-1),v=await request.json();internal.push(path);order.push(path);
  await state.hook?.(path,v);
  if(state.error===path)return Response.json({ok:false,code:'SYNTHETIC_UNAVAILABLE'},{status:503});
  if(path==='identity')return Response.json({ok:true,identity:state.native});
  if(path==='meeting-sharing-person')return Response.json({ok:true,person:state.active?{name:'合成人員',experience:{locale:state.locale,revision:1}}:null});
  throw Error('Unexpected original route '+path);
 }};
 const service=createLeafTasks({env:{LINE_CHANNEL_SECRET:'synthetic-encryption-secret',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tenants,
  store:{service:async t=>{order.push('config:'+t.key);return configs.get(t.key);},provisionTasks:async()=>{},configureTask:async(t,v)=>configs.set(t.key,{encrypted_key:{taskService:{baseUrl:v.baseUrl,encryptedKey:v.encryptedKey}}})},
  resolveIdentity:async(id,t,options)=>{assert.equal(id,user);assert.deepEqual(options,{readOnly:true});order.push('legacy:'+t);if(state.error==='legacy')throw Error('legacy-proof-failed');return state.prior;},
  fetchImpl:async(url,init)=>{const path=new URL(url).pathname.split('/').at(-1),v=init.body?JSON.parse(init.body):{};
   if(path==='health')return Response.json({ok:true,contract:'line-mention-dailylog-immediate-v1',tenant:new URL(url).hostname.split('.')[0]});
   calls.push(path);if(state.delay)await new Promise(r=>setTimeout(r,state.delay));
   if(path==='common-link')return Response.json({ok:true,linked:state.bound});
   const req=new Request(url,init);
   if(path==='meeting-share-identity'){if(state.compositeStatus)return Response.json({ok:false,code:'SYNTHETIC_UNAVAILABLE'},{status:state.compositeStatus});return meetingShareIdentityRead(req,{LEAF_TASK_SERVICE_KEY:key,LEAF_TASK_TENANT:v.tenantKey},{},original);}
   return original.fetch(req);
  }});
 for(const t of tenants)await service.configureService({tenantKey:t.key,baseUrl:'https://'+t.key+'.example',apiKey:key});
 const reset=()=>{calls.length=internal.length=order.length=0;};reset();
 return {service,state,calls,internal,order,original,reset};
}
async function outcome(fn){try{return {value:await fn()};}catch(e){return {error:e.message,status:e.status,code:e.code};}}
async function compare(setup,tenants){const f=await fixture(tenants);setup(f);f.reset();const before=await outcome(()=>f.service.meetingShareIdentity(user)),oldOrder=[...f.order],oldInternal=[...f.internal],oldCalls=[...f.calls];setup(f);f.reset();const after=await outcome(()=>f.service.meetingShareIdentity(user,undefined,{composed:true}));assert.deepEqual(after,before);assert.deepEqual(f.order,oldOrder);assert.deepEqual(f.internal,oldInternal);return {f,before,oldCalls,newCalls:[...f.calls]};}

await test('native/fallback precedence and exact old/new results',async()=>{const {before,oldCalls,newCalls}=await compare(f=>{f.state.prior={tenantKey:'fixture',account:'222',bindingId:'legacy-binding'};});assert.equal(before.value.account,'111');assert.deepEqual(oldCalls,['identity','meeting-sharing-person']);assert.deepEqual(newCalls,['meeting-share-identity']);});
await test('legacy-only and mismatched native fallback remain unchanged',async()=>{for(const native of [null,{userId:'U'+'2'.repeat(32),account:'333',identityId:'mismatch'},{userId:user,account:'333'}]){const {before}=await compare(f=>{f.state.native=native;f.state.prior={tenantKey:'fixture',account:'222',bindingId:'legacy-binding'};});assert.equal(before.value.account,'222');}});
await test('missing and wrong-tenant fallback do not produce people reads',async()=>{for(const prior of [null,{tenantKey:'other',account:'222',bindingId:'legacy-binding'},{tenantKey:'fixture',account:'222'}]){const {f,before}=await compare(f=>{f.state.native=null;f.state.prior=prior;});assert.equal(before.value,null);assert.deepEqual(f.internal,['identity']);}});
await test('inactive personnel and locale values retain results',async()=>{assert.equal((await compare(f=>{f.state.active=false;})).before.value,null);for(const locale of ['zh-Hant','en','id'])assert.equal((await compare(f=>{f.state.locale=locale;})).before.value.experience.locale,locale);});
await test('multiple tenants remain ambiguous and preserve read order',async()=>{assert.equal((await compare(()=>{},['fixture','second'])).before.value,null);});
await test('legacy, identity and personnel errors preserve failure and stop order',async()=>{for(const error of ['legacy','identity','meeting-sharing-person']){const {before}=await compare(f=>{f.state.error=error;});assert(before.error);}});
await test('revocation between identity and personnel is observed',async()=>{assert.equal((await compare(f=>{f.state.active=true;f.state.hook=path=>{if(path==='meeting-sharing-person')f.state.active=false;};})).before.value,null);});
await test('new operation rereads current identity and no cross-request cache',async()=>{const f=await fixture();assert.equal((await f.service.meetingShareIdentity(user,undefined,{composed:true})).account,'111');f.state.native={userId:user,account:'333',identityId:'changed'};assert.equal((await f.service.meetingShareIdentity(user,undefined,{composed:true})).account,'333');assert.deepEqual(f.calls,['meeting-share-identity','meeting-share-identity']);});
await test('unsupported or failing combined endpoint never retries old endpoints',async()=>{for(const status of [403,404,428,503]){const f=await fixture();f.state.compositeStatus=status;await assert.rejects(f.service.meetingShareIdentity(user,undefined,{composed:true}),e=>e.status===status);assert.deepEqual(f.calls,['meeting-share-identity']);assert.deepEqual(f.internal,[]);}});

const env={LEAF_TASK_SERVICE_KEY:key,LEAF_TASK_TENANT:'fixture'},input={tenantKey:'fixture',botUserId:bot,lineUserId:user,legacyIdentity:{tenantKey:'fixture',account:'222',bindingId:'legacy'}};
const req=(v=input,headers={},method='POST')=>new Request(origin+prefix+'meeting-share-identity',{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...headers},...(method==='POST'?{body:typeof v==='string'?v:JSON.stringify(v)}:{})});
await test('browser/cookie/forged actor cannot supply a legacy fallback',async()=>{let reads=0;const base={fetch:async()=>{reads++;throw Error('must not read');}};for(const Authorization of ['', 'Bearer forged']){const response=await meetingShareIdentityRead(req(input,{Authorization,Cookie:'synthetic-session','x-meeting-actor':'222'}),env,{},base);assert.equal(response.status,401);}assert.equal(reads,0);});
await test('tenant, fallback tenant, IDs, method and body are bounded',async()=>{const base={fetch:async()=>{throw Error('must not read');}};for(const value of [{...input,tenantKey:'other'},{...input,botUserId:'bad'},{...input,lineUserId:'bad'},{...input,legacyIdentity:{...input.legacyIdentity,tenantKey:'other'}}])assert.equal((await meetingShareIdentityRead(req(value),env,{},base)).status,403);assert.equal((await meetingShareIdentityRead(req(input,{},'GET'),env,{},base)).status,405);assert.equal((await meetingShareIdentityRead(req('{bad'),env,{},base)).status,400);assert.equal((await meetingShareIdentityRead(req('x'.repeat(10001)),env,{},base)).status,413);});
await test('original response failures remain failures and never retry',async()=>{for(const status of [401,403,404,428,503]){let reads=0;const response=await meetingShareIdentityRead(req(),env,{}, {fetch:async()=>{reads++;return Response.json({ok:false,code:'SYNTHETIC_DENIED'},{status});}});assert.equal(response.status,status);assert.equal(reads,1);}});
await test('patch guard is portable, exact and rejects a second installation',async()=>{const anchor='const operation_speed_worker={...form_open_worker,async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await form_open_worker.fetch(request,env,ctx),env,start);}};';const patched=patchWorker('unchanged\n'+anchor);assert(patched.startsWith('unchanged\n'));assert(patched.includes("from './meeting-share-identity.mjs'"));assert.throws(()=>patchWorker(patched));assert.throws(()=>patchWorker(anchor+anchor));assert.throws(()=>patchWorker('other'));});

await test('signed full AM hub list retains later first-use, nonce and numeric timings',async()=>{
 const f=await fixture(),pg=new PGlite();
 try{
  for(const path of ['core/central-archive/schema.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
  await pg.exec('CREATE TABLE central_archive.login_continuation_nonces(key text PRIMARY KEY,expires_at bigint NOT NULL)');
  const pool={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
  const platform={publicBaseUrl:origin,meetingShareIdentity:f.service.meetingShareIdentity,ensureFirstUseBinding:createFirstUseMeetingGuard(f.service.commonLink),meetingExperienceRequired:true};
  const service=createMeetingWorkspace({pool,botId:bot,platform,archive:{},env:{AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETING_MANAGEMENT_ORIGIN:origin},context:async()=>({}),tenantFor:()=>({}),getConversation:async()=>null,ensureDatabase:async()=>{throw Error('no business writes');},request:async()=>{throw Error('no publish');},meetingModule:{},logger:{warn(){}}});
  async function invoke(action='list',{nonce=randomUUID(),signature=true}={}){
   const bytes=Buffer.from(JSON.stringify({action})),url=new URL(origin+'/meetings/review/hub/api?_dailylogLine='+user+'&_dailylogNonce='+nonce),timestamp=String(Date.now());
   const req=Readable.from([bytes]);req.method='POST';req.url=url.pathname+url.search;req.headers={'content-type':'application/json','x-meeting-time':timestamp,'x-meeting-actor':'111','x-meeting-signature':signature?managementSignature(secret,{method:'POST',path:req.url,timestamp,actor:'111',body:bytes.toString('base64')}):'0'.repeat(64)};
   let status=200,value;const headers={};const res={setHeader(k,v){headers[k]=v;},writeHead(n){status=n;},set statusCode(n){status=n;},get statusCode(){return status;},end(v){value=JSON.parse(v);}};
   await service.handle(req,res,url);return {status,value,headers};
  }
  f.reset();let r=await invoke();assert.equal(r.status,200,JSON.stringify(r.value));assert.deepEqual(f.calls,['meeting-share-identity','common-link']);assert.deepEqual(r.value.items,[]);assert.match(r.headers['Server-Timing'],/^meeting_embedded;dur=\d+\.\d, meeting_auth;dur=\d+\.\d,meeting_inventory;dur=\d+\.\d$/);
  f.reset();r=await invoke('trash-list');assert.equal(r.status,200);assert.deepEqual(f.calls,['identity','meeting-sharing-person','common-link'],'non-list unchanged');
  f.reset();r=await invoke('list',{signature:false});assert.equal(r.status,403);assert.deepEqual(f.calls,[]);assert.match(r.headers['Server-Timing'],/^meeting_embedded;dur=\d+\.\d$/);
  f.state.hook=path=>{if(path==='meeting-sharing-person')f.state.bound=false;};f.reset();r=await invoke();assert.equal(r.status,428);assert(!r.value.items);assert.deepEqual(f.calls,['meeting-share-identity','common-link'],'late first-use denial remains after identity');f.state.hook=null;f.state.bound=true;
  const nonce=randomUUID();assert.equal((await invoke('list',{nonce})).status,200);assert.equal((await invoke('list',{nonce})).status,403,'nonce is not reused');
 }finally{await pg.close();}
});

await test('three samples retain reads and remove exactly one delayed HTTP trip',async()=>{const f=await fixture();f.state.delay=60;const samples=[];for(let i=0;i<3;i++)for(const composed of [false,true]){f.reset();const start=performance.now();const value=await f.service.meetingShareIdentity(user,undefined,{composed});samples.push({composed,ms:Number((performance.now()-start).toFixed(1)),http:f.calls.length,originalReads:f.internal.length});assert.equal(value.account,'111');assert.equal(f.calls.length,composed?1:2);assert.equal(f.internal.length,2);}console.log(JSON.stringify({fixture:'60 ms synthetic delay per AM-to-DailyLog request; not production speed',samples}));});
console.log(JSON.stringify({passed,contract:MEETING_SHARE_IDENTITY_CONTRACT,noProductionCalls:true}));

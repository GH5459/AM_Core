import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createMeetingWorkspace} from '../modules/meetings/workspace-service.js';
import {createLeafTasks} from '../core/leaf-tasks.js';
import {createFirstUseMeetingGuard} from '../core/first-use-meetings.js';
import {WORKSPACE_REFRESH_CONTRACT} from '../modules/meetings/workspace-response.js';

const host='U'+'1'.repeat(32),viewer='U'+'2'.repeat(32),outsider='U'+'3'.repeat(32),bot='U'+'b'.repeat(32),key='a'.repeat(64),group='C'+'c'.repeat(32);
const todo='todo:11111111-1111-4111-8111-111111111111',tenant={key:'fixture',tenantId:'synthetic',runtimeEnabled:true};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture({workspaceFactory=createMeetingWorkspace,leafFactory=createLeafTasks,delay=0}={}){
 const pg=new PGlite();
 for(const file of ['core/central-archive/schema.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const pool={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
 await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,bot,'group',group]);
 const row={key,bot_id:bot,source_kind:'group',source_id:group,enabled:true,connection_state:'active',tenant_key:'fixture',display_name:'合成會議'};
 let configuration,active=0,maxActive=0;
 const state={actor:host,members:new Set([host,viewer]),inactive:new Set(),locale:'zh-Hant',revision:1,status:'done',failHost:false,failViewer:false,bound:true,shareHook:null,remoteHook:null};
 const calls=[],shareCalls=[];
 const account=id=>id===host?'111':id===viewer?'222':'333';
 const options={env:{LINE_CHANNEL_SECRET:'synthetic-encryption-secret',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tenants:[tenant],store:{service:async()=>configuration,provisionTasks:async()=>{},configureTask:async(t,v)=>{configuration={encrypted_key:{taskService:{baseUrl:v.baseUrl,encryptedKey:v.encryptedKey}}};}},router:{},line:{},platform:{},logger:{warn(){}},resolveIdentity:async()=>null,
  fetchImpl:async(url,init)=>{
   const path=new URL(url).pathname.split('/').at(-1),input=init.body?JSON.parse(init.body):{};calls.push({path,input,origin:new URL(url).origin});active++;maxActive=Math.max(maxActive,active);
   try{await sleep(delay||1);await state.remoteHook?.(path,input);
    if(path==='health')return Response.json({ok:true,contract:'line-mention-dailylog-immediate-v1',tenant:'fixture'});
    if(path==='common-link')return Response.json({ok:true,linked:state.bound,reason:'binding_required'});
    if(path==='identity')return Response.json({ok:true,identity:state.inactive.has(input.lineUserId)?null:{userId:input.lineUserId,account:account(input.lineUserId),identityId:'synthetic-binding'}});
    if(path==='meeting-person'){if(state.failHost)throw Error('host-read-failed');return Response.json({ok:true,person:state.inactive.has(host)?null:{name:'合成主持人'}});}
    if(path==='meeting-sharing-person'){if(state.failViewer)throw Error('viewer-read-failed');const id=input.account==='111'?host:input.account==='222'?viewer:outsider;return Response.json({ok:true,person:state.inactive.has(id)?null:{name:'合成人員',experience:{locale:state.locale,revision:state.revision}}});}
    if(path==='meeting-progress')return Response.json({ok:true,contract:'meeting-live-task-progress-v1',items:[{todoId:todo,status:state.status,due:'2026-11-06',result:input.viewer?'合成成果':'',hasEvidence:!!input.viewer,evidenceRestricted:!input.viewer}]});
    throw Error('Unexpected endpoint '+path);
   }finally{active--;}
  }};
 const leaf=leafFactory(options);await leaf.configureService({tenantKey:'fixture',baseUrl:'https://dailylog.example/',apiKey:'synthetic-service-key-with-at-least-32-bytes'});
 const platform={publicBaseUrl:'https://meeting.example.test',publicLinkSecret:'synthetic-audio-secret',meetingExperienceRequired:true,
  loginContinuationActor:async()=>({id:state.actor,name:'合成人員'}),ensureFirstUseBinding:createFirstUseMeetingGuard(leaf.commonLink),
  meetingShareIdentity:async(...args)=>{shareCalls.push(args[0]);await state.shareHook?.(args[0],shareCalls.length);return leaf.meetingShareIdentity(...args);},
  readMeetingTaskProgress:leaf.readMeetingTaskProgress,
  lineGet:async path=>{if(delay)await sleep(delay);const id=path.split('/').at(-1);if(!state.members.has(id))throw Error('not member');return {userId:id};}};
 const service=workspaceFactory({pool,botId:bot,platform,archive:{},env:{AMCORE_MEETING_START_OPERATORS:JSON.stringify([{tenantKey:'fixture',account:'111'}]),AMCORE_MEETINGS_LIFF_ID:'123-test',AMCORE_MEETING_MANAGEMENT_ORIGIN:platform.publicBaseUrl},context:async()=>({}),tenantFor:()=>({config:{meetings:{liffId:'123-test'}}}),getConversation:async()=>row,ensureDatabase:async()=>{throw Error('No writes');},request:async()=>{throw Error('No publish');},meetingModule:{},logger:{warn(){}}});
 const created=await service.store.create(key,{source:{type:'group',groupId:group,userId:host},message:{id:'read-speed-fixture',type:'audio'},timestamp:1},'synthetic.m4a','合成主持人');
 const fields={...created.fields,record:'合成完整記錄',transcript:'合成完整逐字稿',[todo]:{content:'合成工作',ownerId:host,due:'2026-11-06'}};
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='published',fields=$2::jsonb,receipt=$3::jsonb WHERE id=$1",[created.id,JSON.stringify(fields),JSON.stringify({planInputHash:'synthetic',taskTenant:'fixture',tasksSaved:true})]);
 async function api(input={action:'read'}){
  const req=Readable.from([Buffer.from(JSON.stringify(input))]);req.method='POST';req.headers={origin:platform.publicBaseUrl};
  let status=200,output;const headers={};const res={headersSent:false,setHeader(k,v){headers[k]=v;},writeHead(v){status=v;},set statusCode(v){status=v;},get statusCode(){return status;},end(v){output=JSON.parse(v);}};
  await service.handle(req,res,new URL(platform.publicBaseUrl+'/meetings/review/work/'+created.id+'/api'));return {status,value:output,headers};
 }
 const reset=()=>{calls.length=shareCalls.length=0;maxActive=0;};
 reset();return {api,leaf,state,calls,shareCalls,reset,setBase:base=>{configuration.encrypted_key.taskService.baseUrl=base;},maxActive:()=>maxActive,close:()=>pg.close(),id:created.id};
}

// A real PostgreSQL implementation, original workspace routes, and original
// signed-service client are exercised together. Only remote services are fake.
const f=await fixture();
try{
 let result=await f.api();assert.equal(result.status,200,JSON.stringify(result.value));assert.equal(result.value.access,'member');assert.equal(result.value.taskProgress.items[0].status,'done');assert.equal(result.value.taskProgress.items[0].result,'合成成果');
 assert.match(result.headers['Server-Timing'],/^meeting_auth;dur=[\d.]+,meeting_view;dur=[\d.]+,meeting_related;dur=[\d.]+,meeting_total;dur=[\d.]+$/);
 assert.deepEqual(f.shareCalls,[host,host],'planned/operator identity is shared only within authentication; locale is fresh');
 assert(f.maxActive()>1,'host and viewer requests overlap');
 const progress=f.calls.find(x=>x.path==='meeting-progress');assert.equal(progress.input.host.account,'111');assert.equal(progress.input.viewer.account,'111');
 const known=result.value.refresh;assert.equal(known.contract,WORKSPACE_REFRESH_CONTRACT);
 f.reset();f.state.status='in_progress';result=await f.api({action:'read',known});assert.equal(result.status,200);assert.equal(result.value.delta,true);assert.equal(result.value.values.taskProgress.items[0].status,'in_progress');assert.deepEqual(f.shareCalls,[host,host]);
 f.state.inactive.add(host);assert.equal((await f.api()).status,403,'revocation is freshly read on the next request');f.state.inactive.clear();
 f.reset();f.state.shareHook=(id,n)=>{if(n===2)f.state.inactive.add(id);};result=await f.api();assert.equal(result.status,503,'revocation after authentication is not hidden by the identity promise');assert(!result.value.workspace);f.state.shareHook=null;f.state.inactive.clear();
 f.state.locale='en';result=await f.api();assert.equal(result.value.experience.locale,'en');assert.equal(result.value.canEdit,false);
 f.state.locale='id';f.state.revision++;result=await f.api({action:'read',known});assert.equal(result.value.experience.locale,'id');assert.equal(result.value.delta,undefined,'locale changes invalidate prior response scope');f.state.locale='zh-Hant';
 f.state.actor=viewer;f.state.members.delete(viewer);assert.equal((await f.api()).status,403,'nonmember cannot inherit the host operator grant');f.state.members.add(viewer);assert.equal((await f.api()).status,200);
 f.state.remoteHook=path=>{if(path==='meeting-sharing-person')f.state.members.delete(viewer);};assert.equal((await f.api()).status,403,'leaving LINE while identity checks run is observed by the later member check');f.state.remoteHook=null;
 f.state.members.delete(viewer);assert.equal((await f.api()).status,403,'current source membership is never cached');f.state.actor=host;
 f.state.bound=false;f.reset();assert.equal((await f.api()).status,428);assert.deepEqual(f.calls.map(x=>x.path),['common-link'],'binding denial remains ahead of other identity/data reads');f.state.bound=true;
 const input={tenantKey:'fixture',id:f.id,hostId:host,actorId:viewer,todoIds:[todo]};
 f.state.failHost=true;f.state.failViewer=true;f.reset();await assert.rejects(f.leaf.readMeetingTaskProgress(input),/host-read-failed/);assert(!f.calls.some(x=>x.path==='meeting-progress'),'no progress request on either identity failure');f.state.failHost=false;
 await assert.rejects(f.leaf.readMeetingTaskProgress(input),/viewer-read-failed/);f.state.failViewer=false;
 f.state.inactive.add(host);await assert.rejects(f.leaf.readMeetingTaskProgress(input),/meeting_task_identity_changed/);f.state.inactive.clear();
 f.state.inactive.add(viewer);f.reset();result=await f.leaf.readMeetingTaskProgress(input);assert.equal(f.calls.find(x=>x.path==='meeting-progress').input.viewer,null);assert.equal(result.items[0].result,'');f.state.inactive.clear();
 await assert.rejects(f.leaf.readMeetingTaskProgress({...input,tenantKey:'other'}),/meeting_task_service_changed/);
 let releaseHost,viewerReached,completed=false;const hostGate=new Promise(resolve=>{releaseHost=resolve;}),viewerGate=new Promise(resolve=>{viewerReached=resolve;});
 f.reset();f.state.remoteHook=async path=>{if(path==='meeting-person')await hostGate;if(path==='meeting-sharing-person')viewerReached();};
 const pending=f.leaf.readMeetingTaskProgress(input).then(v=>{completed=true;return v;});await viewerGate;await new Promise(setImmediate);
 assert.equal(completed,false);assert(!f.calls.some(x=>x.path==='meeting-progress'),'viewer completion cannot bypass a pending host check');releaseHost();await pending;f.state.remoteHook=null;
 f.reset();f.state.remoteHook=path=>{if(path==='meeting-person')f.setBase('https://updated-dailylog.example/');};await f.leaf.readMeetingTaskProgress(input);assert.equal(f.calls.find(x=>x.path==='meeting-progress').origin,'https://updated-dailylog.example','destination is resolved after current identity checks');f.state.remoteHook=null;
 console.log('Meeting read latency: PostgreSQL route, same-phase identity sharing, current progress, nonrevision/locale deltas, mid-read and next-read revocation, source membership, binding precedence, host/viewer failure precedence and restricted evidence passed.');
}finally{await f.close();}

const baseline=process.argv.find(x=>x.startsWith('--baseline='))?.slice('--baseline='.length);
if(baseline){
 const root=new URL('../',import.meta.url),overrides=new Map();
 const at=async file=>{let source=execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'});source=source.replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(_,a,b,c)=>a+(overrides.get(new URL(b,new URL(file,root)).href)||new URL(b,new URL(file,root)).href)+c);const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');overrides.set(new URL(file,root).href,url);return import(url);};
 await at('modules/meetings/start-authority.js');const beforeWorkspace=await at('modules/meetings/workspace-service.js'),beforeLeaf=await at('core/leaf-tasks.js');
 const output=[],baselineResponses=new Map();
 const stable=value=>{const copy=structuredClone(value);delete copy.refresh;delete copy.audioUrl;copy.workspace.publishedAt=null;copy.taskProgress.checkedAt=null;return copy;};
 for(const [label,workspaceFactory,leafFactory] of [['before',beforeWorkspace.createMeetingWorkspace,beforeLeaf.createLeafTasks],['after',createMeetingWorkspace,createLeafTasks]]){
  const benchmark=await fixture({workspaceFactory,leafFactory,delay:80});try{for(const audience of ['host-operator','member']){benchmark.state.actor=audience==='host-operator'?host:viewer;let prior=(await benchmark.api()).value.refresh;
   for(const mode of ['full','delta'])for(let sample=1;sample<=3;sample++){benchmark.reset();const begin=performance.now(),r=await benchmark.api({action:'read',...(mode==='delta'?{known:prior}:{})}),ms=performance.now()-begin;assert.equal(r.status,200);if(mode==='full'){assert.equal(r.value.workspace.fields.record,'合成完整記錄');assert.equal(r.value.taskProgress.items[0].result,'合成成果');if(label==='before')baselineResponses.set(audience,stable(r.value));else assert.deepEqual(stable(r.value),baselineResponses.get(audience),'all response fields match the baseline apart from clocks, audio tokens and derived hashes');}prior=r.value.refresh;output.push({label,audience,mode,sample,ms:Number(ms.toFixed(1)),remoteCalls:benchmark.calls.length,outerIdentityCalls:benchmark.shareCalls.length,maxConcurrent:benchmark.maxActive()});}
   }
  }finally{await benchmark.close();}
 }
 console.log(JSON.stringify({fixture:'80ms per remote service request and LINE membership read; original PostgreSQL schema, no production calls',baseline,samples:output}));
}

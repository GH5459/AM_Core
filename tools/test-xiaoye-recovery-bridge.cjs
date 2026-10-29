const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventBridge}=require('./xiaoye-event-bridge.cjs');
const id='a'.repeat(64),taskId='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function fixture(api,phase='running',verifyCaseExecutor) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-recovery-'));
 fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key:'fixture-only'}));
 fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'https://fixture.invalid',LEAF_TASK_TENANT:'fixture'}}));
 fs.writeFileSync(path.join(dir,'bridge-active.private.json'),JSON.stringify({id,taskId,sourceVersion:4,lease:'lease-a',phase,failureOperation:'failure-original'}));
 const calls=[];
 const fetcher=async(url,options)=>{const action=new URL(url).pathname.split('/').at(-1),input=JSON.parse(options.body);calls.push({action,input});return Response.json({ok:true,...await api(action,input)});};
 const bridge=new EventBridge({operatorDirectory:dir,workRoot:dir,promptFile:path.join(dir,'prompt.txt')},{fetcher,WebSocket:class {},verifyCaseExecutor});
 return {dir,calls,bridge};
}
const inspection=(state,stage='executing')=>({event:{id,taskId,sourceVersion:4,leaseActive:state==='running',state},task:{id:taskId,sourceVersion:4,stage,version:10},resultNotification:{state:'pending'}});

test('startup keeps unknown desktop dispatch for reconciliation; it sends no new turn',async()=>{
 const f=fixture(async action=>{if(action==='event-inspect')return inspection('running');assert.equal(action,'event-check');return {job:{id,lease:'lease-a'}}});
 const p=path.join(f.dir,'event-runs',id);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'chat-dispatch.input.private.json'),'{}');
 await f.bridge.recover();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','event-check']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'bridge-active.private.json'))).phase,'running');
 assert.equal(JSON.parse(fs.readFileSync(path.join(p,'recovery.private.json'))).decision,'inspect-original-chat');
});
test('startup never resends an uncertain finalization and waits for readback',async()=>{
 const f=fixture(async(action,input)=>action==='event-inspect'?inspection('running'):action==='event-check'?{job:{id,lease:'lease-a'}}:(assert.equal(action,'event-complete'),assert.equal(input.operationId,'original-complete'),{state:'done'}));
 const p=path.join(f.dir,'event-runs',id);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'event-complete.input.private.json'),JSON.stringify({id,lease:'lease-a',operationId:'original-complete'}));
 await f.bridge.recover();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(p,'recovery.private.json'))).decision,'await-finalization-readback');
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'bridge-active.private.json'))).phase,'running');
});
test('startup with a completed case requests notification only',async()=>{
 const f=fixture(async action=>{assert.equal(action,'event-inspect');return inspection('done','awaiting_confirmation')});
 await f.bridge.recover();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'bridge-active.private.json'))).recoveryDecision,'notification-only');
});
test('failed case resumes only after the actual executor is verified',async()=>{
 const f=fixture(async(action,input)=>action==='event-inspect'?{...inspection('failed','blocked'),autoResumeEligible:true}:(assert.equal(action,'auto-resume'),assert.equal(input.version,10),assert.equal(input.eventId,id),{state:'clarifying'}),'running',async()=>true);
 await f.bridge.recover();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','auto-resume']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'bridge-active.private.json'))).recoveryDecision,'auto-resumed');
 const records=fs.readdirSync(path.join(f.dir,'case-recovery'));assert.equal(records.length,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'case-recovery',records[0]))).lastEventId,id);
});
test('connection recovery scans a bounded local failed event and never resends Codex work',async()=>{
 const f=fixture(async(action,input)=>action==='event-inspect'?{...inspection('failed','blocked'),autoResumeEligible:true}:(assert.equal(action,'auto-resume'),assert.equal(input.eventId,id),{stage:'clarifying'}),'finished',async()=>true);
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'failed'}));
 await f.bridge.recoverFailedEvents();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','auto-resume']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.response.private.json'))).stage,'clarifying');
 await f.bridge.recoverFailedEvents();assert.equal(f.calls.length,2);
});
test('exception intent waits while finalization is unknown, then rechecks the same failed event exactly once',async()=>{
 let state='running';const f=fixture(async(action,input)=>{if(action==='event-inspect')return {...inspection(state,state==='running'?'executing':'blocked'),event:{...inspection(state).event,kind:'execute'},autoResumeEligible:state==='failed'};assert.equal(action,'auto-resume');assert.equal(input.eventId,id);return {stage:'clarifying'};},'finished',async()=>true);
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));fs.writeFileSync(path.join(run,'failure.input.private.json'),JSON.stringify({id,lease:'lease-a',operationId:'original-fail-operation'}));
 await f.bridge.recoverFailedEvents();assert.deepEqual(f.calls.map(c=>c.action),['event-inspect']);assert(f.bridge.failedRecoveryTimer);assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.decision.private.json'))).decision,'finalization-unconfirmed');
 state='failed';await f.bridge.recoverFailedEvents();assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','event-inspect','auto-resume']);await f.bridge.recoverFailedEvents();assert.equal(f.calls.length,3);f.bridge.stop();
});
test('temporarily unavailable desktop tools schedule another check and then resume the same failed case',async()=>{
 let ready=false;
 const f=fixture(async(action,input)=>action==='event-inspect'?{...inspection('failed','blocked'),autoResumeEligible:true}:(assert.equal(action,'auto-resume'),assert.equal(input.eventId,id),{stage:'clarifying'}),'finished',async()=>ready);
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a'}}));
 fs.writeFileSync(path.join(run,'tools-failed.input.private.json'),JSON.stringify({id,lease:'lease-a',operationId:'fixture-tool-failure'}));
 await f.bridge.recoverFailedEvents();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect']);
 assert(f.bridge.failedRecoveryTimer);
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.decision.private.json'))).retryScheduled,true);
 ready=true;await f.bridge.recoverFailedEvents();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','event-inspect','auto-resume']);
 assert.equal(f.bridge.failedRecoveryTimer,null);
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.response.private.json'))).stage,'clarifying');
 f.bridge.stop();
});
test('completed execution blocked on new scope is rechecked and starts a new analysis',async()=>{
 const f=fixture(async(action,input)=>action==='event-inspect'?{...inspection('done','blocked'),event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:true}:(assert.equal(action,'auto-resume'),assert.equal(input.eventId,id),{stage:'clarifying'}),'finished',async()=>true);
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 await f.bridge.recoverFailedEvents();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','auto-resume']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.response.private.json'))).stage,'clarifying');
 f.bridge.stop();
});
test('an exhausted completed blocked execution with a legacy skipped marker remains pending and is rechecked',async()=>{
 const f=fixture(async action=>{assert.equal(action,'event-inspect');return {...inspection('done','blocked'),event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:false};},'finished',async()=>{throw Error('must not dispatch or bypass the budget');});
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),JSON.stringify({skipped:true,reason:'case-changed'}));
 await f.bridge.recoverFailedEvents();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.response.private.json'))).reason,'case-changed');
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.decision.private.json'))).decision,'waiting-for-eligibility');
 assert(f.bridge.failedRecoveryTimer);f.bridge.stop();
});
test('a paused case is confirmed changed and cannot be resumed or polled',async()=>{
 const f=fixture(async action=>{assert.equal(action,'event-inspect');return {...inspection('done','paused'),event:{...inspection('done','paused').event,kind:'execute',leaseActive:false},autoResumeEligible:false};},'finished',async()=>{throw Error('paused case cannot execute');});
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),JSON.stringify({skipped:true,reason:'case-changed'}));
 await f.bridge.recoverFailedEvents();
 assert.equal(JSON.parse(fs.readFileSync(path.join(run,'auto-resume.response.private.json'))).reason,'confirmed-case-changed');
 assert.equal(f.bridge.failedRecoveryTimer,null);
 await f.bridge.recoverFailedEvents();assert.equal(f.calls.length,1);f.bridge.stop();
});
test('an uncertain inspection does not erase the candidate and schedules a read-only retry',async()=>{
 const f=fixture(async()=>{throw Error('temporary service outage');},'finished',async()=>true);
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 await f.bridge.recoverFailedEvents();
 assert(f.bridge.failedRecoveryTimer);assert.equal(fs.existsSync(path.join(run,'auto-resume.response.private.json')),false);f.bridge.stop();
});
test('newly verified exact-commit capability causes one version-guarded analysis, not a repeated execution',async()=>{
 const f=fixture(async(action,input)=>{
  if(action==='event-inspect')return {...inspection('done','blocked'),task:{...inspection('done','blocked').task,capabilityDependency:{name:'render-deploy-commit-v1',eventId:id,sourceVersion:4,outcome:'not-started'}},event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:false,capabilityResumeEligible:input.capability==='render-deploy-commit-v1'};
  assert.equal(action,'auto-resume');assert.equal(input.capability,'render-deploy-commit-v1');assert.equal(input.version,10);assert.equal(input.eventId,id);return {stage:'clarifying'};
 },'finished',async()=>true);
 f.bridge.verifyExactRenderPublish=async()=>true;
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),JSON.stringify({skipped:true,reason:'case-changed'}));
 await f.bridge.recoverFailedEvents();assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','event-inspect','auto-resume']);
 await f.bridge.recoverFailedEvents();assert.equal(f.calls.length,3);assert.equal(f.bridge.failedRecoveryTimer,null);f.bridge.stop();
});
test('new deployment capability does not bypass a server-side eligibility refusal',async()=>{
 const f=fixture(async action=>{assert.equal(action,'event-inspect');return {...inspection('done','blocked'),task:{...inspection('done','blocked').task,capabilityDependency:{name:'render-deploy-commit-v1',eventId:id,sourceVersion:4,outcome:'not-started'}},event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:false,capabilityResumeEligible:false};},'finished',async()=>{throw Error('no executor when server denies');});
 f.bridge.verifyExactRenderPublish=async()=>true;
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 await f.bridge.recoverFailedEvents();assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','event-inspect']);assert(f.bridge.failedRecoveryTimer);f.bridge.stop();
});
test('receiver advances past a full page of blocked cases and reaches the older cases',async()=>{
 const byId=new Map(),f=fixture(async(action,input)=>{assert.equal(action,'event-inspect');const active=byId.get(input.eventId);assert(active);return {event:{id:active.id,taskId:active.taskId,sourceVersion:4,state:'done',kind:'execute',leaseActive:false},task:{id:active.taskId,sourceVersion:4,stage:'blocked',version:10},autoResumeEligible:false};},'finished',async()=>{throw Error('no execution expected');});
 for(let i=0;i<40;i++){
  const eventId=i.toString(16).padStart(64,'0'),caseId='work-'+i.toString(16).padStart(8,'0')+'-aaaa-aaaa-aaaa-aaaaaaaaaaaa',run=path.join(f.dir,'event-runs',eventId),active={id:eventId,taskId:caseId,sourceVersion:4,lease:'fixture',kind:'execute'};
  byId.set(eventId,active);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:active}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 }
 await f.bridge.recoverFailedEvents();assert.equal(f.calls.length,32);assert.equal(f.bridge.failedRecoveryOffset,32);
 await f.bridge.recoverFailedEvents();assert.equal(f.calls.length,40);assert.equal(f.bridge.failedRecoveryOffset,0);assert(f.bridge.failedRecoveryTimer);f.bridge.stop();
});
test('capability state survives restart and an unknown probe is never called unavailable',async()=>{
 let state='unknown';const dep={name:'render-deploy-commit-v1',eventId:id,sourceVersion:4,outcome:'rejected'};
 const f=fixture(async(action,input)=>action==='event-inspect'?{...inspection('done','blocked'),task:{...inspection('done','blocked').task,capabilityDependency:dep},event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:false,capabilityResumeEligible:!!input.capability}:{stage:'clarifying'},'finished',async()=>true);
 const verify=async()=>false;verify.probe=async()=>state;f.bridge.verifyExactRenderPublish=verify;
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 await f.bridge.recoverFailedEvents();assert.equal(JSON.parse(fs.readFileSync(path.join(run,'capability-state.private.json'))).state,'unknown');assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,0);
 f.bridge.stop();const restarted=new EventBridge(f.bridge.config,{fetcher:f.bridge.fetcher,WebSocket:class{},verifyCaseExecutor:async()=>true,verifyExactRenderPublish:verify});state='available';
 await restarted.recoverFailedEvents();assert.equal(JSON.parse(fs.readFileSync(path.join(run,'capability-state.private.json'))).state,'available');assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);await restarted.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);restarted.stop();
});
test('a permanently inaccessible first-page case cannot starve an eligible second-page case',async()=>{
 const f=fixture(async()=>{},'finished',async()=>true),map=new Map(),calls=[];
 for(let i=0;i<33;i++){const eventId=i.toString(16).padStart(64,'0'),caseId='work-'+i.toString(16).padStart(8,'0')+'-aaaa-aaaa-aaaa-aaaaaaaaaaaa',run=path.join(f.dir,'event-runs',eventId),active={id:eventId,taskId:caseId,sourceVersion:4,lease:'fixture',kind:'analyze'};map.set(eventId,active);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:active}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'failed'}));fs.utimesSync(path.join(run,'acquire.response.private.json'),new Date(Date.now()-i*1000),new Date(Date.now()-i*1000));}
 f.bridge.fetcher=async(url,opts)=>{const action=new URL(url).pathname.split('/').at(-1),input=JSON.parse(opts.body);calls.push({action,input});const item=map.get(input.eventId);if(action==='event-inspect'&&input.eventId==='0'.repeat(64))return Response.json({ok:false},{status:404});if(action==='event-inspect')return Response.json({ok:true,event:{...item,state:'failed',leaseActive:false},task:{id:item.taskId,sourceVersion:4,stage:input.eventId.endsWith('20')?'blocked':'closed',version:10},autoResumeEligible:input.eventId.endsWith('20')});return Response.json({ok:true,stage:'clarifying'});};
 await f.bridge.recoverFailedEvents();await f.bridge.recoverFailedEvents();assert.equal(calls.filter(c=>c.action==='auto-resume').length,1);assert(calls.some(c=>c.action==='auto-resume'&&c.input.eventId.endsWith('20')));assert(f.bridge.failedRecoveryTimer);f.bridge.stop();
});
test('local budget refusal remains pending and accepts one new recovery after observed outage',async()=>{
 let ready=true;const f=fixture(async(action,input)=>action==='event-inspect'?{...inspection('failed','blocked'),event:{...inspection('failed','blocked').event,kind:'analyze'},autoResumeEligible:true}:(assert.equal(action,'auto-resume'),{stage:'clarifying'}),'finished',async()=>ready);
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'analyze'}}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'failed'}));
 const crypto=require('node:crypto'),dir=path.join(f.dir,'case-recovery');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,crypto.createHash('sha256').update(taskId).digest('hex')+'.private.json'),JSON.stringify({lastEventId:'b'.repeat(64),signature:'analyze:unclassified',consecutive:1}));
 await f.bridge.recoverFailedEvents();assert(f.bridge.failedRecoveryTimer);assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,0);
 ready=false;await f.bridge.recoverFailedEvents();assert.equal(JSON.parse(fs.readFileSync(path.join(run,'executor-observation.private.json'))).state,'unavailable');
 ready=true;await f.bridge.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);await f.bridge.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);f.bridge.stop();
});
test('an identified unknown deployment remains pending, then live creates only a new analysis',async()=>{
 const d={workspaceId:'tea-abc',serviceId:'srv-abc',deployId:'dep-abc',commitId:'b'.repeat(40)};let state='unknown',outcome='unknown',version=10;
 const f=fixture(async(action,input)=>{if(action==='event-inspect')return {...inspection('done','blocked'),task:{...inspection('done','blocked').task,version,capabilityDependency:{name:'render-deploy-commit-v1',eventId:id,sourceVersion:4,outcome,deployment:d}},event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:false,capabilityResumeEligible:input.capability==='render-deploy-reconciled-v1'&&outcome==='reconciled-live'};if(action==='record-deploy-reconciliation'){assert.equal(input.status,'live');outcome='reconciled-live';version++;return {version};}assert.equal(action,'auto-resume');assert.equal(input.capability,'render-deploy-reconciled-v1');assert.equal(input.version,11);return {stage:'clarifying'};},'finished',async()=>true);
 const verify=async()=>false;verify.probeDeployment=async()=>state==='live'?{state:'live',status:'live'}:{state};f.bridge.verifyExactRenderPublish=verify;
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 for(const pending of ['unknown','pending']){state=pending;await f.bridge.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,0);assert(f.bridge.failedRecoveryTimer);}
 state='live';await f.bridge.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='record-deploy-reconciliation').length,1);assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);
 await f.bridge.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);f.bridge.stop();
});
test('a confirmed failed deploy starts one side-effect analysis and never resends deployment',async()=>{
 const d={workspaceId:'tea-abc',serviceId:'srv-abc',deployId:'dep-abc',commitId:'b'.repeat(40)};
 let outcome='unknown',version=10;const f=fixture(async(action,input)=>{if(action==='event-inspect')return {...inspection('done','blocked'),task:{...inspection('done','blocked').task,version,capabilityDependency:{name:'render-deploy-commit-v1',eventId:id,sourceVersion:4,outcome,deployment:d,...outcome==='reconciled-failed'?{reconciliation:{status:'build_failed'}}:{}}},event:{...inspection('done','blocked').event,kind:'execute',leaseActive:false},autoResumeEligible:false,capabilityResumeEligible:input.capability==='render-deploy-failure-analysis-v1'&&outcome==='reconciled-failed'};if(action==='record-deploy-reconciliation'){assert.equal(input.status,'build_failed');outcome='reconciled-failed';version++;return {version};}assert.equal(action,'auto-resume');assert.equal(input.capability,'render-deploy-failure-analysis-v1');return {stage:'clarifying'};},'finished',async()=>true);
 const verify=async()=>false;verify.probeDeployment=async()=>({state:'failed',status:'build_failed'});f.bridge.verifyExactRenderPublish=verify;
 const run=path.join(f.dir,'event-runs',id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:4,lease:'lease-a',kind:'execute'}}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 await f.bridge.recoverFailedEvents();assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','record-deploy-reconciliation','event-inspect','event-inspect','auto-resume']);await f.bridge.recoverFailedEvents();assert.equal(f.calls.filter(c=>c.action==='auto-resume').length,1);f.bridge.stop();
});

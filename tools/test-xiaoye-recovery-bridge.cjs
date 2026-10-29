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
test('startup replays an uncertain finalization with the original operation ID',async()=>{
 const f=fixture(async(action,input)=>action==='event-inspect'?inspection('running'):action==='event-check'?{job:{id,lease:'lease-a'}}:(assert.equal(action,'event-complete'),assert.equal(input.operationId,'original-complete'),{state:'done'}));
 const p=path.join(f.dir,'event-runs',id);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'event-complete.input.private.json'),JSON.stringify({id,lease:'lease-a',operationId:'original-complete'}));
 await f.bridge.recover();
 assert.deepEqual(f.calls.map(c=>c.action),['event-inspect','event-check','event-complete']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'bridge-active.private.json'))).phase,'finished');
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

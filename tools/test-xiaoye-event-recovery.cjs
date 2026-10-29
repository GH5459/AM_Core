const test=require('node:test'),assert=require('node:assert/strict');
const {reconcileInterruptedEvent,nextFailure}=require('./xiaoye-event-recovery.cjs');
const id='a'.repeat(64),active={id,lease:'lease-a',taskId:'work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',sourceVersion:4};
const fixture=(state='running',extra={})=>({event:{id,leaseActive:true,taskId:active.taskId,sourceVersion:4,state},task:{id:active.taskId,sourceVersion:4,stage:'executing',version:9},...extra});
const run=(inspected,overrides={})=>reconcileInterruptedEvent({active,inspectEvent:async()=>inspected,verifyLease:async()=>true,finalizeEvent:async()=>{throw Error('unexpected write')},...overrides});

test('a completed case with an unsent result requests notification only',async()=>{
  const result=await run(fixture('done',{resultNotification:{state:'failed'}}));
  assert.equal(result.decision,'notification-only');assert.equal(result.terminal,true);
  assert.equal((await run(fixture('done',{resultNotification:null}))).decision,'finished');
});
test('a persisted finalization retries only its original operation ID',async()=>{
  const calls=[];
  const result=await run(fixture(),{evidence:{finalization:{action:'complete',operationId:'saved-complete'}},finalizeEvent:async(action,input)=>{calls.push({action,input});return {state:'done'}}});
  assert.deepEqual(calls,[{action:'complete',input:{id,lease:'lease-a',operationId:'saved-complete'}}]);assert.equal(result.decision,'finalization-replayed');
});
test('a saved answer settles the event without dispatching a second desktop turn',async()=>{
  const calls=[];
  const result=await run(fixture('running',{task:{id:active.taskId,sourceVersion:4,stage:'clarifying',waitingForReporter:true}}),{finalizeEvent:async(action,input)=>{calls.push({action,input});return {state:'done'}}});
  assert.deepEqual(calls,[{action:'complete',input:{id,lease:'lease-a',operationId:'event-complete-'+id}}]);assert.equal(result.decision,'outcome-reconciled');
});
test('uncertain desktop dispatch is held for the original chat to be inspected',async()=>{
  const result=await run(fixture(),{evidence:{chatDispatchInput:true}});assert.equal(result.decision,'inspect-original-chat');assert.equal(result.terminal,false);
});
test('an event before dispatch may continue only under its existing lease',async()=>{
  assert.equal((await run(fixture())).decision,'resume-same-event');
  assert.equal((await run(fixture('running',{event:{...fixture().event,leaseActive:false}}))).decision,'lease-changed');
  assert.equal((await run(fixture(),{verifyLease:async()=>false})).decision,'lease-unverified');
});
test('old blocked auto-authorized case resumes with a stable operation ID',async()=>{
  const calls=[];
  const result=await run(fixture('failed',{autoResumeEligible:true}),{evidence:{executorReady:true},autoResume:async input=>{calls.push(input);return {state:'clarifying'}}});
  assert.deepEqual(calls,[{id:active.taskId,version:9,eventId:id,operationId:'auto-resume-event-'+id}]);assert.equal(result.decision,'auto-resumed');
});
test('a completed execution blocked on a new scope starts a new analysis only when the server permits it',async()=>{
 const inspected=fixture('done',{event:{...fixture('done').event,kind:'execute',leaseActive:false},task:{...fixture().task,stage:'blocked'},autoResumeEligible:true});
 const calls=[];const result=await run(inspected,{evidence:{executorReady:true},autoResume:async input=>{calls.push(input);return {stage:'clarifying'}}});
 assert.equal(result.decision,'auto-resumed');assert.equal(calls.length,1);assert.equal(calls[0].eventId,id);
 assert.equal((await run({...inspected,autoResumeEligible:false})).decision,'finished');
});
test('server refusal and mismatched identity cannot be bypassed by local evidence',async()=>{
  assert.equal((await run(fixture('failed',{autoResumeEligible:false}))).decision,'failed-needs-reconciliation');
  assert.equal((await run(fixture('failed',{autoResumeEligible:true}))).decision,'failed-needs-reconciliation');
  assert.equal((await run(fixture('done',{event:{...fixture('done').event,sourceVersion:5}}))).decision,'identity-mismatch');
  assert.equal((await run(fixture('failed',{task:{...fixture().task,sourceVersion:5},autoResumeEligible:true}),{evidence:{executorReady:true}})).decision,'case-version-changed');
  assert.equal((await run(fixture('done',{task:{...fixture().task,sourceVersion:5},resultNotification:{state:'pending'}}))).decision,'finished-case-updated');
});
test('repeat infrastructure failure has a small retry budget and resets for a new cause',()=>{
  const eventId2='b'.repeat(64),eventId3='c'.repeat(64);
  const a=nextFailure(null,{eventId:id,signature:'dns:dailylog',now:1000}),b=nextFailure(a,{eventId:eventId2,signature:'dns:dailylog',now:2000});
  assert.equal(a.automaticRetryAllowed,true);assert.equal(b.automaticRetryAllowed,false);assert.equal(b.nextAttemptAt,null);
  assert.deepEqual(nextFailure(b,{eventId:eventId2,signature:'dns:dailylog',now:3000}),b);
  assert.equal(nextFailure(b,{eventId:eventId3,signature:'desktop:lost',now:3000}).consecutive,1);
});

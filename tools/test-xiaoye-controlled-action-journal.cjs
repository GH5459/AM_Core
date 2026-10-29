const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ActionJournal,observe,dispatchOnce,assessRecovery}=require('./xiaoye-controlled-action-journal.cjs');
const event='a'.repeat(64),sha='b'.repeat(40),merge='c'.repeat(40),version=2;
const gh={eventId:event,sourceVersion:version,operationId:'github-operation-1',kind:'github-merge',target:{repo:'fixture/repo',number:5,base:'main',headSha:sha}};
const render={eventId:event,sourceVersion:version,operationId:'render-operation-1',kind:'render-deploy',target:{workspaceId:'tea-abc',serviceId:'srv-abc',commitId:sha}};
function temp(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'action-journal-'));return {dir:d,file:path.join(d,'journal.sqlite'),close(){fs.rmSync(d,{recursive:true,force:true});}};}
const pr={available:true,...gh.target,state:'closed',merged:true,mergeSha:merge},live={available:true,...render.target,deployId:'dep-abc',status:'live'};
test('persistent pre-dispatch fence forbids a second write after crash or lost receipt',()=>{
 const t=temp();let db;try{db=new ActionJournal(t.file);db.prepare(gh);db.fence(gh);db.close();db=new ActionJournal(t.file);assert.equal(db.prepare(gh).state,'dispatching');assert.throws(()=>db.fence(gh));assert.throws(()=>db.prepare({...gh,target:{...gh.target,headSha:'d'.repeat(40)}}));assert.equal(db.reconcile(gh,{...pr,state:'open',merged:false}).observation.state,'unknown');assert.throws(()=>db.fence(gh));}finally{db?.close();t.close();}
});
test('two journal clients cannot both fence the same operation',()=>{
 const t=temp(),a=new ActionJournal(t.file),b=new ActionJournal(t.file);try{a.prepare(gh);b.prepare(gh);a.fence(gh);assert.throws(()=>b.fence(gh));}finally{a.close();b.close();t.close();}
});
test('GitHub read-only checks require exact PR, source and merge; current state does not attribute write',()=>{
 assert.equal(observe(gh,pr).attribution,'current-state-only');for(const change of [{repo:'other/repo'},{number:6},{base:'other'},{headSha:'d'.repeat(40)},{merged:false},{mergeSha:null},{available:false}])assert.equal(observe(gh,{...pr,...change}).state,'unknown');
});
test('Render matches exact original deploy ID and commit; newer live version cannot identify old operation',()=>{
 assert.equal(observe(render,live).state,'unknown');assert.equal(observe(render,{...live,originalDeployId:'dep-abc'}).state,'effect-present');for(const change of [{deployId:'dep-other'},{serviceId:'srv-other'},{workspaceId:'tea-other'},{commitId:'d'.repeat(40)},{status:'created'}])assert.equal(observe(render,{...live,originalDeployId:'dep-abc',...change}).state,'unknown');
});
test('receipt, reconciliation and recovery require exact event and an independent verifier',async()=>{
 const t=temp(),db=new ActionJournal(t.file);try{
  db.prepare(render);db.fence(render);assert.equal(db.reconcile(render,live).observation.state,'unknown');db.receipt(render,{operationId:render.operationId,deployId:'dep-abc'});assert.equal(db.reconcile(render,live).observation.state,'effect-present');
  const actions=db.list(event,version),e={id:event,sourceVersion:version},boundary={kind:'independent-enforced-boundary-v1',eventId:event,sourceVersion:version,processTreeTerminated:true,externalActionsComplete:true,operationIds:[render.operationId]};
  assert.deepEqual(await assessRecovery({event:e,actions,boundaryReceipt:boundary}),{allowed:false,reason:'independent-verifier-not-configured'});
  const verify=async()=>boundary;assert.deepEqual(await assessRecovery({event:e,actions,boundaryReceipt:{},verifyBoundaryReceipt:verify}),{allowed:true,scope:'new-analysis-only'});
  for(const bad of [{...boundary,processTreeTerminated:false},{...boundary,externalActionsComplete:false},{...boundary,sourceVersion:3},{...boundary,operationIds:[]},{...boundary,operationIds:[render.operationId,render.operationId]}])assert.equal((await assessRecovery({event:e,actions,boundaryReceipt:{},verifyBoundaryReceipt:async()=>bad})).allowed,false);
  assert.equal((await assessRecovery({event:{...e,sourceVersion:3},actions,boundaryReceipt:{},verifyBoundaryReceipt:verify})).allowed,false);
 }finally{db.close();t.close();}
});

test('a new operation ID cannot bypass an unresolved action on the same PR or service',()=>{
 const t=temp(),db=new ActionJournal(t.file);try{
  db.prepare(gh);db.fence(gh);assert.throws(()=>db.prepare({...gh,operationId:'github-operation-2'}));assert.throws(()=>db.prepare({...gh,operationId:'github-operation-3',target:{...gh.target,headSha:'d'.repeat(40)}}));
  db.prepare(render);db.fence(render);assert.throws(()=>db.prepare({...render,operationId:'render-operation-2',target:{...render.target,commitId:'d'.repeat(40)}}));
  assert.throws(()=>db.prepare({...render,sourceVersion:3,operationId:'render-operation-3'}));
 }finally{db.close();t.close();}
});

test('PR name casing and event/source changes cannot bypass existing pending operation',()=>{
 const t=temp(),db=new ActionJournal(t.file);try{db.prepare(gh);db.fence(gh);assert.throws(()=>db.prepare({...gh,eventId:'f'.repeat(64),sourceVersion:3,operationId:'different-operation',target:{...gh.target,repo:'FIXTURE/REPO'}}));}finally{db.close();t.close();}
});

test('lost transport reply remains fenced across restart and never calls the writer twice',async()=>{
 const t=temp();let db=new ActionJournal(t.file),writes=0;try{
  await assert.rejects(dispatchOnce(db,gh,async()=>{writes++;throw Error('response lost');}));db.close();db=new ActionJournal(t.file);
  await assert.rejects(dispatchOnce(db,gh,async()=>{writes++;return {operationId:gh.operationId,mergeSha:merge};}));assert.equal(writes,1);
 }finally{db.close();t.close();}
});

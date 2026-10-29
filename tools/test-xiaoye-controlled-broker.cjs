const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ControlledBroker}=require('./xiaoye-controlled-broker.cjs');
const leaseId='fictional-event-lease',eventId='a'.repeat(64),sourceVersion=2,commit='b'.repeat(40),mergeSha='c'.repeat(40),capability=crypto.randomBytes(32).toString('base64url');
const pull={repo:'fixture/repo',number:5,base:'main',headSha:commit},deployment={workspaceId:'tea-abc',serviceId:'srv-abc',commitId:commit};
const allowlist={githubRepos:['fixture/repo'],renderServices:[{workspaceId:'tea-abc',serviceId:'srv-abc'}]};
const req=(kind,target,operationId,extra={})=>({eventId,sourceVersion,generation:1,leaseId,capability,operationId,kind,target,...extra});
function fixture(){const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'xiaoye-broker-test-')),file=path.join(dir,'journal.sqlite');let writes=0,reads=0,loss=false,bad=false;
 const providers={async merge(t){writes++;if(loss)throw Error('reply lost');return {mergeSha}},async deploy(t){writes++;if(loss)throw Error('reply lost');return {deployId:'dep-abc'}},async readPull(t){reads++;return {available:true,...t,state:bad?'open':'closed',merged:!bad,mergeSha}},async readDeploy(t){reads++;return {available:true,...t,status:bad?'build_in_progress':'live'}}};
 const open=()=>new ControlledBroker({dbPath:file,allowlist,providers});const broker=open();const reg=broker.registerEvent({eventId,sourceVersion,generation:1,leaseId,capability,expiresAt:Date.now()+60000,maxExpiresAt:Date.now()+120000,scopes:[{kind:'github-merge',target:pull},{kind:'render-deploy',target:deployment}]});return {broker,open,providers,reg,setLoss:x=>loss=x,setBad:x=>bad=x,counts:()=>({writes,reads}),cleanup(){const p=fs.realpathSync(dir);if(path.dirname(p)!==parent||!path.basename(p).startsWith('xiaoye-broker-test-'))throw Error('Invalid cleanup path');fs.rmSync(p,{recursive:true,force:true});}};}
test('fixed actions record receipts and only provider read establishes narrow current state',async()=>{
 const f=fixture();try{
  const a=req('github-merge',pull,'fixture-merge-1'),b=req('render-deploy',deployment,'fixture-deploy-1');
  assert.equal((await f.broker.dispatch(a)).state,'receipt-recorded');assert.equal((await f.broker.reconcile({eventId,sourceVersion,generation:1,leaseId,capability,operationId:a.operationId})).state,'effect-present');
  assert.equal((await f.broker.dispatch(b)).state,'receipt-recorded');const state=await f.broker.reconcilePending(b.operationId);assert.equal(state.state,'effect-present');assert.equal(state.observation.attribution,'receipt-reported-deploy-id');assert.deepEqual(f.counts(),{writes:2,reads:2});
 }finally{f.broker.close();f.cleanup();}
});
test('unknown result survives restart, blocks a different ID and only accepts original-event read',async()=>{
 const f=fixture();let b=f.broker;try{
  const q=req('render-deploy',deployment,'fixture-deploy-1');f.setLoss(true);assert.equal((await b.dispatch(q)).state,'unknown');b.close();b=f.open();f.setLoss(false);
  await assert.rejects(b.dispatch(q));await assert.rejects(b.dispatch(req('render-deploy',{...deployment,commitId:'d'.repeat(40)},'fixture-deploy-2')));
  const out=await b.reconcilePending(q.operationId);assert.equal(out.state,'unknown','missing original deploy ID cannot be inferred from current live');assert.equal(f.counts().writes,1);
 }finally{b.close();f.cleanup();}
});
test('stale generation, expired capability, source change and forged scope cannot dispatch',async()=>{
 const f=fixture();try{
  const q=req('github-merge',pull,'fixture-merge-1');for(const bad of [{...q,generation:2},{...q,sourceVersion:3},{...q,capability:crypto.randomBytes(32).toString('base64url')},{...q,target:{...pull,headSha:'d'.repeat(40)}},{...q,target:{...pull,url:'https://example.invalid'}},{...q,url:'https://example.invalid'},{...q,kind:'proxy'}])await assert.rejects(f.broker.dispatch(bad));
  assert.equal(f.counts().writes,0);assert(f.broker.revokeEvent({eventId,sourceVersion,generation:1}).revoked);await assert.rejects(f.broker.dispatch(q));
  const cap2=crypto.randomBytes(32).toString('base64url');assert.throws(()=>f.broker.registerEvent({eventId,sourceVersion,generation:2,leaseId,capability:cap2,expiresAt:Date.now()+60000,maxExpiresAt:Date.now()+120000,scopes:[{kind:'github-merge',target:pull}]}));await assert.rejects(f.broker.dispatch(q));
 }finally{f.broker.close();f.cleanup();}
});
test('provider request in flight may finish after revoke but is recorded and never reissued',async()=>{
 const f=fixture();try{
  let resolve,started;const entered=new Promise(r=>started=r);f.providers.merge=async()=>{started();return new Promise(r=>resolve=r)};
  const q=req('github-merge',pull,'fixture-merge-1'),p=f.broker.dispatch(q);await entered;assert(f.broker.revokeEvent({eventId,sourceVersion,generation:1}).revoked);resolve({mergeSha});assert.equal((await p).state,'receipt-recorded');await assert.rejects(f.broker.dispatch(q));assert.equal((await f.broker.reconcilePending(q.operationId)).state,'effect-present');
 }finally{f.broker.close();f.cleanup();}
});
test('provider error or mismatch stays unknown; repeated same operation dispatches once',async()=>{
 const f=fixture();try{
  const q=req('github-merge',pull,'fixture-merge-1');const result=await Promise.allSettled([f.broker.dispatch(q),f.broker.dispatch(q)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.counts().writes,1);
  f.setBad(true);assert.equal((await f.broker.reconcilePending(q.operationId)).state,'unknown');f.providers.readPull=async()=>{throw Error('offline')};f.broker.clock=()=>Date.now()+6000;assert.equal((await f.broker.reconcilePending(q.operationId)).state,'unknown');assert.equal(f.counts().writes,1);
 }finally{f.broker.close();f.cleanup();}
});
test('renewal is compare-and-swap, bounded, and never revives expired or revoked event',()=>{
 const f=fixture();try{
  const b=f.broker,row=b.journal.db.prepare('SELECT expires_at,max_expires_at FROM broker_events WHERE event_id=?').get(eventId),base={eventId,sourceVersion,generation:1,leaseId,expectedExpiresAt:row.expires_at};
  assert.throws(()=>b.renewEvent({...base,leaseId:'wrong-lease',expiresAt:row.expires_at+1000}));
  assert.throws(()=>b.renewEvent({...base,expiresAt:row.max_expires_at+1}));
  assert.equal(b.renewEvent({...base,expiresAt:row.expires_at+1000}).expiresAt,row.expires_at+1000);assert.throws(()=>b.renewEvent({...base,expiresAt:row.expires_at+2000}));
  b.clock=()=>row.expires_at+1001;assert.throws(()=>b.renewEvent({...base,expectedExpiresAt:row.expires_at+1000,expiresAt:row.expires_at+2000}));
  b.revokeEvent({eventId,sourceVersion,generation:1});assert.throws(()=>b.renewEvent({...base,expectedExpiresAt:row.expires_at+1000,expiresAt:row.expires_at+2000}));
 }finally{f.broker.close();f.cleanup();}
});
test('revocation before registration leaves durable tombstone and late register cannot revive',()=>{
 const f=fixture();let b=f.broker;try{
  const id='e'.repeat(64);assert.equal(b.revokeEvent({eventId:id,sourceVersion,generation:1}).tombstone,true);b.close();b=f.open();
  assert.throws(()=>b.registerEvent({eventId:id,sourceVersion,generation:1,leaseId,capability,expiresAt:Date.now()+60000,maxExpiresAt:Date.now()+120000,scopes:[{kind:'github-merge',target:pull}]}));
 }finally{b.close();f.cleanup();}
});
test('timed-out write never resends; low-frequency read retry persists across restart',async()=>{
 const f=fixture();let b=f.broker,clock=Date.now();try{
  b.writeTimeoutMs=20;b.clock=()=>clock;f.providers.merge=async()=>new Promise(()=>{});const q=req('github-merge',pull,'fixture-merge-1');assert.equal((await b.dispatch(q)).state,'unknown');
  f.setBad(true);const first=await b.reconcilePending(q.operationId);assert.equal(first.state,'unknown');assert.equal(first.retryAt,clock+5000);const reads=f.counts().reads;
  b.close();b=f.open();b.clock=()=>clock;assert.equal((await b.reconcilePending(q.operationId)).state,'deferred');assert.equal(f.counts().reads,reads);
  clock+=5000;f.setBad(false);const recovered=await b.reconcilePending(q.operationId);assert.equal(recovered.state,'effect-present');assert.equal(recovered.observation.attribution,'current-state-only');
  await assert.rejects(b.dispatch(q));
 }finally{b.close();f.cleanup();}
});
test('supervisor source and lease mismatch fail closed, even if old event remains active',async()=>{
 const f=fixture();try{const q=req('github-merge',pull,'fixture-merge-1');await assert.rejects(f.broker.dispatch({...q,leaseId:'different-lease'}));await assert.rejects(f.broker.dispatch({...q,sourceVersion:sourceVersion+1}));assert.equal(f.counts().writes,0);}finally{f.broker.close();f.cleanup();}
});
test('supervisor keeps retrying unknown reads with bounded persisted backoff and never repeats a write',async()=>{
 const f=fixture();let b=f.broker,now=Date.now();try{
  b.clock=()=>now;const q=req('render-deploy',deployment,'fixture-deploy-1');f.setLoss(true);assert.equal((await b.dispatch(q)).state,'unknown');
  for(let i=0;i<14;i++){const result=await b.reconcilePending(q.operationId);assert.equal(result.state,'unknown');assert(result.retryAt>now&&result.retryAt-now<=900000);assert.equal((await b.reconcilePending(q.operationId)).state,'deferred');now=result.retryAt;}
  assert.equal(f.counts().writes,1);assert.equal(f.counts().reads,14);
 }finally{b.close();f.cleanup();}
});

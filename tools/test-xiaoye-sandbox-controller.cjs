const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SandboxController}=require('./xiaoye-sandbox-controller.cjs');
function fixture(options={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-sandbox-fake-')),dbPath=path.join(folder,'case.sqlite'),resources=new Map(),calls=[];let now=1000000,seq=0;
 const provider={testOnly:true,async create(v){calls.push(['create',v]);const r={id:'sandbox-'+(++seq),intentId:v.intentId,state:'running'};resources.set(r.id,r);return r;},async start(v){calls.push(['start',v]);return {intentId:v.intentId,runId:'run-'+String(++seq).padStart(8,'0')};},async terminate(v){calls.push(['terminate',v]);const r=resources.get(v.sandboxId);if(r)r.state='terminated';return {accepted:true};},async inspect(v){calls.push(['inspect',v]);const r=resources.get(v.sandboxId);return r?{id:r.id,state:r.state,authoritative:true}:null;},async findByIntent(v){calls.push(['find',v]);return {complete:true,items:[...resources.values()].filter(r=>r.intentId===v.intentId)};}};
 const broker={async registerEvent(v){calls.push(['register',v]);return {eventId:v.eventId,sourceVersion:v.sourceVersion,generation:v.generation};},async renewEvent(v){calls.push(['renew',v]);return {eventId:v.eventId,generation:v.generation,expiresAt:v.expiresAt};},async revokeEvent(v){calls.push(['revoke',v]);return {revoked:true};}};
 const make=()=>new SandboxController({dbPath,provider,broker,clock:()=>now,requestTimeoutMs:20,maxLifetimeMs:10000,...options});
 const grant={eventId:'a'.repeat(64),sourceVersion:2,generation:4,capability:'A'.repeat(43),scopes:[{kind:'github-merge',target:{repo:'fixture/repo',number:1,base:'main',headSha:'b'.repeat(40)}}],leaseUntil:now+3000};
 return {folder,dbPath,provider,broker,resources,calls,grant,make,advance:ms=>now+=ms};
}
test('sandbox is per event with exact egress, clean environment and short scoped capability',async()=>{
 const f=fixture({networkHosts:['broker.example.test','model.example.test']}),c=f.make();try{
  const r=await c.start(f.grant),created=f.calls.find(x=>x[0]==='create')[1];assert.equal(r.state,'ready');assert.deepEqual(created.networkPolicy,{type:'allow-list',rules:[{domain:'broker.example.test'},{domain:'model.example.test'}]});
  assert.deepEqual(created.environment,{LANG:'C.UTF-8',TZ:'UTC',XIAOYE_EVENT_ID:f.grant.eventId,XIAOYE_SOURCE_VERSION:'2',XIAOYE_GENERATION:'4',XIAOYE_EVENT_LEASE_ID:r.lease_id,XIAOYE_EVENT_CAPABILITY:f.grant.capability});assert(!JSON.stringify(r).includes(f.grant.capability));assert(!('RENDER_API_KEY' in created.environment));
  await assert.rejects(c.start(f.grant),{code:'duplicate'});assert.equal(f.calls.filter(x=>x[0]==='create').length,1);
 }finally{c.close();}
 assert.throws(()=>fixture({networkHosts:['*.example.test']}).make(),/exact lowercase/);
 assert.throws(()=>new SandboxController({dbPath:f.dbPath,provider:{},broker:f.broker}),/fake provider/);
});
test('unknown create is reconciled read-only and never recreated or launched',async()=>{
 const f=fixture(),original=f.provider.create;f.provider.create=async v=>{await original(v);throw Error('response lost');};const c=f.make();try{
  await assert.rejects(c.start(f.grant),{code:'create_unknown'});await assert.rejects(c.start(f.grant),{code:'duplicate'});
  const seen=await c.inspect(f.grant);assert.equal(seen.observation,'running');assert.equal(seen.record.state,'create_unknown');assert.equal(f.calls.filter(x=>x[0]==='create').length,1);
  await assert.rejects(c.execute({...f.grant,operationId:'operation-111',command:'synthetic'}),{code:'expired'});
 }finally{c.close();}
});
test('unknown create with zero, multiple or mismatched matches stays unbound',async()=>{
 const f=fixture();f.provider.create=async()=>{throw Error('lost');};const c=f.make();try{
  await assert.rejects(c.start(f.grant),{code:'create_unknown'});
  for(const items of [[],[{id:'sandbox-1',intentId:'other-id'}],[{id:'sandbox-1'},{id:'sandbox-2'}]]){f.provider.findByIntent=async()=>({complete:true,items});const out=await c.inspect(f.grant);assert.equal(out.observation,'creation-unknown');assert.equal(out.record.sandbox_id,null);}
 }finally{c.close();}
});
test('lost work response is unknown and cannot be resent across controller restart',async()=>{
 const f=fixture();f.provider.start=async v=>{f.calls.push(['start',v]);throw Error('response lost');};let c=f.make();try{
  await c.start(f.grant);await assert.rejects(c.execute({...f.grant,operationId:'operation-111',command:'synthetic'}),{code:'run_unknown'});c.close();c=f.make();
  await assert.rejects(c.execute({...f.grant,operationId:'operation-111',command:'synthetic'}),{code:'expired'});assert.equal(f.calls.filter(x=>x[0]==='start').length,1);
 }finally{c.close();}
});
test('disconnect is not exit; expiry revokes before stop and preserves unknown effects',async()=>{
 const f=fixture(),c=f.make();try{
  await c.start(f.grant);await c.execute({...f.grant,operationId:'operation-111',command:'synthetic'});await c.disconnected(f.grant);
  assert.equal((await c.inspect(f.grant)).observation,'running');assert.equal(f.calls.filter(x=>x[0]==='terminate').length,0);
  f.advance(3001);const stopped=await c.expire(f.grant);assert.equal(stopped.state,'stop_unknown');assert.equal(stopped.external_unknown,1);
  assert(f.calls.findIndex(x=>x[0]==='revoke')<f.calls.findIndex(x=>x[0]==='terminate'));
  const status=await c.inspect(f.grant);assert.equal(status.observation,'terminated');assert.equal(status.record.external_unknown,1);await c.stop(f.grant);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);
 }finally{c.close();}
});
test('timeout of termination is not repeated; later status observation is read-only',async()=>{
 const f=fixture(),orig=f.provider.terminate;f.provider.terminate=async v=>{await orig(v);return new Promise(()=>{});};const c=f.make();try{
  await c.start(f.grant);await assert.rejects(c.stop(f.grant),{code:'stop_unknown'});await c.stop(f.grant);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);assert.equal((await c.inspect(f.grant)).observation,'terminated');
 }finally{c.close();}
});
test('cancel during create does not launch or register after a late response',async()=>{
 const f=fixture(),orig=f.provider.create;let release,started;const began=new Promise(resolve=>started=resolve);f.provider.create=async v=>{const result=await orig(v);started();await new Promise(resolve=>{release=resolve});return result;};const c=f.make();try{
  const pending=c.start(f.grant);await began;await assert.rejects(c.stop(f.grant),{code:'stop_unknown'});release();await assert.rejects(pending,{code:'expired'});assert.equal(f.calls.filter(x=>x[0]==='register').length,0);
  await c.stop(f.grant);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);assert.equal((await c.inspect(f.grant)).observation,'terminated');
 }finally{c.close();}
});
test('cancel during work launch does not revive authority or repeat dispatch',async()=>{
 const f=fixture();let release,started;const began=new Promise(resolve=>started=resolve);f.provider.start=async v=>{f.calls.push(['start',v]);started();await new Promise(resolve=>{release=resolve});return {intentId:v.intentId,runId:'run-11111111'};};const c=f.make();try{
  await c.start(f.grant);const pending=c.execute({...f.grant,operationId:'operation-111',command:'synthetic'});await began;await c.stop(f.grant);release();await assert.rejects(pending,{code:'unknown'});assert.equal(c.read(f.grant.eventId).state,'stop_unknown');assert.equal(f.calls.filter(x=>x[0]==='start').length,1);
 }finally{c.close();}
});
test('source, capability, generation and time guards reject stale work and renewal',async()=>{
 const f=fixture(),c=f.make();try{
  await c.start(f.grant);for(const change of [{sourceVersion:3},{generation:5},{capability:'other-capability-111'}])await assert.rejects(c.renew({...f.grant,...change,leaseUntil:1004000}),{code:'authority'});
  f.advance(3001);await assert.rejects(c.renew({...f.grant,leaseUntil:1005000}),{code:'expired'});await c.expire(f.grant);await assert.rejects(c.renew({...f.grant,leaseUntil:1005000}),{code:'expired'});
 }finally{c.close();}
});
test('renewal is bounded and coordinates the exact broker lease',async()=>{
 const f=fixture(),c=f.make();try{
  const initial=await c.start(f.grant),renewed=await c.renew({...f.grant,leaseUntil:1006000}),call=f.calls.find(x=>x[0]==='renew')[1];
  assert.equal(renewed.lease_until,1006000);assert.equal(call.leaseId,initial.lease_id);assert.equal(call.expectedExpiresAt,initial.lease_until);assert.equal(call.expiresAt,1006000);
  await assert.rejects(c.renew({...f.grant,leaseUntil:1010001}),{code:'expired'});
 }finally{c.close();}
});
test('unconfirmed broker renewal requests revocation and termination instead of granting work',async()=>{
 const f=fixture(),c=f.make();try{
  await c.start(f.grant);f.broker.renewEvent=async()=>{throw Error('unknown');};await assert.rejects(c.renew({...f.grant,leaseUntil:1005000}),{code:'broker_unknown'});
  assert.equal(c.read(f.grant.eventId).state,'stop_unknown');assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);await assert.rejects(c.execute({...f.grant,operationId:'operation-111',command:'synthetic'}),{code:'expired'});
 }finally{c.close();}
});
test('cancel during broker registration cannot mark sandbox ready or launch',async()=>{
 const f=fixture();let release,started,revoked=false;const began=new Promise(resolve=>started=resolve);
 f.broker.registerEvent=async()=>{started();await new Promise(resolve=>{release=resolve});if(revoked)throw Error('event revoked');};f.broker.revokeEvent=async()=>{revoked=true;return {revoked:true};};
 const c=f.make();try{const pending=c.start(f.grant);await began;await assert.rejects(c.execute({...f.grant,operationId:'operation-111',command:'synthetic'}),{code:'expired'});await c.stop(f.grant);release();await assert.rejects(pending,{code:'broker'});assert(revoked);assert.equal(f.calls.filter(x=>x[0]==='start').length,0);assert.equal(c.read(f.grant.eventId).state,'stop_unknown');}finally{c.close();}
});
test('unconfirmed broker revoke still terminates, but does not certify containment',async()=>{
 const f=fixture(),c=f.make();let allowed=false;f.broker.revokeEvent=async()=>{if(!allowed)throw Error('offline');return {revoked:true};};try{
  await c.start(f.grant);await assert.rejects(c.stop(f.grant),{code:'broker_unknown'});assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);assert.equal((await c.inspect(f.grant)).observation,'terminated-broker-unconfirmed');
  await c.disconnected(f.grant);assert.equal(c.read(f.grant.eventId).state,'stop_unknown');allowed=true;await c.stop(f.grant);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);assert.equal((await c.inspect(f.grant)).observation,'terminated');
 }finally{c.close();}
});
test('concurrent dispatches from two controllers launch only once',async()=>{
 const f=fixture(),a=f.make(),b=f.make();try{
  await a.start(f.grant);const results=await Promise.allSettled([a.execute({...f.grant,operationId:'operation-111',command:'synthetic'}),b.execute({...f.grant,operationId:'operation-222',command:'synthetic'})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.calls.filter(x=>x[0]==='start').length,1);
 }finally{a.close();b.close();}
});

test('restart sweep stops expired work without guest credential and keeps external outcome unknown',async()=>{
 const f=fixture();let c=f.make();try{await c.start(f.grant);await c.execute({...f.grant,operationId:'operation-111',command:'synthetic'});c.close();f.advance(3001);c=f.make();const page=await c.recover();assert.equal(page.results[0].observation,'terminated');assert.equal(c.read(f.grant.eventId).external_unknown,1);assert.equal(f.calls.filter(x=>x[0]==='start').length,1);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);await c.recover();assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);}finally{c.close();}
});
test('restart sweep observes active work without dispatching or stopping it',async()=>{
 const f=fixture();let c=f.make();try{await c.start(f.grant);await c.execute({...f.grant,operationId:'operation-111',command:'synthetic'});c.close();c=f.make();const page=await c.recover();assert.equal(page.results[0].observation,'running');assert.equal(f.calls.filter(x=>x[0]==='start').length,1);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,0);}finally{c.close();}
});
test('restart after unconfirmed create finds identity and later stops without another create',async()=>{
 const f=fixture(),orig=f.provider.create;f.provider.create=async v=>{await orig(v);throw Error('lost');};let c=f.make();try{await assert.rejects(c.start(f.grant),{code:'create_unknown'});c.close();f.advance(3001);c=f.make();await c.recover();assert.equal(c.read(f.grant.eventId).state,'stop_requested');const page=await c.recover();assert.equal(page.results[0].observation,'terminated');assert.equal(f.calls.filter(x=>x[0]==='create').length,1);assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);}finally{c.close();}
});
test('missing revoke acknowledgement remains unknown across restart and is retried read safely',async()=>{
 const f=fixture();let c=f.make(),confirmed=false;f.broker.revokeEvent=async()=>confirmed?{revoked:true}:{revoked:false};try{await c.start(f.grant);await assert.rejects(c.stop(f.grant),{code:'broker_unknown'});c.close();c=f.make();assert.equal((await c.recover()).results[0].observation,'terminated-broker-unconfirmed');confirmed=true;assert.equal((await c.recover()).results[0].observation,'terminated');assert.equal(f.calls.filter(x=>x[0]==='terminate').length,1);}finally{c.close();}
});
test('recovery pagination reaches later events without starving them',async()=>{
 const f=fixture(),c=f.make();try{await c.start(f.grant);const second={...f.grant,eventId:'b'.repeat(64)};await c.start(second);const a=await c.recover({limit:1});assert.equal(a.results[0].eventId,f.grant.eventId);assert.equal(a.nextCursor,f.grant.eventId);const b=await c.recover({afterEventId:a.nextCursor,limit:1});assert.equal(b.results[0].eventId,second.eventId);assert.equal(f.calls.filter(x=>x[0]==='start').length,0);}finally{c.close();}
});
test('malformed registration and renewal acknowledgements cannot grant authority',async()=>{
 {const f=fixture(),c=f.make();f.broker.registerEvent=async()=>({});try{await assert.rejects(c.start(f.grant),{code:'broker'});assert.equal(c.read(f.grant.eventId).state,'stop_unknown');}finally{c.close();}}
 {const f=fixture(),c=f.make();try{await c.start(f.grant);f.broker.renewEvent=async()=>({});await assert.rejects(c.renew({...f.grant,leaseUntil:1005000}),{code:'broker_unknown'});assert.equal(c.read(f.grant.eventId).state,'stop_unknown');}finally{c.close();}}
});

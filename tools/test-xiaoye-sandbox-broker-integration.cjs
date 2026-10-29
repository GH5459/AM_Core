// Run only against an explicitly supplied, local prototype broker module.
// All providers are fictional and make no external calls.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SandboxController}=require('./xiaoye-sandbox-controller.cjs');
if(!process.argv[2])throw Error('Pass an absolute path to the local prototype broker module');
const {ControlledBroker}=require(path.resolve(process.argv[2]));
test('controller and durable fake broker coordinate renewal, unknown actions, restart and revocation',async()=>{
 const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'xiaoye-sandbox-broker-'));let now=1000000,writes=0,reads=0;
 const eventId='a'.repeat(64),target={repo:'fixture/repo',number:5,base:'main',headSha:'b'.repeat(40)},capability=crypto.randomBytes(32).toString('base64url');
 const providers={async merge(){writes++;throw Error('response lost');},async deploy(){throw Error('unexpected');},async readPull(){reads++;return {available:false};},async readDeploy(){throw Error('unexpected');}};
 const broker=new ControlledBroker({dbPath:path.join(dir,'broker.sqlite'),allowlist:{githubRepos:['fixture/repo'],renderServices:[]},providers,clock:()=>now});
 const boxes=new Map();const sandbox={testOnly:true,async create(v){const r={id:'sandbox-111',intentId:v.intentId,state:'running'};boxes.set(r.id,r);return r;},async start(v){return {intentId:v.intentId,runId:'run-111111'};},async terminate(v){boxes.get(v.sandboxId).state='terminated';return {accepted:true};},async inspect(v){return {id:v.sandboxId,state:boxes.get(v.sandboxId).state,authoritative:true};},async findByIntent(v){return {complete:true,items:[...boxes.values()].filter(x=>x.intentId===v.intentId)};}};
 const open=()=>new SandboxController({dbPath:path.join(dir,'control.sqlite'),provider:sandbox,broker,clock:()=>now,maxLifetimeMs:7200000}),grant={eventId,sourceVersion:2,generation:1,capability,leaseUntil:now+1800000,scopes:[{kind:'github-merge',target}]};let c=open();
 try{
  let row=await c.start(grant);await c.execute({...grant,operationId:'sandbox-work-1',command:'fixture'});now+=1790000;row=await c.renew({...grant,leaseUntil:now+600000});now+=20000;
  const op={eventId,sourceVersion:2,generation:1,capability,leaseId:row.lease_id,kind:'github-merge',target,operationId:'fixture-merge-1'};
  assert.equal((await broker.dispatch(op)).state,'unknown');c.close();c=open();assert.equal((await c.recover()).results[0].observation,'running');assert.equal((await broker.reconcilePending(op.operationId)).state,'unknown');assert.equal(reads,1);
  await assert.rejects(broker.dispatch(op));await c.stop(grant);assert.equal((await c.inspect(grant)).observation,'terminated');await assert.rejects(broker.dispatch({...op,operationId:'another-merge-1'}));assert.equal(c.read(eventId).external_unknown,1);assert.equal(writes,1);
 }finally{c.close();broker.close();const resolved=fs.realpathSync(dir);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('xiaoye-sandbox-broker-'))throw Error('invalid cleanup');fs.rmSync(resolved,{recursive:true,force:true});}
});

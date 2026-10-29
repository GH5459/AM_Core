'use strict';
// Executable in-process prototype: the only supplied transports are fake in
// the test/demo. This is not a network service or an OS security boundary.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ActionJournal,intent}=require('./xiaoye-controlled-action-journal.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const keys=(o,allowed)=>{assert(o&&typeof o==='object'&&!Array.isArray(o));assert(Object.keys(o).every(k=>allowed.includes(k)),'Unsupported field');};
const targetKeys=kind=>kind==='github-merge'?['repo','number','base','headSha']:kind==='render-deploy'?['workspaceId','serviceId','commitId']:[];
function normalized(x){keys(x,['eventId','sourceVersion','generation','operationId','kind','target']);keys(x.target,targetKeys(x.kind));assert(Number.isSafeInteger(x.generation)&&x.generation>0,'Missing generation');return intent(x);}
async function bounded(call,ms){let timer;try{return await Promise.race([Promise.resolve().then(call),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Provider timeout')),ms);})]);}finally{clearTimeout(timer);}}
function validCapability(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(v);}
function scoped(i,scopes){return scopes.some(s=>s.kind===i.kind&&JSON.stringify(s.target)===JSON.stringify(i.target));}
class ControlledBroker{
 constructor({dbPath,allowlist,providers,clock=Date.now,writeTimeoutMs=30000,readTimeoutMs=10000}){
  assert(Number.isSafeInteger(writeTimeoutMs)&&writeTimeoutMs>=10&&writeTimeoutMs<=120000&&Number.isSafeInteger(readTimeoutMs)&&readTimeoutMs>=10&&readTimeoutMs<=120000,'Invalid provider deadline');this.writeTimeoutMs=writeTimeoutMs;this.readTimeoutMs=readTimeoutMs;
  keys(allowlist,['githubRepos','renderServices']);assert(Array.isArray(allowlist.githubRepos)&&Array.isArray(allowlist.renderServices));
  this.allowlist={githubRepos:allowlist.githubRepos.map(x=>String(x).toLowerCase()),renderServices:allowlist.renderServices.map(x=>{keys(x,['workspaceId','serviceId']);return {...x};})};
  assert(providers&&['merge','readPull','deploy','readDeploy'].every(k=>typeof providers[k]==='function'),'Missing fixed provider adapter');
  this.providers=providers;this.clock=clock;this.journal=new ActionJournal(dbPath);
  this.journal.db.exec('CREATE TABLE IF NOT EXISTS broker_events(event_id TEXT PRIMARY KEY,source_version INTEGER NOT NULL,generation INTEGER NOT NULL,capability_hash TEXT NOT NULL,lease_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,max_expires_at INTEGER NOT NULL,state TEXT NOT NULL,scopes TEXT NOT NULL); CREATE TABLE IF NOT EXISTS broker_rechecks(operation_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL,next_at INTEGER NOT NULL);');
 }
 close(){this.journal.close();}
 permitted(i){return i.kind==='github-merge'?this.allowlist.githubRepos.includes(i.target.repo):this.allowlist.renderServices.some(x=>x.workspaceId===i.target.workspaceId&&x.serviceId===i.target.serviceId);}
 // Supervisor-only methods; not exposed to a guest transport. Real deployment
 // must enforce this separation independently of this class.
 registerEvent(v){
  keys(v,['eventId','sourceVersion','generation','leaseId','capability','expiresAt','maxExpiresAt','scopes']);assert(typeof v.leaseId==='string'&&v.leaseId.length>=8&&v.leaseId.length<=180&&validCapability(v.capability)&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>this.clock()&&Number.isSafeInteger(v.maxExpiresAt)&&v.maxExpiresAt>=v.expiresAt&&v.maxExpiresAt<=this.clock()+7200000&&Array.isArray(v.scopes)&&v.scopes.length>0&&v.scopes.length<=20,'Invalid event registration');
  const scopes=v.scopes.map(x=>{keys(x,['kind','target']);const i=normalized({eventId:v.eventId,sourceVersion:v.sourceVersion,generation:v.generation,operationId:'scope-only',...x});assert(this.permitted(i),'Outside configured scope');return {kind:i.kind,target:i.target};});
  assert(new Set(scopes.map(JSON.stringify)).size===scopes.length,'Duplicate scope');const cap=hash(v.capability);
  return this.journal.tx(()=>{const old=this.journal.db.prepare('SELECT * FROM broker_events WHERE event_id=?').get(v.eventId);if(old){assert.equal(old.state,'active','Revoked event cannot be revived');assert.equal(old.source_version,v.sourceVersion);assert.equal(old.generation,v.generation);assert.equal(old.capability_hash,cap);assert.equal(old.lease_hash,hash(v.leaseId));assert.equal(old.expires_at,v.expiresAt);assert.equal(old.max_expires_at,v.maxExpiresAt);assert.equal(old.scopes,JSON.stringify(scopes));return {eventId:v.eventId,sourceVersion:v.sourceVersion,generation:v.generation,replayed:true};}
   this.journal.db.prepare('INSERT INTO broker_events VALUES(?,?,?,?,?,?,?,?,?)').run(v.eventId,v.sourceVersion,v.generation,cap,hash(v.leaseId),v.expiresAt,v.maxExpiresAt,'active',JSON.stringify(scopes));return {eventId:v.eventId,sourceVersion:v.sourceVersion,generation:v.generation};});
 }
 revokeEvent(v){keys(v,['eventId','sourceVersion','generation']);assert(/^[a-f0-9]{64}$/.test(v.eventId||'')&&Number.isSafeInteger(v.sourceVersion)&&v.sourceVersion>=0&&Number.isSafeInteger(v.generation)&&v.generation>0,'Invalid event');return this.journal.tx(()=>{const old=this.journal.db.prepare('SELECT * FROM broker_events WHERE event_id=?').get(v.eventId);if(!old){this.journal.db.prepare('INSERT INTO broker_events VALUES(?,?,?,?,?,?,?,?,?)').run(v.eventId,v.sourceVersion,v.generation,'', '',0,0,'revoked','[]');return {revoked:true,tombstone:true};}assert.equal(old.source_version,v.sourceVersion,'Original source mismatch');assert.equal(old.generation,v.generation,'Original generation mismatch');if(old.state==='revoked')return {revoked:true,replayed:true};this.journal.db.prepare("UPDATE broker_events SET state='revoked' WHERE event_id=?").run(v.eventId);return {revoked:true};});}
 renewEvent(v){keys(v,['eventId','sourceVersion','generation','leaseId','expectedExpiresAt','expiresAt']);assert(typeof v.leaseId==='string'&&Number.isSafeInteger(v.expectedExpiresAt)&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>v.expectedExpiresAt,'Invalid renewal');return this.journal.tx(()=>{const r=this.journal.db.prepare('SELECT * FROM broker_events WHERE event_id=?').get(v.eventId);assert(r&&r.source_version===v.sourceVersion&&r.generation===v.generation&&r.state==='active'&&r.lease_hash===hash(v.leaseId)&&r.expires_at===v.expectedExpiresAt&&r.expires_at>this.clock()&&v.expiresAt<=r.max_expires_at,'Renewal expired or changed');this.journal.db.prepare('UPDATE broker_events SET expires_at=? WHERE event_id=?').run(v.expiresAt,v.eventId);return {eventId:v.eventId,generation:v.generation,expiresAt:v.expiresAt};});}
 authorize(i,cap,leaseId){assert(validCapability(cap)&&typeof leaseId==='string','Invalid capability or lease');const r=this.journal.db.prepare('SELECT * FROM broker_events WHERE event_id=?').get(i.eventId);assert(r&&r.source_version===i.sourceVersion&&r.generation===i.generation&&r.state==='active'&&r.expires_at>this.clock()&&r.lease_hash===hash(leaseId),'Event lease expired or changed');const a=Buffer.from(r.capability_hash,'hex'),b=Buffer.from(hash(cap),'hex');assert(a.length===b.length&&crypto.timingSafeEqual(a,b),'Invalid capability');assert(this.permitted(i)&&scoped(i,JSON.parse(r.scopes)),'Action outside event scope');return r;}
 async dispatch(v){
  keys(v,['eventId','sourceVersion','generation','leaseId','capability','operationId','kind','target']);const {capability,leaseId,...request}=v,i=normalized(request);
  // Generation check and durable dispatch fence share one SQLite transaction.
  // Once fenced, a crash or a lost provider response never resends the write.
  this.journal.tx(()=>{this.authorize(i,capability,leaseId);this.journal.prepareLocked(i);this.journal.fenceLocked(i);});
  // Reduces the revocation window but cannot cancel a request already in flight.
  try{this.authorize(i,capability,leaseId);}catch{return {operationId:i.operationId,state:'unknown'};}
  try{
   const result=await bounded(()=>{
    // bounded schedules this callback in a later microtask; authorization may
    // have expired or been revoked after the earlier check but before entry.
    // Check again synchronously at the last point before invoking the adapter.
    this.authorize(i,capability,leaseId);
    return i.kind==='github-merge'?this.providers.merge({...i.target}):this.providers.deploy({...i.target});
   },this.writeTimeoutMs);
   const receipt=i.kind==='github-merge'?{operationId:i.operationId,mergeSha:result?.mergeSha}:{operationId:i.operationId,deployId:result?.deployId};
   this.journal.receipt(i,receipt);return {operationId:i.operationId,state:'receipt-recorded'};
  }catch{return {operationId:i.operationId,state:'unknown'};}
 }
 async reconcile(v){
  keys(v,['eventId','sourceVersion','generation','leaseId','capability','operationId']);const row=this.journal.get(v.operationId);assert(row,'Unknown operation');const i=normalized(row.intent);
  assert(i.eventId===v.eventId&&i.sourceVersion===v.sourceVersion&&i.generation===v.generation,'Original event mismatch');this.authorize(i,v.capability,v.leaseId);return this.readObservation(i);
 }
 // Supervisor may examine original operations after revocation without granting
 // the old guest any authority or changing the old source version.
 async reconcilePending(operationId){const row=this.journal.get(operationId);assert(row,'Unknown operation');return this.readObservation(normalized(row.intent));}
 async readObservation(i){
  const old=this.journal.get(i.operationId);if(old.state==='observed')return {operationId:i.operationId,state:'observed',observation:old.observation,requestTerminal:true};
  if(!['dispatching','receipt-recorded'].includes(old.state))return {operationId:i.operationId,state:'unknown'};
  // Persist the next eligible read time before calling any provider. This is
  // a bounded-rate read-only retry, not a retry of the external write.
  const retry=this.journal.tx(()=>{const now=this.clock(),row=this.journal.db.prepare('SELECT * FROM broker_rechecks WHERE operation_id=?').get(i.operationId);if(row&&row.next_at>now)return {deferred:true,retryAt:row.next_at};const attempts=(row?.attempts||0)+1,nextAt=now+Math.min(900000,5000*2**Math.min(attempts-1,8));this.journal.db.prepare('INSERT INTO broker_rechecks VALUES(?,?,?) ON CONFLICT(operation_id) DO UPDATE SET attempts=excluded.attempts,next_at=excluded.next_at').run(i.operationId,attempts,nextAt);return {deferred:false,retryAt:nextAt};});
  if(retry.deferred)return {operationId:i.operationId,state:'deferred',retryAt:retry.retryAt};
  let result;try{result=await bounded(()=>i.kind==='github-merge'?this.providers.readPull({...i.target}):this.providers.readDeploy({...i.target,deployId:old.receipt?.deployId||null}),this.readTimeoutMs);}catch{return {operationId:i.operationId,state:'unknown',retryAt:retry.retryAt};}
  const out=this.journal.reconcile(i,result),requestTerminal=out.action.state==='observed',state=requestTerminal?out.observation.state:'unknown';return {operationId:i.operationId,state,observation:out.observation,requestTerminal,...state==='unknown'?{retryAt:retry.retryAt}:{}};
 }
}
module.exports={ControlledBroker};
if(require.main===module){
 if(process.argv[2]!=='--demo'){console.error('Only --demo with fictional providers is available');process.exitCode=2;}
 else (async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'xiaoye-broker-demo-'));
  const eventId='a'.repeat(64),sourceVersion=1,generation=1,leaseId='demo-lease',capability=crypto.randomBytes(32).toString('base64url'),headSha='b'.repeat(40),mergeSha='c'.repeat(40),target={repo:'example/demo',number:1,base:'main',headSha};let broker;
  try{
   broker=new ControlledBroker({dbPath:path.join(dir,'journal.sqlite'),allowlist:{githubRepos:['example/demo'],renderServices:[]},providers:{async merge(){return {mergeSha}},async readPull(t){return {available:true,...t,state:'closed',merged:true,mergeSha}},async deploy(){throw Error('disabled')},async readDeploy(){return {available:false}}}});
   broker.registerEvent({eventId,sourceVersion,generation,leaseId,capability,expiresAt:Date.now()+30000,maxExpiresAt:Date.now()+60000,scopes:[{kind:'github-merge',target}]});
   const receipt=await broker.dispatch({eventId,sourceVersion,generation,leaseId,capability,operationId:'demo-operation-1',kind:'github-merge',target}),observation=await broker.reconcilePending('demo-operation-1');console.log(JSON.stringify({fixture:true,receipt:receipt.state,observation:observation.state,attribution:observation.observation?.attribution}));
  }finally{broker?.close();const p=fs.realpathSync(dir);if(path.dirname(p)!==parent||!path.basename(p).startsWith('xiaoye-broker-demo-'))throw Error('Invalid cleanup path');fs.rmSync(p,{recursive:true,force:true});}
 })().catch(e=>{console.error(e.message);process.exitCode=1});
}

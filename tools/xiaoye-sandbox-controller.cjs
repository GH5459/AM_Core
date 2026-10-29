'use strict';
// Isolated prototype. It intentionally accepts only a fake provider; this is
// not a Render adapter or evidence that a real sandbox has been isolated.
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const err=(message,code)=>Object.assign(Error(message),{code});
const idOk=s=>typeof s==='string'&&/^[a-zA-Z0-9:_-]{8,180}$/.test(s);

class SandboxController {
 constructor({dbPath,provider,broker,clock=Date.now,requestTimeoutMs=1000,maxLifetimeMs=7200000,networkHosts=[]}){
  if(!dbPath||provider?.testOnly!==true||!broker||typeof clock!=='function')throw Error('isolated fake provider and broker are required');
  if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1||maxLifetimeMs>7200000)throw Error('invalid deadline');
  if(!Array.isArray(networkHosts)||networkHosts.some(h=>typeof h!=='string'||!/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(h)))throw Error('egress hosts must be exact lowercase DNS names');
  this.provider=provider;this.broker=broker;this.clock=clock;this.requestTimeoutMs=requestTimeoutMs;this.maxLifetimeMs=maxLifetimeMs;this.networkHosts=[...new Set(networkHosts)].sort();
  this.db=new DatabaseSync(dbPath);this.db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sandbox_runs(event_id TEXT PRIMARY KEY,source_version INTEGER NOT NULL,generation INTEGER NOT NULL,capability_hash TEXT NOT NULL,lease_id TEXT NOT NULL,scopes TEXT NOT NULL,created_at INTEGER NOT NULL,deadline INTEGER NOT NULL,lease_until INTEGER NOT NULL,state TEXT NOT NULL,create_intent TEXT NOT NULL UNIQUE,sandbox_id TEXT,work_intent TEXT UNIQUE,run_id TEXT,stop_intent TEXT UNIQUE,broker_revoked INTEGER NOT NULL DEFAULT 0,external_unknown INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1)");
 }
 close(){this.db.close();}
 read(eventId){const r=this.db.prepare('SELECT * FROM sandbox_runs WHERE event_id=?').get(eventId);return r?clone(r):null;}
 update(eventId,revision,fields){const keys=Object.keys(fields);if(!keys.length)return false;const sql='UPDATE sandbox_runs SET '+keys.map(k=>k+'=?').join(',')+',revision=revision+1 WHERE event_id=? AND revision=?';return this.db.prepare(sql).run(...keys.map(k=>fields[k]),eventId,revision).changes===1;}
 async bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(err('provider outcome unknown','timeout')),this.requestTimeoutMs);})]);}finally{clearTimeout(timer);}}
 assertIdentity(row,v,{lease=true}={}){
  if(!row||row.event_id!==v.eventId||row.source_version!==v.sourceVersion||row.generation!==v.generation||typeof v.capability!=='string'||row.capability_hash!==hash(v.capability))throw err('event authority does not match','authority');
  if(lease&&(row.lease_until<=this.clock()||row.deadline<=this.clock()||!['creating','ready','starting','running'].includes(row.state)))throw err('event authority is no longer active','expired');
 }
 // persist the creation intent before the fake provider is called
 async start({eventId,sourceVersion,generation,capability,scopes,leaseUntil}){
  const now=this.clock();if(!/^[a-f0-9]{64}$/.test(eventId||'')||!Number.isSafeInteger(sourceVersion)||sourceVersion<0||!Number.isSafeInteger(generation)||generation<1||typeof capability!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(capability)||!Array.isArray(scopes)||!Number.isSafeInteger(leaseUntil)||leaseUntil<=now)throw Error('invalid event grant');
  const createIntent=crypto.randomUUID(),leaseId=crypto.randomUUID(),deadline=now+this.maxLifetimeMs,lease=Math.min(leaseUntil,deadline),scopeJson=JSON.stringify(scopes);
  try{this.db.prepare("INSERT INTO sandbox_runs(event_id,source_version,generation,capability_hash,lease_id,scopes,created_at,deadline,lease_until,state,create_intent) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(eventId,sourceVersion,generation,hash(capability),leaseId,scopeJson,now,deadline,lease,'creating',createIntent);}catch{throw err('event already has a persisted creation intent','duplicate');}
  let sandbox;try{sandbox=await this.bounded(()=>this.provider.create({intentId:createIntent,eventId,sourceVersion,generation,timeoutMs:deadline-now,networkPolicy:this.networkHosts.length?{type:'allow-list',rules:this.networkHosts.map(domain=>({domain}))}:{type:'deny-all'},environment:{LANG:'C.UTF-8',TZ:'UTC',XIAOYE_EVENT_ID:eventId,XIAOYE_SOURCE_VERSION:String(sourceVersion),XIAOYE_GENERATION:String(generation),XIAOYE_EVENT_LEASE_ID:leaseId,XIAOYE_EVENT_CAPABILITY:capability}}));}
  catch(e){const r=this.read(eventId);if(r?.state==='creating')this.update(eventId,r.revision,{state:'create_unknown'});throw err('sandbox creation outcome unknown','create_unknown');}
  const r=this.read(eventId);if(!sandbox||!idOk(sandbox.id)||sandbox.intentId!==createIntent){if(r?.state==='creating')this.update(eventId,r.revision,{state:'create_unknown'});throw err('sandbox creation identity unconfirmed','create_unknown');}
  if(!r||!['creating','stop_requested','stop_unknown'].includes(r.state)||!this.update(eventId,r.revision,{sandbox_id:sandbox.id,state:r.state==='creating'?'registering':r.state}))throw err('concurrent sandbox state changed','unknown');
  const saved=this.read(eventId);if(saved.state!=='registering'||saved.lease_until<=this.clock()||saved.deadline<=this.clock()){await this.stopRecord(eventId).catch(()=>{});throw err('sandbox recorded but authority ended; stop and reconcile','expired');}
  try{const ack=await this.bounded(()=>this.broker.registerEvent({eventId,sourceVersion,generation,leaseId,capability,scopes:clone(scopes),expiresAt:lease,maxExpiresAt:deadline}));if(!ack||ack.eventId!==eventId||ack.sourceVersion!==sourceVersion||ack.generation!==generation)throw Error('registration unconfirmed');}catch{await this.stop({eventId,sourceVersion,generation,capability}).catch(()=>{});throw err('broker registration failed','broker');}
  const afterRegistration=this.read(eventId);if(afterRegistration?.state!=='registering'||afterRegistration.lease_until<=this.clock()||afterRegistration.deadline<=this.clock()||!this.update(eventId,afterRegistration.revision,{state:'ready'})){await this.bounded(()=>this.broker.revokeEvent({eventId,sourceVersion,generation})).catch(()=>{});throw err('authority changed during broker registration','expired');}
  return this.read(eventId);
 }
 async renew(v){const r=this.read(v.eventId);this.assertIdentity(r,v);if(!Number.isSafeInteger(v.leaseUntil)||v.leaseUntil<=r.lease_until||v.leaseUntil>r.deadline)throw err('invalid lease extension','expired');if(!this.update(v.eventId,r.revision,{lease_until:v.leaseUntil}))throw err('event changed','race');
  try{const ack=await this.bounded(()=>this.broker.renewEvent({eventId:v.eventId,sourceVersion:v.sourceVersion,generation:v.generation,leaseId:r.lease_id,expectedExpiresAt:r.lease_until,expiresAt:v.leaseUntil}));if(!ack||ack.eventId!==v.eventId||ack.generation!==v.generation||ack.expiresAt!==v.leaseUntil)throw Error('renewal unconfirmed');}catch{const x=this.read(v.eventId);if(x&&['ready','running','starting'].includes(x.state))this.update(v.eventId,x.revision,{state:'authority_unknown'});await this.stop(v).catch(()=>{});throw err('broker renewal unconfirmed; stop requested','broker_unknown');}
  const current=this.read(v.eventId);if(!current||current.lease_until!==v.leaseUntil||current.lease_until<=this.clock()||current.deadline<=this.clock()||!['ready','running','starting'].includes(current.state)){await this.bounded(()=>this.broker.revokeEvent({eventId:v.eventId,sourceVersion:v.sourceVersion,generation:v.generation})).catch(()=>{});throw err('authority changed during renewal','authority');}return current;
 }
 async execute(v){
  const r=this.read(v.eventId);this.assertIdentity(r,v);if(r.state!=='ready'||r.work_intent)throw err('work has already been attempted','duplicate');if(!idOk(v.operationId)||typeof v.command!=='string'||!v.command.trim())throw Error('invalid workload');
  if(!this.update(v.eventId,r.revision,{state:'starting',work_intent:v.operationId}))throw err('event changed','race');
  let reply;try{reply=await this.bounded(()=>{const current=this.read(v.eventId);this.assertIdentity(current,v);if(current.state!=='starting'||current.work_intent!==v.operationId)throw err('dispatch revoked','authority');return this.provider.start({sandboxId:r.sandbox_id,intentId:v.operationId,command:v.command,timeoutMs:Math.max(1,r.deadline-this.clock())});});}
  catch{const x=this.read(v.eventId);if(x?.state==='starting')this.update(v.eventId,x.revision,{state:'run_unknown'});throw err('work start outcome unknown','run_unknown');}
  const x=this.read(v.eventId);if(!reply||!idOk(reply.runId)||reply.intentId!==v.operationId){if(x?.state==='starting')this.update(v.eventId,x.revision,{state:'run_unknown'});throw err('work identity unconfirmed','run_unknown');}
  if(!x||!['starting','stop_requested','stop_unknown'].includes(x.state)||!this.update(v.eventId,x.revision,{run_id:reply.runId,state:x.state==='starting'?'running':x.state}))throw err('event changed after dispatch','unknown');
  const saved=this.read(v.eventId);if(saved.state!=='running'||saved.lease_until<=this.clock()||saved.deadline<=this.clock())throw err('work may have started after authority ended','unknown');return saved;
 }
 async disconnected(v){const r=this.read(v.eventId);this.assertIdentity(r,v,{lease:false});if(r.state==='terminated')return r;return this.stopRecord(v.eventId);}
 async stop(v){
  const r=this.read(v.eventId);this.assertIdentity(r,v,{lease:false});return this.stopRecord(r.event_id);
 }
 // Supervisor-only: never expose this method to the guest transport.
 async stopRecord(eventId){
  let r=this.read(eventId);if(!r)throw err('event missing','authority');if(r.state==='terminated')return r;
  if(!['stop_requested','stop_unknown'].includes(r.state)){if(!this.update(eventId,r.revision,{state:'stop_requested',stop_intent:crypto.randomUUID(),external_unknown:1}))throw err('event changed','race');r=this.read(eventId);}
  // Revoke broker permission before issuing any termination request.
  let brokerConfirmed=false;try{const ack=await this.bounded(()=>this.broker.revokeEvent({eventId,sourceVersion:r.source_version,generation:r.generation}));brokerConfirmed=ack?.revoked===true&&ack.eventId===eventId&&ack.sourceVersion===r.source_version&&ack.generation===r.generation;}catch{}
  r=this.read(eventId);if(brokerConfirmed&&!r.broker_revoked){this.update(eventId,r.revision,{broker_revoked:1});r=this.read(eventId);}
  if(!r.sandbox_id)throw err('sandbox identity unknown; termination not sent','stop_unknown');
  if(r.state==='stop_unknown'){if(!brokerConfirmed)throw err('broker revocation unconfirmed','broker_unknown');return r;} // Never repeat a potentially delivered terminate.
  if(!this.update(eventId,r.revision,{state:'stop_unknown'}))throw err('event changed','race');
  try{await this.bounded(()=>this.provider.terminate({sandboxId:r.sandbox_id,intentId:r.stop_intent}));}catch{throw err('termination outcome unknown','stop_unknown');}
  // An acknowledgement is not proof that the VM or its work stopped.
  if(!brokerConfirmed)throw err('termination requested; broker revocation unconfirmed','broker_unknown');return this.read(eventId);
 }
 async inspect(v){
  const r=this.read(v.eventId);this.assertIdentity(r,v,{lease:false});return this.inspectRecord(r.event_id);
 }
 async inspectRecord(eventId){
  let r=this.read(eventId);if(!r)throw err('event missing','authority');
  if(!r.sandbox_id){const found=await this.bounded(()=>this.provider.findByIntent({intentId:r.create_intent}));if(!found||found.complete!==true||!Array.isArray(found.items)||found.items.length!==1||!idOk(found.items[0].id)||found.items[0].intentId!==r.create_intent)return {record:r,observation:'creation-unknown'};if(!this.update(eventId,r.revision,{sandbox_id:found.items[0].id}))throw err('event changed','race');r=this.read(eventId);}
  const observation=await this.bounded(()=>this.provider.inspect({sandboxId:r.sandbox_id}));if(!observation||observation.id!==r.sandbox_id)return {record:r,observation:'unknown'};
  if(observation.state==='terminated'&&observation.authoritative===true){if(!r.broker_revoked)return {record:r,observation:'terminated-broker-unconfirmed'};if(!this.update(eventId,r.revision,{state:'terminated'}))throw err('event changed','race');return {record:this.read(eventId),observation:'terminated'};}
  // No exit event, disconnected stream, or suspended VM is proof of completion.
  return {record:r,observation:observation.state||'unknown'};
 }
 async expire(v){const r=this.read(v.eventId);this.assertIdentity(r,v,{lease:false});if(this.clock()<r.deadline&&this.clock()<r.lease_until)return r;return this.stop(v);}
 // Called by a separately operated scheduler after restart and periodically.
 // Missing/ambiguous evidence is left intact and is never auto-redispatched.
 async recover({afterEventId='',limit=100}={}){
  if(typeof afterEventId!=='string'||!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid recovery page');
  const rows=this.db.prepare("SELECT * FROM sandbox_runs WHERE state!='terminated' AND event_id>? ORDER BY event_id LIMIT ?").all(afterEventId,limit),results=[];
  for(let r of rows){try{
   if(r.state==='creating'||r.state==='starting'){this.update(r.event_id,r.revision,{state:r.state==='creating'?'create_unknown':'run_unknown'});r=this.read(r.event_id);}
   if(['registering','stop_requested','stop_unknown'].includes(r.state)||r.lease_until<=this.clock()||r.deadline<=this.clock()){try{await this.stopRecord(r.event_id);}catch{}}
   results.push({eventId:r.event_id,...await this.inspectRecord(r.event_id)});
  }catch(e){results.push({eventId:r.event_id,observation:'unknown',error:e.code||'unavailable'});}}
  return {results,nextCursor:rows.length===limit?rows.at(-1).event_id:null};
 }
}
module.exports={SandboxController};

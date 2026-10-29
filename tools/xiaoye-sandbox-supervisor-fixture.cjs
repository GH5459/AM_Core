'use strict';
// Isolated scheduler prototype; all authority data and providers are fake.
const crypto = require('node:crypto');

class FixtureSupervisor {
 constructor({controller, authority, clock=Date.now, pollMs=30000, maxBackoffMs=900000, claimMs=60000, authorityTimeoutMs=1000, batchSize=20}) {
  if (!controller?.db || authority?.testOnly !== true || typeof authority.read !== 'function' || typeof clock !== 'function') throw Error('fixture controller and fake authority required');
  if (![pollMs,maxBackoffMs,claimMs,authorityTimeoutMs,batchSize].every(Number.isSafeInteger) || pollMs < 1000 || maxBackoffMs < pollMs || claimMs < 1000 || authorityTimeoutMs < 1 || batchSize < 1 || batchSize > 100) throw Error('invalid schedule bounds');
  Object.assign(this,{controller,authority,clock,pollMs,maxBackoffMs,claimMs,authorityTimeoutMs,batchSize,running:false,timer:null});
  controller.db.exec('CREATE TABLE IF NOT EXISTS fixture_supervision(event_id TEXT PRIMARY KEY,next_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,claim_token TEXT,claim_until INTEGER NOT NULL DEFAULT 0,last_result TEXT)');
 }
 async bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('authority unavailable')),this.authorityTimeoutMs);})]);}finally{clearTimeout(timer);}}
 discover(){this.controller.db.prepare("INSERT OR IGNORE INTO fixture_supervision(event_id,next_at) SELECT event_id,? FROM sandbox_runs WHERE state!='terminated'").run(this.clock());}
 claim(eventId){const token=crypto.randomUUID(),now=this.clock();const n=this.controller.db.prepare('UPDATE fixture_supervision SET claim_token=?,claim_until=? WHERE event_id=? AND next_at<=? AND (claim_token IS NULL OR claim_until<=?)').run(token,now+this.claimMs,eventId,now,now).changes;return n?token:null;}
 owns(eventId,token){const now=this.clock();this.controller.db.prepare('UPDATE fixture_supervision SET claim_until=? WHERE event_id=? AND claim_token=? AND claim_until<=?').run(now+this.claimMs,eventId,token,now);return !!this.controller.db.prepare('SELECT 1 FROM fixture_supervision WHERE event_id=? AND claim_token=? AND claim_until>?').get(eventId,token,now);}
 finish(eventId,token,result,failed){if(!this.owns(eventId,token))return false;const old=this.controller.db.prepare('SELECT attempts FROM fixture_supervision WHERE event_id=? AND claim_token=? AND claim_until>?').get(eventId,token,this.clock());if(!old)return false;const attempts=failed?Math.min(old.attempts+1,30):0,delay=failed?Math.min(this.maxBackoffMs,this.pollMs*2**Math.min(attempts,20)):this.pollMs;return this.controller.db.prepare('UPDATE fixture_supervision SET next_at=?,attempts=?,claim_token=NULL,claim_until=0,last_result=? WHERE event_id=? AND claim_token=? AND claim_until>?').run(this.clock()+delay,attempts,result,eventId,token,this.clock()).changes===1;}
 async validateAuthority(eventId,token){
  const stopStates=['authority_unknown','create_unknown','run_unknown','stop_requested','stop_unknown'];
  // Renewal can commit while a previous authority read is in flight. Compare
  // against a fresh row and retry a stale lease before deciding to stop.
  for(let attempt=0;attempt<4;attempt++){
   const before=this.controller.read(eventId);if(!before||before.state==='terminated')return {terminal:true};
   if(before.lease_until<=this.clock()||before.deadline<=this.clock()||stopStates.includes(before.state))return {active:false};
   let auth;try{auth=await this.bounded(()=>this.authority.read({eventId,sourceVersion:before.source_version,generation:before.generation}));}catch{}
   if(!this.owns(eventId,token))return {claimExpired:true};
   const row=this.controller.read(eventId);if(!row||row.state==='terminated')return {terminal:true};
   if(row.lease_until<=this.clock()||row.deadline<=this.clock()||stopStates.includes(row.state))return {active:false};
   if(!auth||auth.eventId!==eventId||auth.sourceVersion!==row.source_version||auth.generation!==row.generation)return {active:false,failed:true};
   if(auth.status!=='active')return {active:false};
   // In-flight lifecycle phases need independent evidence that the original
   // owner still exists. The fixture can model this; production has no issuer.
   if(auth.ownerAlive===false||(['creating','registering','starting'].includes(row.state)&&auth.ownerAlive!==true))return {active:false,failed:true};
   if(before.source_version!==row.source_version||before.generation!==row.generation||before.lease_until!==row.lease_until||auth.leaseUntil!==row.lease_until){if(attempt<3)continue;return {active:false,failed:true};}
   return {active:true};
  }
  return {active:false,failed:true};
 }
 async inspectOne(eventId,token){
  const check=await this.validateAuthority(eventId,token);if(check.terminal)return {result:'terminated',failed:false};if(check.claimExpired)return {result:'claim-expired',failed:true};
  let mustStop=!check.active,failed=!!check.failed;
  if(!mustStop){try{const seen=await this.controller.inspectRecord(eventId);if(['disconnected','terminated-broker-unconfirmed','unknown'].includes(seen.observation)){mustStop=true;failed=seen.observation==='unknown';}else if(seen.observation==='creation-unknown'){failed=true;if(!['creating','registering'].includes(seen.record.state))mustStop=true;}}catch{mustStop=true;failed=true;}}
  if(!mustStop){const fresh=await this.validateAuthority(eventId,token);if(fresh.terminal)return {result:'terminated',failed:false};if(fresh.claimExpired)return {result:'claim-expired',failed:true};if(!fresh.active){mustStop=true;failed=failed||!!fresh.failed;}}
  if(mustStop){
   if(!this.owns(eventId,token))return {result:'claim-expired',failed:true};
   try{await this.controller.stopRecord(eventId);}catch{failed=true;}
   if(!this.owns(eventId,token))return {result:'claim-expired',failed:true};
   try{const seen=await this.controller.inspectRecord(eventId);if(seen.observation!=='terminated')failed=true;}catch{failed=true;}
   return {result:this.controller.read(eventId)?.state==='terminated'?'terminated':'stop-pending',failed};
  }
  return {result:failed?'inspect-unknown':'active',failed};
 }
 async tick(){
  if(this.running)return {busy:true,results:[]};this.running=true;const results=[];
  try{this.discover();const rows=this.controller.db.prepare("SELECT s.event_id FROM fixture_supervision s JOIN sandbox_runs r ON r.event_id=s.event_id WHERE r.state!='terminated' AND s.next_at<=? AND (s.claim_token IS NULL OR s.claim_until<=?) ORDER BY s.next_at,s.event_id LIMIT ?").all(this.clock(),this.clock(),this.batchSize);
   for(const row of rows){const token=this.claim(row.event_id);if(!token)continue;let out;try{out=await this.inspectOne(row.event_id,token);}catch{out={result:'internal-error',failed:true};}this.finish(row.event_id,token,out.result,out.failed);results.push({eventId:row.event_id,...out});}
   return {busy:false,results};
  }finally{this.running=false;}
 }
 start(){if(this.timer)throw Error('already started');this.timer=setInterval(()=>{this.tick().catch(()=>{});},this.pollMs);this.timer.unref();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
module.exports={FixtureSupervisor};

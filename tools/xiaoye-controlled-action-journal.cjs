'use strict';
// Isolated prototype only. A durable journal is NOT an enforcement boundary:
// only a separately controlled executor, which denies every other write path,
// can establish that this journal contains all external actions.
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const sha=/^[a-f0-9]{40}$/;
const eventId=/^[a-f0-9]{64}$/;
const opId=/^[a-zA-Z0-9_-]{8,180}$/;
const text=x=>typeof x==='string'&&x.length>0&&x.length<=255;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function intent(value){
 assert(value&&eventId.test(value.eventId||'')&&Number.isSafeInteger(value.sourceVersion)&&value.sourceVersion>=0&&opId.test(value.operationId||''),'Invalid event or operation');
 if(value.generation!==undefined)assert(Number.isSafeInteger(value.generation)&&value.generation>0,'Invalid generation');
 const common={eventId:value.eventId,sourceVersion:value.sourceVersion,operationId:value.operationId,kind:value.kind,...value.generation!==undefined?{generation:value.generation}:{}};
 if(value.kind==='github-merge'){
  const x=value.target;assert(x&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x.repo||'')&&Number.isSafeInteger(x.number)&&x.number>0&&text(x.base)&&sha.test(x.headSha||''),'Invalid PR identity');
  return {...common,target:{repo:x.repo.toLowerCase(),number:x.number,base:x.base,headSha:x.headSha}};
 }
 if(value.kind==='render-deploy'){
  const x=value.target;assert(x&&/^tea-[a-z0-9]+$/.test(x.workspaceId||'')&&/^srv-[a-z0-9]+$/.test(x.serviceId||'')&&sha.test(x.commitId||''),'Invalid deployment identity');
  return {...common,target:{workspaceId:x.workspaceId,serviceId:x.serviceId,commitId:x.commitId}};
 }
 throw Error('Unsupported action');
}
function resourceKey(i){return digest(i.kind==='github-merge'?[i.kind,i.target.repo.toLowerCase(),i.target.number]:[i.kind,i.target.workspaceId,i.target.serviceId]);}
function targetKey(i){return digest([i.kind,i.target]);}
function observe(value,observation){
 const i=intent(value),o=observation;if(!o||o.available!==true)return {state:'unknown'};
 if(i.kind==='github-merge'){
  if(typeof o.repo!=='string'||o.repo.toLowerCase()!==i.target.repo||o.number!==i.target.number||o.base!==i.target.base||o.headSha!==i.target.headSha)return {state:'unknown'};
  if(o.state==='closed'&&o.merged===true&&sha.test(o.mergeSha||''))return {state:'effect-present',attribution:'current-state-only',mergeSha:o.mergeSha};
  return {state:'unknown'}; // An open or missing PR cannot prove the request was never sent.
 }
 if(o.workspaceId!==i.target.workspaceId||o.serviceId!==i.target.serviceId||o.commitId!==i.target.commitId)return {state:'unknown'};
 // A deployment ID must be obtained from the original saved receipt. A live
 // matching SHA without that ID cannot uniquely identify the dispatched write.
 if(!/^dep-[a-z0-9]+$/.test(o.originalDeployId||'')||o.deployId!==o.originalDeployId)return {state:'unknown'};
 if(o.status==='live')return {state:'effect-present',attribution:'receipt-reported-deploy-id',deployId:o.deployId};
 if(['build_failed','update_failed','pre_deploy_failed','canceled'].includes(o.status))return {state:'terminal-failed',deployId:o.deployId,status:o.status};
 return {state:'unknown'};
}
class ActionJournal{
 constructor(file){
  this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS actions(operation_id TEXT PRIMARY KEY,event_id TEXT NOT NULL,source_version INTEGER NOT NULL,fingerprint TEXT NOT NULL,resource_key TEXT NOT NULL,target_key TEXT NOT NULL,intent TEXT NOT NULL,state TEXT NOT NULL,receipt TEXT,observation TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS action_event ON actions(event_id,source_version); CREATE INDEX IF NOT EXISTS action_resource ON actions(resource_key,state); CREATE INDEX IF NOT EXISTS action_target ON actions(target_key);');
 }
 close(){this.db.close();}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 get(id){const r=this.db.prepare('SELECT * FROM actions WHERE operation_id=?').get(id);return r&&{...r,intent:JSON.parse(r.intent),receipt:r.receipt?JSON.parse(r.receipt):null,observation:r.observation?JSON.parse(r.observation):null};}
 prepareLocked(value){const i=intent(value),fingerprint=digest(i),now=Date.now();const old=this.get(i.operationId);if(old){assert.equal(old.fingerprint,fingerprint,'Operation identity reused for different action');return old;}const resource=resourceKey(i),target=targetKey(i);assert(!this.db.prepare("SELECT 1 FROM actions WHERE resource_key=? AND state NOT IN ('observed','not-sent') LIMIT 1").get(resource),'Unresolved action exists for this resource');assert(!this.db.prepare("SELECT 1 FROM actions WHERE target_key=? AND state!='not-sent' LIMIT 1").get(target),'Same action already recorded; explicit new authorization required');this.db.prepare('INSERT INTO actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(i.operationId,i.eventId,i.sourceVersion,fingerprint,resource,target,JSON.stringify(i),'prepared',null,null,now,now);return this.get(i.operationId);}
 prepare(value){return this.tx(()=>this.prepareLocked(value));}
 fenceLocked(value){const i=intent(value),old=this.get(i.operationId);assert(old&&old.fingerprint===digest(i),'Unknown or different operation');assert.equal(old.state,'prepared','Operation already sent or outcome unknown');this.db.prepare("UPDATE actions SET state='dispatching',updated_at=? WHERE operation_id=? AND state='prepared'").run(Date.now(),i.operationId);return this.get(i.operationId);}
 // Commit the fence before invoking a provider. No subsequent re-dispatch.
 fence(value){return this.tx(()=>this.fenceLocked(value));}
 receipt(value,receipt){const i=intent(value);assert(receipt&&receipt.operationId===i.operationId,'Receipt must match operation');if(i.kind==='render-deploy')assert(/^dep-[a-z0-9]+$/.test(receipt.deployId||''),'Missing original deployment ID');else assert(sha.test(receipt.mergeSha||''),'Missing merge SHA');return this.tx(()=>{const old=this.get(i.operationId);assert(old&&old.fingerprint===digest(i)&&old.state==='dispatching','Operation not awaiting receipt');const compatible=i.kind==='github-merge'&&old.observation?.state==='effect-present'&&old.observation.mergeSha===receipt.mergeSha;this.db.prepare('UPDATE actions SET receipt=?,observation=?,state=?,updated_at=? WHERE operation_id=?').run(JSON.stringify(receipt),compatible?JSON.stringify(old.observation):null,compatible?'observed':'receipt-recorded',Date.now(),i.operationId);return this.get(i.operationId);});}
 reconcile(value,providerState){const i=intent(value);return this.tx(()=>{const old=this.get(i.operationId);assert(old&&old.fingerprint===digest(i)&&['dispatching','receipt-recorded'].includes(old.state),'Operation is not awaiting reconciliation');const safe={...providerState};if(i.kind==='render-deploy')safe.originalDeployId=old.receipt?.deployId;const seen=observe(i,safe);if(seen.state==='unknown')return {action:old,observation:seen};if(i.kind==='github-merge'&&old.receipt?.mergeSha&&old.receipt.mergeSha!==seen.mergeSha)return {action:old,observation:{state:'unknown'}};const next=old.state==='receipt-recorded'?'observed':'dispatching';this.db.prepare('UPDATE actions SET observation=?,state=?,updated_at=? WHERE operation_id=?').run(JSON.stringify(seen),next,Date.now(),i.operationId);return {action:this.get(i.operationId),observation:seen};});}
 list(event,source){assert(eventId.test(event||'')&&Number.isSafeInteger(source));return this.db.prepare('SELECT operation_id FROM actions WHERE event_id=? AND source_version=? ORDER BY operation_id').all(event,source).map(x=>this.get(x.operation_id));}
}
async function dispatchOnce(journal,value,send){
 assert(typeof send==='function','Missing transport');journal.prepare(value);journal.fence(value);
 // A thrown error or lost response leaves the durable fence in place.
 const receipt=await send(intent(value));return journal.receipt(value,receipt);
}
// This predicate expresses evidence requirements, not an implementation of a
// real process or network sandbox. The verifier must check evidence produced by
// an independently enforced boundary, never by the unrestricted case runner.
async function assessRecovery({event,actions,boundaryReceipt,verifyBoundaryReceipt}){
 if(!event||!eventId.test(event.id||'')||!Number.isSafeInteger(event.sourceVersion))return {allowed:false,reason:'invalid-event'};
 if(typeof verifyBoundaryReceipt!=='function')return {allowed:false,reason:'independent-verifier-not-configured'};
 let b;try{b=await verifyBoundaryReceipt(boundaryReceipt);}catch{return {allowed:false,reason:'independent-verifier-failed'};}
 if(!b||b.kind!=='independent-enforced-boundary-v1'||b.eventId!==event.id||b.sourceVersion!==event.sourceVersion||b.processTreeTerminated!==true||b.externalActionsComplete!==true||!Array.isArray(b.operationIds))return {allowed:false,reason:'independent-boundary-evidence-required'};
 if(!Array.isArray(actions)||actions.some(a=>a.event_id!==event.id||a.source_version!==event.sourceVersion))return {allowed:false,reason:'event-mismatch'};
 const ids=actions.map(a=>a.operation_id).sort(),expected=[...b.operationIds].sort();if(new Set(expected).size!==expected.length||JSON.stringify(ids)!==JSON.stringify(expected))return {allowed:false,reason:'incomplete-action-ledger'};
 if(actions.some(a=>a.state!=='observed'||!['effect-present','terminal-failed'].includes(a.observation?.state)))return {allowed:false,reason:'unknown-action'};
 return {allowed:true,scope:'new-analysis-only'};
}
module.exports={ActionJournal,intent,observe,dispatchOnce,assessRecovery};

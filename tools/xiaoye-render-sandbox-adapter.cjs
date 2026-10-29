'use strict';
// Standalone, opt-in Render CLI adapter. Not wired to the prototype controller.
const {execFile}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const validEvent=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validSandbox=x=>typeof x==='string'&&/^sbx-[a-z0-9]+$/.test(x);
const validGroup=x=>typeof x==='string'&&/^sbg-[a-z0-9]+$/.test(x);
const error=(code)=>Object.assign(Error(code),{code});
class RenderSandboxAdapter {
 constructor({dbPath,cliPath,cliPrefix=[],workspaceId,groupId,apiKey,hosts=[],clock=Date.now,requestTimeoutMs=15000,maxLifetimeMs=7200000,broker}){
  if(!dbPath||typeof cliPath!=='string'||!cliPath||!Array.isArray(cliPrefix)||cliPrefix.some(x=>typeof x!=='string')||!/^tea-[a-z0-9]+$/.test(workspaceId||'')||!validGroup(groupId)||typeof apiKey!=='string'||!apiKey||!broker||typeof clock!=='function')throw Error('invalid supervisor configuration');
  if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1000||maxLifetimeMs>7200000)throw Error('invalid time bound');
  if(!Array.isArray(hosts)||hosts.some(h=>typeof h!=='string'||!/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(h)))throw Error('invalid network host');
  this.cliPath=cliPath;this.cliPrefix=[...cliPrefix];this.workspaceId=workspaceId;this.groupId=groupId;this.hosts=[...new Set(hosts)].sort();this.clock=clock;this.timeout=requestTimeoutMs;this.maxLifetimeMs=maxLifetimeMs;this.broker=broker;
  this.env={RENDER_API_KEY:apiKey,RENDER_WORKSPACE:workspaceId,...process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}};
  this.db=new DatabaseSync(dbPath);this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS render_sandbox_intents(event_id TEXT PRIMARY KEY,source_version INTEGER NOT NULL,generation INTEGER NOT NULL,group_id TEXT NOT NULL,workspace_id TEXT NOT NULL,create_intent TEXT NOT NULL UNIQUE,deadline INTEGER NOT NULL,state TEXT NOT NULL,sandbox_id TEXT,stop_intent TEXT,broker_revoked INTEGER NOT NULL DEFAULT 0,external_unknown INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1)');
 }
 close(){this.db.close();}
 read(eventId){return this.db.prepare('SELECT * FROM render_sandbox_intents WHERE event_id=?').get(eventId)||null;}
 update(r,changes){const k=Object.keys(changes);return this.db.prepare('UPDATE render_sandbox_intents SET '+k.map(x=>x+'=?').join(',')+',revision=revision+1 WHERE event_id=? AND revision=?').run(...k.map(x=>changes[x]),r.event_id,r.revision).changes===1;}
 async call(args){return new Promise((resolve,reject)=>execFile(this.cliPath,[...this.cliPrefix,...args],{shell:false,env:this.env,timeout:this.timeout,maxBuffer:262144,windowsHide:true},(e,out)=>{if(e)return reject(error('cli_unknown'));try{resolve(JSON.parse(out));}catch{reject(error('cli_unknown'));}}));}
 async bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('timeout')),this.timeout);})]);}finally{clearTimeout(timer);}}
 async create({eventId,sourceVersion,generation,timeoutMs}){
  if(!validEvent(eventId)||!Number.isSafeInteger(sourceVersion)||sourceVersion<0||!Number.isSafeInteger(generation)||generation<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>this.maxLifetimeMs)throw Error('invalid creation intent');
  const createIntent=crypto.randomUUID(),deadline=this.clock()+timeoutMs;
  try{this.db.prepare('INSERT INTO render_sandbox_intents(event_id,source_version,generation,group_id,workspace_id,create_intent,deadline,state) VALUES(?,?,?,?,?,?,?,?)').run(eventId,sourceVersion,generation,this.groupId,this.workspaceId,createIntent,deadline,'creating');}catch{throw error('duplicate');}
  const args=['sandboxes','create','--group',this.groupId,'--timeout',String(Math.floor(timeoutMs/1000)),'--idle-timeout','0','--network-policy',this.hosts.length?'allow-list':'deny-all','--confirm','--output','json'];for(const host of this.hosts)args.push('--allow-egress-https',host);
  let out;try{out=await this.call(args);}catch{const r=this.read(eventId);if(r?.state==='creating')this.update(r,{state:'create_unknown'});throw error('create_unknown');}
  let r=this.read(eventId);if(!out||!validSandbox(out.id)||out.sandboxGroupId!==this.groupId){if(r?.state==='creating')this.update(r,{state:'create_unknown'});throw error('create_unknown');}
  if(!r||!['creating','stop_requested'].includes(r.state)||!this.update(r,{sandbox_id:out.id,state:r.state==='creating'?'created':r.state}))throw error('create_unknown');
  r=this.read(eventId);const policy=out.networkPolicy, rules=policy?.rules||[],requested=this.hosts;const policyValid=policy?.type===(requested.length?'allow-list':'deny-all')&&Array.isArray(rules)&&JSON.stringify(rules.map(x=>x?.domain).sort())===JSON.stringify(requested)&&out.timeoutSeconds===Math.floor(timeoutMs/1000)&&out.idleTimeoutSeconds===0;if(r.state==='stop_requested'||r.deadline<=this.clock()||!policyValid){await this.stop(eventId).catch(()=>{});throw error('create_unknown');}return r;
 }
 // No identifying intent is exposed by CLI list: never infer ownership from a timestamp or lone result.
 async listUnknown(eventId){const r=this.read(eventId);if(!r||(r.group_id!==this.groupId||r.workspace_id!==this.workspaceId))throw error('authority');const list=await this.call(['sandboxes','list','--all','--group',this.groupId,'--output','json']);if(!Array.isArray(list))throw error('cli_unknown');return {eventId,attribution:'unknown',count:list.length};}
 async inspect(eventId){const r=this.read(eventId);if(!r||(r.group_id!==this.groupId||r.workspace_id!==this.workspaceId)||!r.sandbox_id)throw error('identity_unknown');const list=await this.call(['sandboxes','list','--all','--group',this.groupId,'--output','json']);if(!Array.isArray(list))throw error('cli_unknown');const found=list.filter(x=>x?.id===r.sandbox_id&&x.sandboxGroupId===r.group_id);if(found.length!==1)return {state:'unknown'};if(found[0].status==='terminated'&&r.broker_revoked){if(!this.update(r,{state:'terminated'}))throw error('race');return {state:'terminated',externalUnknown:!!r.external_unknown};}return {state:found[0].status==='terminated'?'terminated-broker-unconfirmed':found[0].status||'unknown'};}
 async stop(eventId){let r=this.read(eventId);if(!r||(r.group_id!==this.groupId||r.workspace_id!==this.workspaceId))throw error('authority');if(r.state==='terminated')return r;if(!['stop_requested','stop_unknown'].includes(r.state)){if(!this.update(r,{state:'stop_requested',stop_intent:crypto.randomUUID(),external_unknown:1}))throw error('race');r=this.read(eventId);}
  let confirmed=false;try{const ack=await this.bounded(()=>this.broker.revokeEvent({eventId,sourceVersion:r.source_version,generation:r.generation}));confirmed=ack?.revoked===true&&ack.eventId===eventId&&ack.sourceVersion===r.source_version&&ack.generation===r.generation;}catch{}
  r=this.read(eventId);if(confirmed&&!r.broker_revoked){if(!this.update(r,{broker_revoked:1}))throw error('race');r=this.read(eventId);}if(!r.sandbox_id)throw error('identity_unknown');if(r.state==='stop_unknown'){if(!confirmed)throw error('broker_unknown');return r;}if(!this.update(r,{state:'stop_unknown'}))throw error('race');
  try{await this.call(['sandboxes','stop',r.sandbox_id,'--confirm','--output','json']);}catch{throw error('stop_unknown');}if(!confirmed)throw error('broker_unknown');return this.read(eventId);
 }

 async recover(eventId){let r=this.read(eventId);if(!r||(r.group_id!==this.groupId||r.workspace_id!==this.workspaceId))throw error('authority');if(r.state==='creating'){if(!this.update(r,{state:'create_unknown'}))throw error('race');r=this.read(eventId);}if(['stop_requested','stop_unknown'].includes(r.state)||r.deadline<=this.clock()){try{await this.stop(eventId);}catch(e){if(!['identity_unknown','stop_unknown','broker_unknown'].includes(e.code))throw e;}}r=this.read(eventId);if(!r.sandbox_id)return this.listUnknown(eventId);return this.inspect(eventId);}
 // Explicitly no execution until scoped guest credential and model gateway exist.
 async start(){throw error('execution_unavailable');}
}
module.exports={RenderSandboxAdapter};

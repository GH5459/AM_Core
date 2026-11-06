// Portable SQLite/VM tests with synthetic records; full Worker/D1 evidence is
// recorded separately. Never load deployment credentials or business data here.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const {patchWorker,patchOrigins}=require('./read-speed.cjs');
const baseline=fs.readFileSync(path.join(__dirname,'read-fixtures/sharing-baseline.js.txt'),'utf8'),candidate=patchWorker(baseline);
const slice=s=>s.slice(s.indexOf('// project-sharing.mjs'),s.indexOf('// work-minutes.mjs'));
function harness(source){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE work_items(id TEXT PRIMARY KEY,parent_id TEXT,value TEXT NOT NULL)');const queries=[];
 const db={prepare(text){return {bind(...params){return {
  async all(){const rows=sql.prepare(text).all(...params);queries.push({text,bytes:Buffer.byteLength(JSON.stringify(rows))});return {results:rows};},
  async first(){return sql.prepare(text).get(...params)||null;}
 };}};}};
 const context=vm.createContext({Error,Map,Set,WeakMap,JSON,Object,Array,__name:x=>x,transferFormer:()=>false});
 vm.runInContext(slice(source)+'\nglobalThis.api={hydrateTaskSharing,inheritedMembers,sharingVersions,assertSharingVersions,taskCanCreateChild,taskCanEdit,readSharedTask};',context);
 return {db,sql,queries,api:context.api,put(t){sql.prepare('INSERT OR REPLACE INTO work_items VALUES(?,?,?)').run(t.id,t.primaryParentId||null,JSON.stringify(t));},close(){sql.close();}};
}
const person=account=>({account}),parent=(extra={})=>({id:'parent',version:1,level:2,status:'pending',requester:person('owner'),lead:person('owner'),collaborators:[],sharedWith:[],createdBy:person('owner'),history:[{kind:'created',actor:person('legacy-creator')}],...extra}),child=()=>({id:'child',version:1,level:1,status:'pending',primaryParentId:'parent',requester:person('child-owner'),lead:person('child-owner'),collaborators:[],sharedWith:[],history:[]});
const outcome=async fn=>{try{await fn();return 'ok';}catch(e){return e.status||e.message;}};
const observable=(h,t)=>({view:[...h.api.inheritedMembers(t)].sort(),versions:[...h.api.sharingVersions(t)].map(([id,v])=>({id,type:typeof v,value:v})),canCreateLegacy:h.api.taskCanCreateChild(t,'legacy-creator'),canCreateInvited:h.api.taskCanCreateChild(t,'invited')});
async function compare(p,mutate=null){const states=[];for(const source of [baseline,candidate]){const h=harness(source);try{h.put(p);const t=child();h.put(t);await h.api.hydrateTaskSharing(h.db,[t]);const state=observable(h,t);if(mutate)h.put(mutate(p));state.check=await outcome(()=>h.api.assertSharingVersions(h.db,[t],true));states.push(JSON.parse(JSON.stringify(state)));}finally{h.close();}}assert.deepEqual(states[1],states[0]);return states[1];}
test('legacy creator fallback preserves JavaScript truthiness',async()=>{
 for(const account of ['',null,false,0,0.0]){const state=await compare(parent({createdBy:{account}}));assert(state.view.includes('legacy-creator'));assert.equal(state.canCreateLegacy,true);}
 const missing=parent();delete missing.createdBy;assert((await compare(missing)).view.includes('legacy-creator'));
 for(const account of ['named','0',true,1]){const state=await compare(parent({createdBy:{account}}));assert.equal(state.view.includes('legacy-creator'),false);}
});
test('ancestor cancellation, merge, private scope and invitations keep original outcomes',async()=>{
 for(const extra of [{},{status:'cancelled'},{status:'done'},{mergedInto:'other'},{workScope:'hr'},{workScope:'routine'},{collaborators:[person('invited')]},{sharedWith:[person('invited')]}])await compare(parent(extra));
});
test('version JSON type and missing field preserve strict original checks',async()=>{
 for(const version of [undefined,null,false,true,0,1,1.5,'1',{},[]]){const p=parent({version});await compare(p);}
 const state=await compare(parent({collaborators:[person('invited')]}),p=>({...p,version:2,collaborators:[]}));assert.equal(state.check,409);
});
test('revoked ancestor is absent from a fresh hydration and buffered version is rejected',async()=>{
 for(const source of [baseline,candidate]){const h=harness(source);try{h.put(parent({collaborators:[person('invited')]}));const t=child();h.put(t);await h.api.hydrateTaskSharing(h.db,[t]);assert(h.api.inheritedMembers(t).includes('invited'));h.put(parent({version:2}));assert.equal(await outcome(()=>h.api.assertSharingVersions(h.db,[t])),409);const fresh=await h.api.readSharedTask(h.db,'child');assert(!h.api.inheritedMembers(fresh).includes('invited'));}finally{h.close();}}
});
test('projection keeps returned task object and avoids loading large ancestor history',async()=>{
 const bytes=[];for(const source of [baseline,candidate]){const h=harness(source);try{const p=parent({history:[{kind:'created',actor:person('legacy-creator')},...Array.from({length:100},(_,i)=>({kind:'edit',id:'event-'+i,text:'x'.repeat(3000)}))]});h.put(p);const t=child();h.put(t);const before=JSON.stringify(t),out=await h.api.hydrateTaskSharing(h.db,[t]);assert.equal(out[0],t);assert.equal(JSON.stringify(t),before);bytes.push(h.queries.at(-1).bytes);}finally{h.close();}}assert(bytes[1]<bytes[0]/100,JSON.stringify(bytes));
});
test('origin batching preserves original timeout, tenant and remote source-name implementation',()=>{
 const original=fs.readFileSync(path.join(__dirname,'read-fixtures/origins-baseline.mjs.txt'),'utf8'),changed=patchOrigins(original),start=original.indexOf('  for (let offset = 0; offset < ids.length; offset += 70) {'),end=original.indexOf('  const meetingIds = ',start);
 assert.equal(changed.slice(0,start),original.slice(0,start));assert.equal(changed.slice(changed.indexOf('  const meetingIds = ',start)),original.slice(end));assert.match(changed,/i\.tenant=\?/);assert.match(changed,/bind\(env\.LEAF_TASK_TENANT\|\|'',JSON\.stringify\(ids\)\)/);assert.match(changed,/WHERE w\.id IN \(SELECT value FROM json_each\(\?\)\)/);assert.throws(()=>patchOrigins(changed));
});
test('origin SQL batching returns identical authorized IDs and keeps tenant separation',async()=>{
 const original=fs.readFileSync(path.join(__dirname,'read-fixtures/origins-baseline.mjs.txt'),'utf8'),outputs=[],counts=[];
 for(const source of [original,patchOrigins(original)]){
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE work_items(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE line_assignment_intake(id TEXT,tenant TEXT,input TEXT)');
  let reads=0;const db={prepare(text){return {bind(...params){return {async all(){reads++;return {results:sql.prepare(text).all(...params)};}};}};}};
  const tasks=[];for(let i=0;i<141;i++){const n=String(i).padStart(12,'0'),id='work-11111111-1111-4111-8111-'+n,group='C'+String(i).padStart(32,'0');tasks.push({id});sql.prepare('INSERT INTO work_items VALUES(?,?)').run(id,JSON.stringify({assignment:{sourceId:'intake-'+i},sourceDate:'2026-11-06'}));sql.prepare('INSERT INTO line_assignment_intake VALUES(?,?,?)').run('intake-'+i,'allowed-tenant',JSON.stringify({groupId:group}));sql.prepare('INSERT INTO line_assignment_intake VALUES(?,?,?)').run('intake-'+i,'other-tenant',JSON.stringify({groupId:'C'+'f'.repeat(32)}));}
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const requests=[];await module.enrichTaskOrigins(tasks,{DB:db,LEAF_TASK_TENANT:'allowed-tenant',AMCORE_MEETING_MANAGEMENT_SECRET:'synthetic-secret-with-no-real-access-0000',OWNER_ACCOUNT:'synthetic-owner'},{fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);return Response.json({contract:'dailylog-task-origins-v1',meetings:[],groups:body.groupIds.map(id=>({id,name:'Synthetic '+id}))});}});
  assert(requests.every(r=>!r.groupIds.includes('C'+'f'.repeat(32))));outputs.push(tasks);counts.push(reads);sql.close();
 }
 assert.deepEqual(outputs[1],outputs[0]);assert.deepEqual(counts,[3,1]);
});
test('source drift and repeated worker patch fail closed',()=>{assert.throws(()=>patchWorker('unknown'));assert.throws(()=>patchWorker(candidate));});

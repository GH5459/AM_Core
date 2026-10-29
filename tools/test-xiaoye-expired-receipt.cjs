const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const id='a'.repeat(64),taskId='work-12345678-1234-1234-1234-123456789012',lease='fictional-lease',operationId='fictional-operation';
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(['/fail',id,lease,operationId,'offline',null])).digest('hex');
async function fixture({proof=true,source=1,expired=true}={}){
 const {XiaoyeEvents}=await import('../core/xiaoye-secretary-events.mjs');
 const leaseUntil=Date.now()+(expired?-1000:60000),acceptedAt=leaseUntil-1000;
 const intent={operationId,fingerprint,acceptedAt,leaseUntil};
 const event={id,taskId,kind:'analyze',state:'running',sourceVersion:1,lease,leaseUntil,finalizationIntent:intent};
 const task={id:taskId,secretary:{stage:'blocked',sourceVersion:source}};
 let evidence=proof?{eventId:id,taskId,sourceVersion:1,...intent,state:'failed'}:null;
 const data=new Map([['event:'+id,structuredClone(event)],['pending:'+id,structuredClone(event)],['counts',{running:1}]]);
 const storage={async get(k){return structuredClone(data.get(k));},async put(k,v){if(typeof k==='object')for(const [a,b] of Object.entries(k))data.set(a,structuredClone(b));else data.set(k,structuredClone(v));},async delete(k){data.delete(k);},async list({prefix}){return new Map([...data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));},async transaction(fn){return fn(this);},async setAlarm(){},async deleteAlarm(){},async getAlarm(){return null;}};
 const ctx={storage,async blockConcurrencyWhile(fn){return fn();},getWebSockets(){return[];}};
 const DB={prepare(sql){return {bind(){return this;},async first(){if(sql.includes('work_items'))return {value:JSON.stringify(task)};if(sql.includes('xiaoye-event-receipt-proof'))return evidence?{value:JSON.stringify(evidence)}:null;if(sql.includes('xiaoye-notifications'))return {key:'event-blocked:'+id};return null;}};}};
 const make=()=>new XiaoyeEvents(ctx,{DB,PUBLIC_ORIGIN:'http://example.test'});
 const send=(obj,route,v)=>obj.fetch(new Request('https://secretary.internal/'+route,{method:'POST',body:JSON.stringify(v)}));
 return {make,send,data,task,setEvidence:v=>evidence=v,input:{id,lease,operationId,reason:'offline'}};
}
test('a proven pre-expiry receipt can settle after expiry without renewing execution',async()=>{
 const a=await fixture(),server=a.make();assert.equal((await a.send(server,'check',a.input)).status,409);
 for(const v of [{...a.input,lease:'wrong'},{...a.input,reason:'other'},{...a.input,operationId:'other-operation'}])assert.equal((await a.send(server,'fail',v)).status,409);
 const r=await a.send(server,'fail',a.input);assert.equal(r.status,200);assert.equal((await r.json()).state,'failed');assert.equal(a.data.get('event:'+id).completionFingerprint,fingerprint);
});
test('alarm finalizes a proven original receipt and a restarted object verifies its fingerprint',async()=>{
 const a=await fixture(),first=a.make();await first.alarm();const saved=a.data.get('event:'+id);assert.equal(saved.state,'failed');assert.equal(saved.completionOperation,operationId);assert.equal(saved.completionFingerprint,fingerprint);
 const restarted=a.make();const r=await a.send(restarted,'fail',a.input);assert.equal(r.status,200);assert.equal((await r.json()).replayed,true);assert.equal((await a.send(restarted,'fail',{...a.input,reason:'changed'})).status,409);
});
test('without matching D1 proof, an expired event cannot settle or acquire execution rights',async()=>{
 const a=await fixture({proof:false}),server=a.make();assert.equal((await a.send(server,'check',a.input)).status,409);assert.equal((await a.send(server,'fail',a.input)).status,409);await server.alarm();assert.notEqual(a.data.get('event:'+id).completionFingerprint,fingerprint);assert.equal((await a.send(a.make(),'fail',a.input)).status,409);
});
test('wrong source or a mismatched proof cannot settle even after expiry',async()=>{
 for(const mode of ['source','fingerprint','late-intent']){const a=await fixture({source:mode==='source'?2:1}),server=a.make();if(mode!=='source'){const e=a.data.get('event:'+id),i=e.finalizationIntent;a.setEvidence({eventId:id,taskId,sourceVersion:1,...i,...mode==='fingerprint'?{fingerprint:'wrong'}:{acceptedAt:i.leaseUntil},state:'failed'});}assert.equal((await a.send(server,'fail',a.input)).status,409);assert.equal((await a.send(server,'check',a.input)).status,409);}
});

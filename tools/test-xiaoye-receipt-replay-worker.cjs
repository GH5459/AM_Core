const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup,proposal}=require('./test-xiaoye-worker.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventBridge}=require('./xiaoye-event-bridge.cjs');
const op=()=>crypto.randomUUID(),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function prepare(){const a=await setup();const t=await a.get((await a.ok(await a.intake())).taskId);const event=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first();await wait(5300);const job=(await a.ok(await a.machine('runner/event-acquire',{id:event.id,operationId:'acquire-'+event.id},true))).job;return {a,t,job};}
test('a lost failure response can replay only the exact operation and original contents',async()=>{
 const {a,t,job}=await prepare();try{
  const input={id:job.id,lease:job.lease,operationId:op(),reason:'隔離短暫斷線',nextStep:'核對原事件'};
  assert.equal((await a.ok(await a.machine('runner/event-fail',input,true))).state,'failed');
  // Simulate that the worker committed the receipt but its response was lost.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-receipt-replay-'));
  fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key:'fixture-xiaoye-runner-key-000000000001'}));
  fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'http://example.test',LEAF_TASK_TENANT:'fixture'}}));
  fs.writeFileSync(path.join(dir,'bridge-active.private.json'),JSON.stringify({id:job.id,taskId:t.id,sourceVersion:job.sourceVersion,lease:job.lease,phase:'running'}));
  const run=path.join(dir,'event-runs',job.id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'event-fail.input.private.json'),JSON.stringify(input));
  const actions=[];const bridge=new EventBridge({operatorDirectory:dir,workRoot:dir},{WebSocket:class{},fetcher:(url,init)=>{actions.push(new URL(url).pathname.split('/').at(-1));return a.mf.dispatchFetch(url,init);}});
  await bridge.recover();bridge.stop();assert.deepEqual(actions,['event-inspect','event-fail']);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'bridge-active.private.json'))).phase,'finished');
  assert.equal((await a.ok(await a.machine('runner/event-fail',input,true))).replayed,true);
  for(const changed of [{...input,reason:'變更原因'},{...input,nextStep:'變更步驟'},{...input,lease:op()},{...input,operationId:op()}])assert.notEqual((await a.machine('runner/event-fail',changed,true)).status,200);
  assert.notEqual((await a.machine('runner/event-complete',input,true)).status,200);
  const rows=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='event-blocked' AND json_extract(value,'$.taskId')=?").bind(t.id).all()).results;assert.equal(rows.length,1);
  let current=await a.get(t.id);assert(current.secretary.recovery.reason.includes('隔離短暫斷線'));
  await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/supplement',{version:current.version,operationId:op(),detail:'隔離新來源'}));
  assert.notEqual((await a.machine('runner/event-fail',input,true)).status,200);
 }finally{await a.close();}
});
test('source changes invalidate an unfinished old event; a completed receipt is exact and does not rerun work',async()=>{
 const {a,t,job}=await prepare();try{
  await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/supplement',{version:t.version,operationId:op(),detail:'隔離更新來源'}));
  assert.notEqual((await a.machine('runner/event-fail',{id:job.id,lease:job.lease,operationId:op(),reason:'舊來源'},true)).status,200);
 }finally{await a.close();}
 const b=await prepare();try{
  const {a,t,job}=b;await a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),eventId:job.id,eventLease:job.lease,projectId:a.projects[1].id,category:'bug',proposal},true));
  const receipt={id:job.id,lease:job.lease,operationId:op()};assert.equal((await a.ok(await a.machine('runner/event-complete',receipt,true))).state,'done');assert.equal((await a.ok(await a.machine('runner/event-complete',receipt,true))).replayed,true);
  assert.notEqual((await a.machine('runner/event-complete',{...receipt,reason:'不可變更原內容'},true)).status,200);
 }finally{await b.a.close();}
});
test('synthetic crash between D1 and DO finalization resumes only the exact persisted receipt',{skip:process.env.DAILYLOG_FAULT_INJECTION!=='1'},async()=>{
 const {a,t,job}=await prepare();try{
  const input={id:job.id,lease:job.lease,operationId:op(),reason:'fixture-d1-committed-crash',nextStep:'保留原操作'};
  assert.notEqual((await a.machine('runner/event-fail',input,true)).status,200);
  const proof=JSON.parse((await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-event-receipt-proof' AND key=?").bind(job.id).first()).value);assert.equal(proof.operationId,input.operationId);assert.equal(proof.sourceVersion,job.sourceVersion);
  assert.notEqual((await a.machine('runner/event-check',{id:job.id,lease:job.lease},true)).status,200);
  assert.notEqual((await a.machine('runner/event-fail',{...input,reason:'其他內容'},true)).status,200);
  assert.notEqual((await a.machine('runner/event-fail',{...input,operationId:op()},true)).status,200);
  assert.equal((await a.ok(await a.machine('runner/event-fail',input,true))).replayed,true);
  assert.equal((await a.ok(await a.machine('runner/event-fail',input,true))).replayed,true);
  assert.equal((await a.db.prepare("SELECT COUNT(*) n FROM documents WHERE namespace='xiaoye-notifications' AND key=?").bind('event-blocked:'+job.id).first()).n,1);
 }finally{await a.close();}
});
test('synthetic interrupted receipt with changed D1 proof or source stays unresolved',{skip:process.env.DAILYLOG_FAULT_INJECTION!=='1'},async()=>{
 for(const mode of ['fingerprint','source']){
  const {a,t,job}=await prepare();try{
   const input={id:job.id,lease:job.lease,operationId:op(),reason:'fixture-d1-committed-crash'};assert.notEqual((await a.machine('runner/event-fail',input,true)).status,200);
   if(mode==='fingerprint')await a.db.prepare("UPDATE documents SET value=json_set(value,'$.fingerprint','different') WHERE namespace='xiaoye-event-receipt-proof' AND key=?").bind(job.id).run();
   else{const current=await a.get(t.id);current.secretary.sourceVersion++;await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(current),t.id).run();}
   assert.notEqual((await a.machine('runner/event-fail',input,true)).status,200);
  }finally{await a.close();}
 }
});
test('an execute cannot bypass a corrupted D1 proof merely because blocked was normally valid',{skip:process.env.DAILYLOG_FAULT_INJECTION!=='1'},async()=>{
 const a=await setup();try{
  a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  let t=await a.get((await a.ok(await a.intake())).taskId);const analysis=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first();await wait(5300);
  const first=(await a.ok(await a.machine('runner/event-acquire',{id:analysis.id,operationId:'acquire-'+analysis.id},true))).job;
  t=(await a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),eventId:first.id,eventLease:first.lease,projectId:a.projects[1].id,category:'bug',proposal},true))).task;
  await a.ok(await a.machine('runner/event-complete',{id:first.id,lease:first.lease,operationId:op()},true));const execution=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='execute'").bind(t.id).first();await wait(1200);
  const job=(await a.ok(await a.machine('runner/event-acquire',{id:execution.id,operationId:'acquire-'+execution.id},true))).job;await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),eventId:job.id,eventLease:job.lease},true));
  const input={id:job.id,lease:job.lease,operationId:op(),reason:'fixture-d1-committed-crash'};assert.notEqual((await a.machine('runner/event-fail',input,true)).status,200);
  await a.db.prepare("UPDATE documents SET value=json_set(value,'$.fingerprint','different') WHERE namespace='xiaoye-event-receipt-proof' AND key=?").bind(job.id).run();
  assert.notEqual((await a.machine('runner/event-check',{id:job.id,lease:job.lease},true)).status,200);assert.notEqual((await a.machine('runner/event-fail',input,true)).status,200);
 }finally{await a.close();}
});

const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup,proposal}=require('./test-xiaoye-worker.cjs');
const op=()=>crypto.randomUUID(),wait=ms=>new Promise(r=>setTimeout(r,ms));
test('owner-enabled automatic handling preserves the same case, checks the event and never fabricates an approval',async()=>{
 const a=await setup();try{
  a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const created=await a.ok(await a.intake({text:'隔離問題：開啟畫面太慢'}));let t=await a.get(created.taskId);
  const receipt=await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='receipt'").first();assert.match(JSON.parse(receipt.value).message,/直接處理/);
  const row=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first();await wait(5300);
  const analysis=await a.ok(await a.machine('runner/event-acquire',{id:row.id,operationId:'acquire-'+row.id},true));
  const plan={id:t.id,version:t.version,operationId:op(),eventId:analysis.job.id,eventLease:analysis.job.lease,projectId:a.projects[1].id,category:'bug',proposal};
  t=(await a.ok(await a.machine('runner/propose',plan,true))).task;assert.equal(t.secretary.stage,'approved');assert.equal(t.secretary.approval,null);assert.equal(t.secretary.autoAuthorization.hash,t.secretary.proposal.hash);
  const visible=await a.ok(await a.send('900003','/api/tasks/'+t.id));assert(!JSON.stringify(visible).includes(a.config.autoResolutionEpoch));
  assert.equal((await a.db.prepare("SELECT COUNT(*) AS n FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='approval'").first()).n,0);
  const execute=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='execute'").bind(t.id).first();assert(execute);
  t=(await a.ok(await a.machine('runner/bind-chat',{id:t.id,version:t.version,operationId:op(),eventId:analysis.job.id,eventLease:analysis.job.lease,threadId:op(),projectId:op(),hostId:'local'},true))).task;
  assert.equal((await a.ok(await a.machine('runner/event-complete',{id:analysis.job.id,lease:analysis.job.lease,operationId:op()},true))).state,'done');await wait(1200);
  const job=await a.ok(await a.machine('runner/event-acquire',{id:execute.id,operationId:'acquire-'+execute.id},true));assert.equal(job.job.kind,'execute');
  const claim=await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),eventId:job.job.id,eventLease:job.job.lease},true));assert.equal(claim.task.secretary.stage,'executing');
  a.config.autoResolutionEnabled=false;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();assert.equal((await a.machine('runner/check',{id:t.id,lease:claim.lease,eventId:job.job.id,eventLease:job.job.lease},true)).status,403);
  const originalEpoch=a.config.autoResolutionEpoch;a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();assert.equal((await a.machine('runner/check',{id:t.id,lease:claim.lease,eventId:job.job.id,eventLease:job.job.lease},true)).status,403);
  a.config.autoResolutionEpoch=originalEpoch;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const done=await a.ok(await a.machine('runner/finish',{id:t.id,lease:claim.lease,eventId:job.job.id,eventLease:job.job.lease,operationId:op(),result:'隔離問題已處理。',explanation:{cause:'隔離範例。',handling:'修正隔離設定。',outcome:'隔離驗證通過。'},deployed:false,evidence:['隔離測試']},true));assert.equal(done.task.secretary.stage,'awaiting_confirmation');assert.equal(done.task.secretary.approval,null);
  assert.equal((await a.ok(await a.machine('runner/event-complete',{id:job.job.id,lease:job.job.lease,operationId:op()},true))).state,'done');
 }finally{await a.close();}
});

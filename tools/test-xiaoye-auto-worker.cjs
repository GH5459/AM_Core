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

test('a completed blocked execution creates one new analysis after a prior tool recovery',async()=>{
 const a=await setup();try{
  a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const created=await a.ok(await a.intake({text:'隔離問題需要更完整的查核'}));let t=await a.get(created.taskId);
  const analysisRow=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first();await wait(5300);
  const analysis=await a.ok(await a.machine('runner/event-acquire',{id:analysisRow.id,operationId:'acquire-'+analysisRow.id},true));
  t=(await a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),eventId:analysis.job.id,eventLease:analysis.job.lease,projectId:a.projects[1].id,category:'bug',proposal},true))).task;
  const threadId=op();t=(await a.ok(await a.machine('runner/bind-chat',{id:t.id,version:t.version,operationId:op(),eventId:analysis.job.id,eventLease:analysis.job.lease,threadId,projectId:op(),hostId:'local'},true))).task;
  t.secretary.autoRecovery={sourceCount:t.secretary.sources.length,attempts:1,eventId:'f'.repeat(64)};
  await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();
  const executeRow=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='execute'").bind(t.id).first();
  await a.ok(await a.machine('runner/event-complete',{id:analysis.job.id,lease:analysis.job.lease,operationId:op()},true));await wait(1200);
  const execution=await a.ok(await a.machine('runner/event-acquire',{id:executeRow.id,operationId:'acquire-'+executeRow.id},true));
  const claim=await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),eventId:execution.job.id,eventLease:execution.job.lease},true));
  t=(await a.ok(await a.machine('runner/fail',{id:t.id,lease:claim.lease,operationId:op(),eventId:execution.job.id,eventLease:execution.job.lease,result:'隔離查核需要新版方案。',blockerInfo:{reason:'隔離查核範圍不足。',nextStep:'重新分析並擬定新方案。'}},true))).task;
  assert.equal(t.secretary.stage,'blocked');
  const progress=await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='progress' AND json_extract(value,'$.taskId')=?").bind(t.id).first();
  const notice=JSON.parse(progress.value);assert.equal(notice.account,'900003');assert.equal(notice.expectedUserId,'U'+'b'.repeat(32));assert.match(notice.message,/尚未完成/);
  await a.ok(await a.machine('runner/event-complete',{id:execution.job.id,lease:execution.job.lease,operationId:op()},true));
  const inspected=await a.ok(await a.machine('runner/event-inspect',{id:t.id,eventId:execution.job.id},true));assert.equal(inspected.autoResumeEligible,true);
  const input={id:t.id,version:t.version,eventId:execution.job.id,operationId:'auto-resume-event-'+execution.job.id};
  const resumed=await a.ok(await a.machine('runner/auto-resume',input,true));assert.equal(resumed.stage,'clarifying');
  const again=await a.ok(await a.machine('runner/auto-resume',input,true));assert.equal(again.replayed,true);
  const saved=await a.get(t.id);assert.equal(saved.secretary.autoRecovery.attempts,1);assert.equal(saved.secretary.autoRecovery.replanAttempts,1);assert.equal(saved.secretary.approval,null);assert.equal(saved.secretary.caseChat.threadId,threadId);
  assert((await a.db.prepare("SELECT COUNT(*) AS n FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first()).n>=2);
  const next=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze' AND id!=? ORDER BY version DESC LIMIT 1").bind(t.id,analysisRow.id).first();await wait(5300);
  const nextJob=await a.ok(await a.machine('runner/event-acquire',{id:next.id,operationId:'acquire-'+next.id},true));
  const replanned=(await a.ok(await a.machine('runner/propose',{id:t.id,version:saved.version,operationId:op(),eventId:nextJob.job.id,eventLease:nextJob.job.lease,projectId:a.projects[1].id,category:'bug',proposal},true))).task;
  await a.ok(await a.machine('runner/event-complete',{id:nextJob.job.id,lease:nextJob.job.lease,operationId:op()},true));await wait(1200);
  const nextExecution=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='execute' AND id!=? ORDER BY version DESC LIMIT 1").bind(t.id,executeRow.id).first();
  const failedJob=await a.ok(await a.machine('runner/event-acquire',{id:nextExecution.id,operationId:'acquire-'+nextExecution.id},true));
  await a.ok(await a.machine('runner/event-fail',{id:failedJob.job.id,lease:failedJob.job.lease,operationId:op(),reason:'隔離工具短暫中斷',nextStep:'恢復後接續'},true));
  const blocked=await a.get(t.id),retryCheck=await a.ok(await a.machine('runner/event-inspect',{id:t.id,eventId:failedJob.job.id},true));assert.equal(retryCheck.autoResumeEligible,true);
  await a.ok(await a.machine('runner/auto-resume',{id:t.id,version:blocked.version,eventId:failedJob.job.id,operationId:'auto-resume-event-'+failedJob.job.id},true));
  const afterRetry=await a.get(t.id);assert.equal(afterRetry.secretary.autoRecovery.failureAfterReplan,1);assert.equal(afterRetry.secretary.caseChat.threadId,threadId);
  const third=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze' AND id!=? AND id!=? ORDER BY version DESC LIMIT 1").bind(t.id,analysisRow.id,next.id).first();await wait(5300);
  const thirdJob=await a.ok(await a.machine('runner/event-acquire',{id:third.id,operationId:'acquire-'+third.id},true));
  const asked=await a.ok(await a.machine('runner/clarify',{id:t.id,version:afterRetry.version,eventId:thirdJob.job.id,eventLease:thirdJob.job.lease,operationId:op(),question:'請問是在什麼畫面看到問題？'},true));assert.equal(asked.task.secretary.waitingForReporter,true);
  const question=await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question' AND json_extract(value,'$.taskId')=?").bind(t.id).first();
  assert.equal(JSON.parse(question.value).expectedUserId,'U'+'b'.repeat(32));
 }finally{await a.close();}
});

test('a background tool failure queues a status message only for the original reporter',async()=>{
 const a=await setup();try{
  a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const created=await a.ok(await a.intake({text:'隔離工具無法連線'}));const row=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(created.taskId).first();await wait(5300);
  const acquired=await a.ok(await a.machine('runner/event-acquire',{id:row.id,operationId:'acquire-'+row.id},true));
  await a.ok(await a.machine('runner/event-fail',{id:row.id,lease:acquired.job.lease,operationId:op(),reason:'隔離工具暫時無法連線',nextStep:'恢復後自動接續'},true));
  const rows=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='progress' AND json_extract(value,'$.taskId')=?").bind(created.taskId).all()).results;
  assert.equal(rows.length,1);const notice=JSON.parse(rows[0].value);assert.equal(notice.account,'900003');assert.equal(notice.expectedUserId,'U'+'b'.repeat(32));assert.match(notice.message,/尚未完成/);
 }finally{await a.close();}
});

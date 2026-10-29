const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {setup,proposal}=require('./test-xiaoye-worker.cjs');
const {EventBridge}=require('./xiaoye-event-bridge.cjs');
const op=()=>crypto.randomUUID(),wait=ms=>new Promise(r=>setTimeout(r,ms));
test('complete worker: legacy marker, missing capability, paused guard, one recovery and reporter question',async()=>{
 const a=await setup();let bridge;
 try{
  a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();
  await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const created=await a.ok(await a.intake({text:'隔離問題：工具受阻後接續'}));let t=await a.get(created.taskId);
  const analysis=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first();await wait(5300);
  const first=(await a.ok(await a.machine('runner/event-acquire',{id:analysis.id,operationId:'acquire-'+analysis.id},true))).job;
  t=(await a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),eventId:first.id,eventLease:first.lease,projectId:a.projects[3].id,category:'bug',proposal},true))).task;
  const threadId=op();t=(await a.ok(await a.machine('runner/bind-chat',{id:t.id,version:t.version,operationId:op(),eventId:first.id,eventLease:first.lease,threadId,projectId:op(),hostId:'local'},true))).task;
  const execution=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='execute'").bind(t.id).first();
  await a.ok(await a.machine('runner/event-complete',{id:first.id,lease:first.lease,operationId:op()},true));await wait(1200);
  const job=(await a.ok(await a.machine('runner/event-acquire',{id:execution.id,operationId:'acquire-'+execution.id},true))).job;
  const claim=await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),eventId:job.id,eventLease:job.lease},true));
  t=(await a.ok(await a.machine('runner/fail',{id:t.id,lease:claim.lease,eventId:job.id,eventLease:job.lease,operationId:op(),result:'隔離發布工具不可用',blockerInfo:{reason:'隔離工具未提供精準發布。',nextStep:'恢復後自動接續。',capability:'render-deploy-commit-v1',publishOutcome:'not-started'}},true))).task;
  const notice=JSON.parse((await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='progress' AND json_extract(value,'$.taskId')=?").bind(t.id).first()).value);
  assert.equal(notice.account,'900003');assert.equal(notice.expectedUserId,'U'+'b'.repeat(32));assert.match(notice.message,/尚未完成/);
  await a.ok(await a.machine('runner/event-complete',{id:job.id,lease:job.lease,operationId:op()},true));
  t=await a.get(t.id);t.secretary.autoRecovery={sourceCount:t.secretary.sources.length,attempts:1,replanAttempts:3};
  await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-capability-worker-')),run=path.join(dir,'event-runs',job.id);fs.mkdirSync(run,{recursive:true});
  fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key:'fixture'}));fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'https://fixture.invalid',LEAF_TASK_TENANT:'fixture'}}));
  fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job}));fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
  const marker=path.join(run,'auto-resume.response.private.json');fs.writeFileSync(marker,JSON.stringify({skipped:true,reason:'case-changed'}));
  let capability=false;const calls=[];
  const fetcher=async(url,opts)=>{const action=new URL(url).pathname.split('/').at(-1);calls.push(action);return a.machine('runner/'+action,JSON.parse(opts.body),true);};
  bridge=new EventBridge({operatorDirectory:dir,workRoot:dir},{fetcher,WebSocket:class{},verifyCaseExecutor:async()=>true,verifyExactRenderPublish:async()=>capability});
  // These writes touch only the in-memory synthetic D1 fixture.
  const paused=structuredClone(t);paused.secretary.stage='paused';await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(paused),t.id).run();
  capability=true;await bridge.recoverFailedEvents();assert.equal((await a.get(t.id)).secretary.stage,'paused');assert(!calls.includes('auto-resume'));
  await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();fs.writeFileSync(marker,JSON.stringify({skipped:true,reason:'case-changed'}));
  calls.length=0;capability=false;await bridge.recoverFailedEvents();assert.equal((await a.get(t.id)).secretary.stage,'blocked');assert(!calls.includes('auto-resume'));assert(bridge.failedRecoveryTimer);
  calls.length=0;capability=true;await bridge.recoverFailedEvents();assert.equal(calls.filter(x=>x==='auto-resume').length,1);
  const resumed=await a.get(t.id);assert.equal(resumed.secretary.stage,'clarifying');assert.equal(resumed.secretary.caseChat.threadId,threadId);assert.equal(resumed.secretary.autoRecovery.capabilityEvents[0].name,'render-deploy-commit-v1');assert.equal(resumed.secretary.autoRecovery.capabilityEvents[0].eventId,job.id);
  await bridge.recoverFailedEvents();assert.equal(calls.filter(x=>x==='auto-resume').length,1);
  const next=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze' AND id!=? ORDER BY version DESC LIMIT 1").bind(t.id,analysis.id).first();assert(next);await wait(5300);
  const nextJob=(await a.ok(await a.machine('runner/event-acquire',{id:next.id,operationId:'acquire-'+next.id},true))).job;
  const asked=await a.ok(await a.machine('runner/clarify',{id:t.id,version:resumed.version,eventId:nextJob.id,eventLease:nextJob.lease,operationId:op(),question:'隔離測試：請問在哪個畫面出現？'},true));assert(asked.task.secretary.waitingForReporter);
  const question=JSON.parse((await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question' AND json_extract(value,'$.taskId')=?").bind(t.id).first()).value);
  assert.equal(question.account,'900003');assert.equal(question.expectedUserId,'U'+'b'.repeat(32));
 }finally{bridge?.stop();await a.close();}
});

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {setup} = require('./test-xiaoye-worker.cjs');

test('only the current event can bind one case chat to the original card', async () => {
  const a = await setup();
  try {
    const created = await a.ok(await a.intake({text:'隔離測試：開啟頁面失敗'}));
    const row = await a.db.prepare('SELECT * FROM xiaoye_event_outbox WHERE task_id=?').bind(created.taskId).first();
    await new Promise(resolve => setTimeout(resolve, 5300));
    const acquired = await a.ok(await a.machine('runner/event-acquire',{id:row.id,operationId:'fixture-acquire-'+row.id},true));
    const input = {id:created.taskId,version:acquired.task.version,operationId:crypto.randomUUID(),eventId:acquired.job.id,eventLease:acquired.job.lease,threadId:crypto.randomUUID(),projectId:crypto.randomUUID(),hostId:'local'};
    assert.equal((await a.machine('runner/bind-chat',{...input,eventLease:'wrong',operationId:crypto.randomUUID()},true)).status,403);
    const bound = await a.ok(await a.machine('runner/bind-chat',input,true));
    assert.equal(bound.task.secretary.caseChat.threadId,input.threadId);
    const caseLink = bound.task.resultLinks.find(item=>item.label==='案件處理詳情');
    assert.equal(new URL(caseLink.url).searchParams.get('issue'),created.taskId);
    const replay = await a.ok(await a.machine('runner/bind-chat',input,true));
    assert.equal(replay.replayed,true);
    assert.equal((await a.get(created.taskId)).version,bound.task.version);
    const reporter = await a.ok(await a.send('900003','/api/xiaoye/overview'));
    assert.equal(reporter.tasks[0].secretary.caseChat,undefined);
    const owner = await a.ok(await a.send('140901','/api/xiaoye/overview'));
    assert.equal(owner.tasks[0].secretary.caseChat.threadId,input.threadId);
    const conflict = {...input,version:bound.task.version,operationId:crypto.randomUUID(),threadId:crypto.randomUUID()};
    assert.equal((await a.machine('runner/bind-chat',conflict,true)).status,409);
    assert.equal((await a.get(created.taskId)).secretary.caseChat.threadId,input.threadId);
  } finally { await a.close(); }
});

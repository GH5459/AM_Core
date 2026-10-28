// Exercises the existing full Worker with synthetic D1 data and a fake desktop.
// This is not an end-to-end LINE or desktop integration test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {setup} = require('./test-xiaoye-worker.cjs');
const {CaseChatRegistry, getOrCreateCaseChat} = require('./xiaoye-case-chat-registry.cjs');

test('synthetic original card and a later supplement retain one registered case chat', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoye-worker-case-'));
  const a = await setup();
  t.after(async () => { await a.close(); fs.rmSync(directory, {recursive:true, force:true}); });
  const bot = 'U' + 'a'.repeat(32), user = 'U' + 'b'.repeat(32);
  const source = () => ({botUserId:bot, type:'user', conversationId:user, userId:user, eventId:crypto.randomUUID(), messageId:crypto.randomUUID(), timestamp:Date.now()});
  const first = await a.ok(await a.intake({source:source(), text:'隔離示例：按鈕沒有反應'}));
  const registry = new CaseChatRegistry(directory), projectId = crypto.randomUUID();
  let creates = 0;
  const route = {registry, caseId:first.taskId, projectId,
    check:async()=>({caseId:first.taskId,projectId,valid:!!await a.get(first.taskId)}),
    create:async()=>{creates++;return {threadId:crypto.randomUUID()};}};
  const original = await getOrCreateCaseChat(route);
  const supplement = await a.ok(await a.intake({start:false, source:source(), text:'隔離示例：手機也遇到問題'}));
  assert.equal(supplement.taskId, first.taskId);
  const current = await a.get(first.taskId);
  assert(current.description.includes('手機也遇到問題'));
  const resumed = await getOrCreateCaseChat(route);
  assert.equal(resumed.threadId, original.threadId);
  assert.equal(creates, 1);
  const count = await a.db.prepare('SELECT count(*) AS n FROM work_items WHERE id=?').bind(first.taskId).first();
  assert.equal(count.n, 1);
});

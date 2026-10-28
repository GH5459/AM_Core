const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {CaseChatRegistry, getOrCreateCaseChat} = require('./xiaoye-case-chat-registry.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoye-case-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const caseId = 'work-' + crypto.randomUUID(), projectId = crypto.randomUUID();
  const registry = new CaseChatRegistry(directory);
  let calls = 0, valid = true;
  const input = {registry, caseId, projectId, check:async () => ({caseId, projectId, valid}), create:async () => {calls++; return {threadId:crypto.randomUUID()};}};
  return {input, registry, caseId, projectId, calls:() => calls, invalidate:() => {valid=false;}};
}

test('one case keeps its original chat across subsequent events', async t => {
  const f = fixture(t), first = await getOrCreateCaseChat(f.input), next = await getOrCreateCaseChat(f.input);
  assert.equal(first.threadId, next.threadId);
  assert.equal(f.calls(), 1);
  assert.equal(f.registry.read(f.caseId).phase, 'ready');
});

test('unknown creation result is retained and never automatically creates another chat', async t => {
  const f = fixture(t); let calls = 0;
  f.input.create = async () => {calls++; throw Error('connection lost');};
  await assert.rejects(getOrCreateCaseChat(f.input), /connection lost/);
  await assert.rejects(getOrCreateCaseChat(f.input), /未確認/);
  assert.equal(calls, 1);
  assert.equal(f.registry.read(f.caseId).phase, 'creating');
});

test('a pending desktop creation does not cause an automatic retry', async t => {
  const f = fixture(t); f.input.create = async () => ({clientThreadId:'pending'});
  await assert.rejects(getOrCreateCaseChat(f.input), /未確認/);
  await assert.rejects(getOrCreateCaseChat(f.input), /未確認/);
});

test('invalidated or differently classified case is not dispatched', async t => {
  const f = fixture(t); f.invalidate();
  await assert.rejects(getOrCreateCaseChat(f.input), /案件已更新/);
  assert.equal(f.calls(), 0);
  assert.equal(f.registry.read(f.caseId), null);
});

test('invalidation immediately before desktop creation releases an unused reservation', async t => {
  const f = fixture(t); let checks = 0;
  f.input.check = async () => ({caseId:f.caseId, projectId:f.projectId, valid:++checks === 1});
  await assert.rejects(getOrCreateCaseChat(f.input), /案件已更新/);
  assert.equal(f.calls(), 0);
  assert.equal(f.registry.read(f.caseId), null);
});

test('project changes are not silently routed into an old project', async t => {
  const f = fixture(t); await getOrCreateCaseChat(f.input);
  const other = crypto.randomUUID();
  await assert.rejects(getOrCreateCaseChat({...f.input, projectId:other, check:async()=>({caseId:f.caseId,projectId:other,valid:true})}), /專案已變更/);
  assert.equal(f.calls(), 1);
});

test('classification moves the same chat to the confirmed project', async t => {
  const f = fixture(t), first = await getOrCreateCaseChat(f.input), nextProject = crypto.randomUUID();
  const input = {...f.input, projectId:nextProject, check:async()=>({caseId:f.caseId,projectId:nextProject,valid:true}), move:async request=>({threadId:request.threadId,projectId:request.projectId})};
  const moved = await getOrCreateCaseChat(input);
  assert.equal(moved.threadId, first.threadId);
  assert.equal(moved.projectId, nextProject);
  assert.equal(f.calls(), 1);
});

test('unknown project move is preserved for inspection rather than repeated', async t => {
  const f = fixture(t); await getOrCreateCaseChat(f.input);
  const nextProject = crypto.randomUUID(); let moves = 0;
  const input = {...f.input, projectId:nextProject, check:async()=>({caseId:f.caseId,projectId:nextProject,valid:true}), move:async()=>{moves++;throw Error('move response lost');}};
  await assert.rejects(getOrCreateCaseChat(input), /move response lost/);
  await assert.rejects(getOrCreateCaseChat(input), /未確認/);
  assert.equal(moves, 1);
  assert.equal(f.registry.read(f.caseId).phase, 'moving');
});

test('concurrent attempts reserve at most one chat creation', async t => {
  const f = fixture(t); let release;
  f.input.create = async () => {await new Promise(resolve => {release=resolve;}); return {threadId:crypto.randomUUID()};};
  const first = getOrCreateCaseChat(f.input);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(getOrCreateCaseChat(f.input), /未確認/);
  release(); await first;
});

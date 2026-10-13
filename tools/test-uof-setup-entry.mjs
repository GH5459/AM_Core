import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUofSetupEntry, uofSetupMessage } from '../core/uof-setup-entry.js';
import { directUofQuery } from '../core/line-io/conversation.js';
const userId = 'U' + 'a'.repeat(32);
const event = (text = '待簽', id = 'fixture-query') => ({ type: 'message', webhookEventId: id,
  source: { type: 'user', userId }, replyToken: 'fixture-reply-' + id, message: { type: 'text', text } });

test('only exact pending queries in well formed private chats open setup', () => {
  for (const text of ['待簽', '代簽', '查詢待簽', ' 查詢待辦 ']) assert(directUofQuery(event(text)));
  for (const text of ['你好', '綁定 UOF code', '核准 DOC1', '工作日誌', '待簽 https://evil.example']) assert(!directUofQuery(event(text)));
  for (const source of [{ type: 'group', userId, groupId: 'C' + '1'.repeat(32) }, { type: 'room', userId },
    { type: 'user', userId, groupId: 'spoof' }, { type: 'user', userId: 'invalid' }]) assert(!directUofQuery({ ...event(), source }));
  assert(!directUofQuery({ ...event(), type: 'postback', postback: { data: 'uof.submit.fixture' } }));
});

test('unbound navigation is partitioned before pause; bound and unrelated events retain original paths', async () => {
  const unbound = event(), bound = event('待簽', 'bound'), ordinary = event('你好', 'ordinary');
  const entry = createUofSetupEntry({ line: {}, lineIo: { uofSetupEvents: async events => events.filter(e => e === unbound) } });
  assert.deepEqual(await entry.partition([unbound, bound, ordinary]), { setupEvents: [unbound], remaining: [bound, ordinary] });
  const disabled = createUofSetupEntry({ line: {}, lineIo: {} });
  assert.deepEqual(await disabled.partition([unbound]), { setupEvents: [], remaining: [unbound] });
  const failed = createUofSetupEntry({ line: {}, lineIo: { uofSetupEvents: async () => { throw Error('database offline'); } } });
  await assert.rejects(failed.partition([unbound]), /database offline/);
});

test('reply uses only the triggering token and fixed public URL, with bounded redelivery suppression', async () => {
  const replies = [], entry = createUofSetupEntry({ line: { replyLineMessages: async (...args) => replies.push(args) }, lineIo: {} });
  await Promise.all([entry.handle(event()), entry.handle(event())]);
  assert.equal(replies.length, 1);assert.equal(replies[0][0], event().replyToken);
  const message = replies[0][1][0];assert.deepEqual(message, uofSetupMessage());
  assert.equal(message.template.actions[0].uri, 'https://uof-line.ghotel.tw/Line/Setup?openExternalBrowser=1');
  assert(message.template.text.includes('本人 UOF 帳密'));assert(message.template.text.includes('確認自己的 LINE 名稱'));
  assert(!JSON.stringify(message).includes(userId));assert(message.template.text.length <= 160);
  assert(message.template.actions[0].label.length <= 20);
  await entry.handle({ ...event('待簽', 'standby'), mode: 'standby' });
  await entry.handle({ ...event('待簽', 'no-token'), replyToken: undefined });
  assert.equal(await entry.handle(event('你好')), false);assert.equal(replies.length, 1);
});

test('reply errors disclose no provider detail and never fall back to a push', async () => {
  let calls = 0;const logs = [];
  const entry = createUofSetupEntry({ line: { replyLineMessages: async () => { calls++;throw Error('private provider detail'); },
    pushLineMessage: () => assert.fail('unsolicited push') }, lineIo: {}, logger: { warn: value => logs.push(value) } });
  await entry.handle(event());await entry.handle(event());await entry.handle(event('待簽', 'new-query'));
  assert.equal(calls, 2);assert(!JSON.stringify(logs).includes('private provider detail'));
});

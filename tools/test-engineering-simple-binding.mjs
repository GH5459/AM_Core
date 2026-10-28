import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as onboarding from '../core/group-onboarding.js';

// Exercise the real server handler with isolated LINE/Notion adapters.
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function maybeHandleGroupOnboardingCommand('), source.indexOf('\nconst server = http.createServer'));
const create = new Function('deps', `const {line,tenants,logger,replyLine,existingGroupBindingRecords,groupBindingSchema,findTenantProjectByName,bindingMemberMap,platform,router,parseGroupOnboardingCommand,withResolvedGroupName,supportedGroupOnboardingExamples,groupOnboardingProperties,groupOnboardingRepairProperties,groupOnboardingSuccessMessage}=deps; ${handler}; return maybeHandleGroupOnboardingCommand;`);
const tenant = { key: 'engineering', displayName: '工程 AM', notionConfigured: true, dataSources: { groupBindings: 'engineering-bindings' } };
function setup({ records = [], name = '示範工程群', failName = false } = {}) {
  const writes = [], replies = [], invalidated = [];
  const run = create({ ...onboarding, tenants: [tenant], logger: { log() {}, warn() {} },
    line: { resolveGroupName: async () => { if (failName) throw Error('name unavailable'); return name; }, resolveSenderName: async () => '測試管理者' },
    replyLine: async (_, text) => replies.push(text),
    existingGroupBindingRecords: async () => records,
    groupBindingSchema: async () => null,
    findTenantProjectByName: async () => { throw Error('must not guess a project'); },
    bindingMemberMap: () => ({ '既有成員': 'existing-user' }),
    platform: { notionRequest: async (path, input) => { writes.push({ path, ...input }); return { id: 'binding-page' }; } },
    router: { invalidate: id => invalidated.push(id) },
  });
  return { run, writes, replies, invalidated };
}
function event(text = '綁定工程群組') {
  return { type: 'message', source: { type: 'group', groupId: 'source-group', userId: 'operator' }, message: { type: 'text', text } };
}
test('plain and native bot mention bind the actual source group and reply once', async () => {
  for (const e of [event(), { ...event('@小葉 綁定工程群組'), message: { type: 'text', text: '@小葉 綁定工程群組', mention: { mentionees: [{ type: 'user', isSelf: true, index: 0, length: 3 }] } } }]) {
    const s = setup();
    assert.equal(await s.run(e, 'source-group'), true);
    assert.equal(s.writes.length, 1);
    assert.equal(s.writes[0].tenantKey, 'engineering');
    assert.equal(s.writes[0].body.parent.data_source_id, 'engineering-bindings');
    assert.equal(s.writes[0].body.properties['LINE 群組 ID'].rich_text[0].text.content, 'source-group');
    assert.equal(s.writes[0].body.properties['群組名稱'].title[0].text.content, '示範工程群');
    assert.equal(s.writes[0].body.properties['專案'], undefined);
    assert.equal(s.replies.length, 1);
    assert.match(s.replies[0], /已綁定.*示範工程群/);
    assert.match(s.replies[0], /補選專案/);
    assert.deepEqual(s.invalidated, ['source-group']);
  }
});
test('direct chat, unavailable name, and peer mention cannot create bindings', async () => {
  const direct = setup();
  await direct.run({ ...event(), source: { type: 'user', userId: 'operator' } }, '');
  assert.equal(direct.writes.length, 0);
  assert.match(direct.replies[0], /請在 LINE 群組內/);
  for (const options of [{ name: '' }, { failName: true }]) {
    const s = setup(options); await s.run(event(), 'source-group');
    assert.equal(s.writes.length, 0); assert.match(s.replies[0], /群組綁定失敗/);
  }
  const s = setup(), e = event('@同事 綁定工程群組');
  e.message.mention = { mentionees: [{ type: 'user', isSelf: false, index: 0, length: 3 }] };
  assert.equal(await s.run(e, 'source-group'), false);
  assert.equal(s.writes.length, 0); assert.equal(s.replies.length, 0);
});
test('cross-tenant and duplicate records remain blocked', async () => {
  for (const records of [[{ tenant: { key: 'forest', displayName: '森在' }, row: { id: 'foreign' } }],
    [{ tenant, row: { id: 'a' } }, { tenant, row: { id: 'b' } }]]) {
    const s = setup({ records }); await s.run(event(), 'source-group');
    assert.equal(s.writes.length, 0); assert.match(s.replies[0], /群組綁定失敗/);
  }
  const s = setup(); await s.run(event(), 'source-group', { tenant: { key: 'forest', displayName: '森在' } });
  assert.equal(s.writes.length, 0); assert.match(s.replies[0], /不會跨租戶/);
});
test('repeat binding preserves project, role, trade, capabilities and existing members', async () => {
  const s = setup({ records: [{ tenant, row: { id: 'existing' } }] });
  await s.run(event(), 'source-group', { tenant, binding: {} });
  assert.equal(s.writes.length, 1); assert.equal(s.writes[0].method, 'PATCH');
  const p = s.writes[0].body.properties;
  for (const key of ['專案', '群組角色', '工種', '啟用功能']) assert.equal(p[key], undefined);
  assert.deepEqual(JSON.parse(p['成員對照'].rich_text[0].text.content), { '既有成員': 'existing-user', '測試管理者': 'operator' });
});

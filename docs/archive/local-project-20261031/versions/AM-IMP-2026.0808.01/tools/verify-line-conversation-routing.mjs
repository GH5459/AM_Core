import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertTenantRoute,
  resolveConversationRoute,
} from '../runtime/conversation-routing.mjs';
import {
  InMemoryTenantConversationRepository,
  recentConversationContext,
  repairConversationProjections,
  storeConversationEvent,
} from '../runtime/conversation-storage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'line-conversation-cases.json'), 'utf8'));
const connection = fixture.lineConnectionId;
const secret = 'fixture-only-hash-secret';
const now = new Date('2026-08-08T08:00:00.000Z');
const tenantA = { key: 'tenant-a' };
const tenantB = { key: 'tenant-b' };
const repositories = {
  'tenant-a': new InMemoryTenantConversationRepository({ tenantKey: 'tenant-a' }),
  'tenant-b': new InMemoryTenantConversationRepository({ tenantKey: 'tenant-b' }),
};
const audits = [];
const registry = {
  rows: new Map(),
  async upsertPlatformConversation(row) { this.rows.set(row.platformConversationId, row); },
  async recordRouteAudit(row) { const id = `audit-${audits.length + 1}`; audits.push({ id, ...row }); return id; },
};

let membershipMode = 'single';
let groupTenant = tenantA;
let bindingSequence = 1;
const directResolver = async () => {
  if (membershipMode === 'unbound') return { reason: 'identity-not-bound' };
  if (membershipMode === 'multi-no-active') return { reason: 'active-workspace-required' };
  const tenant = membershipMode === 'multi-active-b' ? tenantB : tenantA;
  return {
    tenant,
    actorContext: { membershipCount: membershipMode.startsWith('multi') ? 2 : 1, activeWorkspace: tenant.key },
    bindingPeriod: { id: `direct-${tenant.key}`, status: 'active', startsAt: '2026-08-01T00:00:00.000Z' },
  };
};
const groupResolver = async ({ externalKey, conversationType }) => {
  if (externalKey.startsWith('unbound')) return { reason: 'group-not-bound' };
  return {
    tenant: groupTenant,
    binding: { pageId: `binding-${groupTenant.key}`, externalKey, conversationType },
    bindingPeriod: { id: `group-period-${bindingSequence}-${groupTenant.key}`, status: 'active', startsAt: '2026-08-01T00:00:00.000Z' },
    actorContext: { source: 'group-binding' },
  };
};

function event({ sourceType = 'direct', externalKey = 'user-a', id = 'm-1', type = 'text', text = 'hello', timestamp = now.getTime(), userId = 'member-a' } = {}) {
  const source = sourceType === 'direct' ? { type: 'direct', userId: externalKey }
    : sourceType === 'group' ? { type: 'group', groupId: externalKey, userId }
      : { type: 'room', roomId: externalKey, userId };
  return { type: 'message', timestamp, source, message: { id, type, text, fileName: type === 'file' ? 'fixture.pdf' : undefined } };
}

async function route(lineEvent) {
  return resolveConversationRoute({
    event: lineEvent,
    lineConnectionId: connection,
    hashSecret: secret,
    registry,
    resolveDirectRoute: directResolver,
    resolveGroupRoute: groupResolver,
    now,
  });
}

async function store(routed, lineEvent, options = {}) {
  const repo = repositories[routed.tenant.key];
  return storeConversationEvent({
    route: routed,
    event: lineEvent,
    repository: repo,
    flags: { lineConversationStorageEnabled: true },
    senderName: options.senderName || 'Fixture User',
    displayName: options.displayName || 'Fixture Conversation',
    direction: options.direction || 'incoming',
  });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('direct-single-membership', async () => {
  membershipMode = 'single';
  const first = await route(event({ id: 'direct-single-1' }));
  const second = await route(event({ id: 'direct-single-2' }));
  const a = await store(first, event({ id: 'direct-single-1' }));
  const b = await store(second, event({ id: 'direct-single-2' }));
  const otherUserEvent = event({ externalKey: 'user-b', id: 'direct-other-user' });
  const otherUser = await store(await route(otherUserEvent), otherUserEvent);
  const otherConnection = await resolveConversationRoute({
    event: event({ id: 'direct-other-connection' }),
    lineConnectionId: 'another-line-connection',
    hashSecret: secret,
    registry,
    resolveDirectRoute: directResolver,
    resolveGroupRoute: groupResolver,
    now,
  });
  assert.equal(first.tenant.key, 'tenant-a');
  assert.equal(a.conversation.id, b.conversation.id);
  assert.notEqual(a.conversation.id, otherUser.conversation.id);
  assert.notEqual(first.platformConversation.platformConversationId, otherConnection.platformConversation.platformConversationId);
});

test('direct-multiple-memberships-active-workspace', async () => {
  membershipMode = 'multi-active-b';
  const resolved = await route(event({ externalKey: 'user-multi', id: 'direct-multi-active' }));
  assert.equal(resolved.tenant.key, 'tenant-b');
});

test('direct-multiple-memberships-no-active-workspace', async () => {
  membershipMode = 'multi-no-active';
  const resolved = await route(event({ externalKey: 'user-no-active', id: 'direct-no-active' }));
  assert.equal(resolved.tenant, null);
  assert.equal(resolved.reason, 'active-workspace-required');
});

test('unbound-direct-binding-code', async () => {
  membershipMode = 'unbound';
  const resolved = await route(event({ externalKey: 'new-user', id: 'binding-code', text: '123456' }));
  assert.equal(resolved.tenant, null);
  assert.equal(resolved.preRouteCommand, 'binding-code');
});

test('unbound-direct-normal-message', async () => {
  membershipMode = 'unbound';
  const before = repositories['tenant-a'].messages.size + repositories['tenant-b'].messages.size;
  const resolved = await route(event({ externalKey: 'new-user-2', id: 'unbound-normal', text: '普通訊息' }));
  assert.equal(resolved.tenant, null);
  assert.equal(repositories['tenant-a'].messages.size + repositories['tenant-b'].messages.size, before);
});

test('bound-group-text-image-file', async () => {
  groupTenant = tenantA; bindingSequence = 1;
  const ids = [];
  for (const [index, type] of ['text', 'image', 'file'].entries()) {
    const lineEvent = event({ sourceType: 'group', externalKey: 'group-media', id: `group-media-${type}`, type, timestamp: now.getTime() + index });
    const saved = await store(await route(lineEvent), lineEvent);
    ids.push(saved.conversation.id);
  }
  assert.equal(new Set(ids).size, 1);
  const otherGroupEvent = event({ sourceType: 'group', externalKey: 'group-media-other', id: 'group-media-other' });
  const otherGroup = await store(await route(otherGroupEvent), otherGroupEvent);
  assert.notEqual(otherGroup.conversation.id, ids[0]);
});

test('bound-room-message', async () => {
  const lineEvent = event({ sourceType: 'room', externalKey: 'room-a', id: 'room-message' });
  const roomRoute = await route(lineEvent);
  const saved = await store(roomRoute, lineEvent);
  const sameStringGroupEvent = event({ sourceType: 'group', externalKey: 'room-a', id: 'same-string-group-message' });
  const sameStringGroupRoute = await route(sameStringGroupEvent);
  const sameStringGroup = await store(sameStringGroupRoute, sameStringGroupEvent);
  assert.equal(saved.conversation.conversationType, 'room');
  assert.notEqual(roomRoute.platformConversation.platformConversationId, sameStringGroupRoute.platformConversation.platformConversationId);
  assert.notEqual(saved.conversation.id, sameStringGroup.conversation.id);
});

test('unbound-group-onboarding', async () => {
  const resolved = await route(event({ sourceType: 'group', externalKey: 'unbound-group', id: 'group-onboarding', text: '綁定群組 123456' }));
  assert.equal(resolved.tenant, null);
  assert.equal(resolved.preRouteCommand, 'group-onboarding');
});

test('webhook-retry-idempotency', async () => {
  membershipMode = 'single';
  const lineEvent = event({ externalKey: 'retry-user', id: 'same-message-id' });
  const resolved = await route(lineEvent);
  const one = await store(resolved, lineEvent);
  const two = await store(resolved, lineEvent);
  assert.equal(one.message.id, two.message.id);
  assert.equal(two.duplicate, true);
});

test('conversation-rebinding', async () => {
  groupTenant = tenantA; bindingSequence = 10;
  const oldEvent = event({ sourceType: 'group', externalKey: 'rebind-group', id: 'before-rebind' });
  const oldSaved = await store(await route(oldEvent), oldEvent);
  groupTenant = tenantB; bindingSequence = 11;
  const newEvent = event({ sourceType: 'group', externalKey: 'rebind-group', id: 'after-rebind' });
  const newSaved = await store(await route(newEvent), newEvent);
  assert.notEqual(oldSaved.conversation.tenantConversationId, newSaved.conversation.tenantConversationId);
  assert.equal(repositories['tenant-a'].messages.has(oldSaved.message.id), true);
  assert.equal(repositories['tenant-b'].messages.has(newSaved.message.id), true);
});

test('projection-repair', async () => {
  membershipMode = 'single';
  const lineEvent = event({ externalKey: 'repair-user', id: 'repair-message' });
  const resolved = await route(lineEvent);
  repositories['tenant-a'].failNextProjection = true;
  const saved = await store(resolved, lineEvent);
  assert.equal(saved.projectionPending, true);
  const repaired = await repairConversationProjections(repositories['tenant-a']);
  assert.equal(repaired.some((row) => row.repaired), true);
});

test('cross-tenant-denial', async () => {
  membershipMode = 'single';
  const resolved = await route(event({ externalKey: 'tenant-guard-user', id: 'guard' }));
  assert.throws(() => assertTenantRoute(resolved, 'tenant-b'), /Cross-tenant access blocked/);
  await assert.rejects(() => storeConversationEvent({
    route: resolved,
    event: event({ externalKey: 'tenant-guard-user', id: 'guard-write' }),
    repository: repositories['tenant-b'],
    flags: { lineConversationStorageEnabled: true },
  }), /Cross-tenant access blocked/);
});

test('incoming-outgoing-same-conversation', async () => {
  membershipMode = 'single';
  const incoming = event({ externalKey: 'duplex-user', id: 'duplex-in', text: '問題' });
  const routed = await route(incoming);
  const savedIn = await store(routed, incoming);
  const outgoing = event({ externalKey: 'duplex-user', id: 'duplex-out', text: '回答', timestamp: now.getTime() + 1 });
  const savedOut = await store(await route(outgoing), outgoing, { direction: 'outgoing', senderName: 'AM Assistant' });
  assert.equal(savedIn.conversation.id, savedOut.conversation.id);
  assert.equal(savedOut.message.direction, 'outgoing');
});

test('system-command-no-task', async () => {
  membershipMode = 'single';
  const lineEvent = event({ externalKey: 'command-user', id: 'command-message', text: '查待辦' });
  const saved = await store(await route(lineEvent), lineEvent);
  assert.equal(saved.message.systemOperationCommand, true);
  assert.equal(saved.message.taskEligible, false);
});

test('recent-twenty-message-window', async () => {
  membershipMode = 'single';
  let conversationId = '';
  for (let i = 0; i < 25; i += 1) {
    const lineEvent = event({ externalKey: 'window-user', id: `window-${i}`, text: `message-${i}`, timestamp: now.getTime() + i });
    const saved = await store(await route(lineEvent), lineEvent);
    conversationId = saved.conversation.id;
  }
  const recent = await recentConversationContext(repositories['tenant-a'], conversationId, 20);
  assert.equal(recent.length, 20);
  assert.equal(recent[0].content, 'message-5');
  assert.equal(recent[19].content, 'message-24');
});

const expected = new Set(fixture.cases);
const actual = new Set(tests.map((entry) => entry.name));
assert.deepEqual(actual, expected, 'Fixture case names and executable tests must stay aligned.');

const results = [];
for (const entry of tests) {
  try {
    await entry.fn();
    results.push({ case: entry.name, ok: true });
  } catch (error) {
    results.push({ case: entry.name, ok: false, error: error.stack || error.message });
  }
}

const report = { ok: results.every((row) => row.ok), cases: results.length, results };
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

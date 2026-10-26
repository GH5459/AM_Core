import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceAuthority, featureAuthority} from '../core/login-continuation-authority.js';

test('source proof identifies exact original session; changed account or reactivation cannot reuse it', async () => {
  const now = 1000000, reference = 'a'.repeat(64), session = {account: '900001', issuedAt: now - 1000, expiresAt: now + 1000}, person = {account: '900001', active: true};
  const a = sourceAuthority({readSession: async ref => ref === reference ? session : null, currentPerson: async () => person, readImportedChain: async () => null, now: () => now});
  assert.equal((await a.validate(reference)).reference, reference);
  assert.equal(await a.validate('b'.repeat(64)), null);
  person.account = '900002'; assert.equal(await a.validate(reference), null);
  person.account = '900001'; person.activatedAt = now; assert.equal(await a.validate(reference), null);
  person.activatedAt = 0; person.active = false; assert.equal(await a.validate(reference), null);
});
test('imported sessions cannot be registered as independent roots', async () => {
  const a = sourceAuthority({readSession: async () => ({account: '900001', issuedAt: 100, expiresAt: 10000}), currentPerson: async () => ({account: '900001', active: true}), readImportedChain: async () => ({token: 'private-chain'}), now: () => 1000});
  await assert.rejects(() => a.validate('a'.repeat(64)));
});
test('imported session checks its root and local current account, and never extends the root', async () => {
  const grant = {account: '900001', expiresAt: 1500};
  const a = sourceAuthority({readSession: async () => ({account: '900001', issuedAt: 100, expiresAt: 2000}), currentPerson: async () => ({account: '900001', active: true}), readImportedChain: async () => ({token: 'private-chain'}), checkImportedChain: async () => grant, now: () => 1000});
  assert.equal((await a.imported('a'.repeat(64), 'uof')).expiresAt, 1500);
  grant.account = '900002'; await assert.rejects(() => a.imported('a'.repeat(64), 'uof'));
  grant.account = '900001'; grant.expiresAt = 999; await assert.rejects(() => a.imported('a'.repeat(64), 'uof'));
});
function fixture() {
  const bot = 'U' + '1'.repeat(32), user = 'U' + '2'.repeat(32), person = {account: '900001', active: true}, mapping = {account: '900001', botUserId: bot, lineUserId: user, confirmed: true, reverseConfirmed: true};
  const identity = {account: '900001', userId: user, tenantKey: 'isolated'}, grant = {soapValid: false, attachmentsValid: false}, permissions = {dailylog: false, uof: false};
  const a = featureAuthority({botUserId: bot, currentPerson: async () => person, dailylogPermission: async () => ({enabled: permissions.dailylog}), uofPermission: async () => ({enabled: permissions.uof}), uofGrantStatus: async () => grant, confirmedLineIdentity: async () => mapping, meetingIdentity: async () => identity});
  return {a, person, mapping, identity, grant, permissions};
}
test('feature authority never grants UOF from a work-only account', async () => {
  const f = fixture(); f.permissions.dailylog = true;
  assert.equal((await f.a.dailylog('900001')).allowed, true);
  assert.equal((await f.a.uof('900001')).allowed, false);
});
test('UOF feature permission does not manufacture SOAP or attachment authorization', async () => {
  const f = fixture(); f.permissions.uof = true;
  assert.deepEqual(await f.a.uof('900001'), {allowed: true, soap: false, attachments: false});
  f.grant.soapValid = true;
  assert.deepEqual(await f.a.uof('900001'), {allowed: true, soap: true, attachments: false});
});
test('meetings require exact current two-way mapping, original bot, account and tenant', async () => {
  const f = fixture(); assert.equal((await f.a.meetings('900001')).allowed, true);
  f.mapping.reverseConfirmed = false; assert.equal((await f.a.meetings('900001')).allowed, false);
  f.mapping.reverseConfirmed = true; f.mapping.botUserId = 'U' + '3'.repeat(32); assert.equal((await f.a.meetings('900001')).allowed, false);
  f.mapping.botUserId = 'U' + '1'.repeat(32); f.identity.account = '900002'; assert.equal((await f.a.meetings('900001')).allowed, false);
  f.identity.account = '900001'; f.identity.tenantKey = ''; assert.equal((await f.a.meetings('900001')).allowed, false);
});
test('globally disabled person is rejected for all features even when feature flags remain', async () => {
  const f = fixture(); f.permissions.dailylog = f.permissions.uof = true; f.person.active = false;
  for (const name of ['dailylog', 'uof', 'meetings']) await assert.rejects(() => f.a[name]('900001'));
});

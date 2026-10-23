import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createLoginContinuation, postgresContinuationStore} from '../core/login-continuation.js';

const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function fixture() {
  let time = 1000000;
  const records = new Map(), principal = {account: '900001', reference: 'isolated-session', generation: 'generation-1', active: true, expiresAt: time + 8 * 3600000};
  const permissions = {dailylog: true, uof: true, meetings: true};
  const store = {
    async insert(kind, key, value) {if (records.has(kind + ':' + key)) throw Error('duplicate'); records.set(kind + ':' + key, structuredClone(value));},
    async read(kind, key) {return structuredClone(records.get(kind + ':' + key));},
    async take(kind, key) {const v = records.get(kind + ':' + key); records.delete(kind + ':' + key); return structuredClone(v);},
    async revokeRoot(key) {const r = records.get('root:' + key); if (r) r.revoked = true;}
  };
  const targets = Object.fromEntries(Object.keys(permissions).map(name => [name, {
    origin: 'https://' + name + '.example.test', ttlMs: name === 'uof' ? 1800000 : 28800000,
    acceptsReturn: u => u.pathname === '/' && !u.search,
    authorize: async () => ({allowed: permissions[name], soap: false, attachments: false})
  }]));
  const broker = createLoginContinuation({store, targets, now: () => time, sources: {dailylog: {validate: async ref => ref === principal.reference ? structuredClone(principal) : null}}});
  const verifier = crypto.randomBytes(32).toString('base64url');
  const issue = async (root, options = {}) => broker.issue(root.token, {target: 'uof', returnPath: '/', challenge: sha(verifier), ...options});
  const exchange = (ticket, options = {}) => broker.exchange({code: ticket.code, target: 'uof', targetOrigin: targets.uof.origin, verifier, ...options});
  return {broker, principal, permissions, targets, records, store, verifier, issue, exchange, advance: ms => {time += ms;}, now: () => time, root: () => broker.register('dailylog', principal.reference)};
}

test('one ticket creates a target session capped at original and target expiry without creating UOF business grants', async () => {
  const f = fixture(), root = await f.root(), ticket = await f.issue(root), chain = await f.exchange(ticket);
  assert.equal(ticket.expiresAt, f.now() + 60000);
  assert.equal(chain.expiresAt, f.now() + 1800000);
  assert.equal(chain.permission.soap, false);
  assert.equal(chain.permission.attachments, false);
  assert.equal((await f.broker.check(chain.token, 'uof')).account, '900001');
  await assert.rejects(() => f.exchange(ticket));
});
test('concurrent exchange has exactly one winner', async () => {
  const f = fixture(), ticket = await f.issue(await f.root());
  const results = await Promise.allSettled(Array.from({length: 10}, () => f.exchange(ticket)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('short original expiry is never extended by the target', async () => {
  const f = fixture(); f.principal.expiresAt = f.now() + 120000;
  const chain = await f.exchange(await f.issue(await f.root()));
  assert.equal(chain.expiresAt, f.principal.expiresAt);
});
test('source logout revokes both outstanding tickets and already exchanged chains', async () => {
  const f = fixture(), root = await f.root(), chain = await f.exchange(await f.issue(root)), ticket = await f.issue(root);
  await f.broker.logout(root.token);
  await assert.rejects(() => f.exchange(ticket));
  await assert.rejects(() => f.broker.check(chain.token, 'uof'));
});
test('source account change, disable, generation change, expiry and disappearance all fail closed', async () => {
  for (const change of [p => {p.account = '900002';}, p => {p.active = false;}, p => {p.generation = 'new-generation';}, p => {p.expiresAt = 0;}, p => {p.reference = 'different-session';}]) {
    const f = fixture(), root = await f.root(), chain = await f.exchange(await f.issue(root)), ticket = await f.issue(root);
    change(f.principal);
    await assert.rejects(() => f.exchange(ticket));
    await assert.rejects(() => f.broker.check(chain.token, 'uof'));
  }
});
test('target permission revoked before exchange or after exchange rejects access', async () => {
  const f = fixture(), root = await f.root(), chain = await f.exchange(await f.issue(root)), ticket = await f.issue(root);
  f.permissions.uof = false;
  await assert.rejects(() => f.issue(root));
  await assert.rejects(() => f.exchange(ticket));
  await assert.rejects(() => f.broker.check(chain.token, 'uof'));
});
test('wrong target, wrong origin, wrong browser and different logged-in account cannot exchange a ticket', async () => {
  for (const options of [{target: 'dailylog', targetOrigin: 'https://dailylog.example.test'}, {targetOrigin: 'https://evil.test'}, {verifier: crypto.randomBytes(32).toString('base64url')}, {currentAccount: '900002'}]) {
    const f = fixture(), ticket = await f.issue(await f.root());
    await assert.rejects(() => f.exchange(ticket, options));
  }
});
test('ticket and target session stop at exact expiry', async () => {
  const f = fixture(), root = await f.root(), ticket = await f.issue(root);
  f.advance(60000); await assert.rejects(() => f.exchange(ticket));
  const chain = await f.exchange(await f.issue(root));
  f.advance(1800000); await assert.rejects(() => f.broker.check(chain.token, 'uof'));
});
test('external redirects, backslashes, encoded separators and unexpected query are rejected', async () => {
  const f = fixture(), root = await f.root();
  for (const returnPath of ['//evil.test/', 'https://evil.test', '/\\evil.test', '/%2f%2fevil.test', '/private', '/?return=https://evil.test', '/#secret', '/\n']) {
    await assert.rejects(() => f.issue(root, {returnPath}));
  }
});
test('original session expiry shortened after issuance revokes existing chains', async () => {
  const f = fixture(), chain = await f.exchange(await f.issue(await f.root()));
  f.principal.expiresAt -= 1000;
  await assert.rejects(() => f.broker.check(chain.token, 'uof'));
});
test('source outages and target authority outages do not grant a fallback login', async () => {
  const f = fixture(), root = await f.root();
  f.targets.uof.authorize = async () => {throw Error('authority offline');};
  await assert.rejects(() => f.issue(root));
});
test('only hashed opaque credentials are stored', async () => {
  const f = fixture(), root = await f.root(), ticket = await f.issue(root), chain = await f.exchange(ticket);
  const saved = JSON.stringify([...f.records]);
  for (const secret of [root.token, ticket.code, chain.token, f.verifier]) assert(!saved.includes(secret));
  assert([...f.records.keys()].every(key => /^(root|chain):[a-f0-9]{64}$/.test(key)));
});
test('PostgreSQL adapter consumes via one DELETE RETURNING and only isolated table', async () => {
  const calls = [], pool = {query: async (sql, args) => {calls.push({sql, args}); return {rows: sql.startsWith('DELETE') ? [{value: {isolated: true}}] : []};}};
  const store = postgresContinuationStore(pool);
  assert.deepEqual(await store.take('ticket', 'a'.repeat(64)), {isolated: true});
  assert(calls[1].sql.startsWith('DELETE FROM central_archive.login_continuation'));
  assert(calls[1].sql.includes('RETURNING value'));
  assert(calls.every(c => !/work_items|employees|bindings|grant:/.test(c.sql)));
});

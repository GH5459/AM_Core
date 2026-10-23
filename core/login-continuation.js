import crypto from 'node:crypto';

export const LOGIN_CONTINUATION_CONTRACT = 'same-browser-login-continuation-v1';
const opaque = () => crypto.randomBytes(32).toString('base64url');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const accountPattern = /^\d{1,20}$/;
const challengePattern = /^[a-f0-9]{64}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const rejected = () => Object.assign(Error('登入接續已失效，請使用原登入入口。'), {status: 401});

// The broker accepts source proofs only from a server adapter that has checked
// the original session. Browser JSON can never supply a source principal.
// A store must atomically take a ticket; get-then-delete is not sufficient.
export function createLoginContinuation({store, sources, targets, now = Date.now, random = opaque}) {
  if (!store?.insert || !store?.take || !store?.read || !store?.revokeRoot) throw Error('login_continuation_store_required');
  for (const [name, target] of Object.entries(targets)) {
    const u = new URL(target.origin);
    if (u.protocol !== 'https:' || u.origin !== target.origin || !target.acceptsReturn || !target.authorize || !target.ttlMs) throw Error('login_continuation_target_invalid:' + name);
  }
  const targetFor = (name, path) => {
    const t = targets[name];
    if (!t || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\x00-\x20]/.test(path)) throw rejected();
    const u = new URL(path, t.origin);
    if (u.origin !== t.origin || u.hash || !t.acceptsReturn(u)) throw rejected();
    return t;
  };
  const currentRoot = async (root) => {
    if (!root || root.revoked || !accountPattern.test(root.account || '') || root.expiresAt <= now()) throw rejected();
    const source = sources[root.source];
    if (!source) throw rejected();
    const p = await source.validate(root.reference);
    // Account equality alone is insufficient: the exact original session and
    // its generation must still exist. Re-activation cannot revive old roots.
    if (!p || !p.active || p.account !== root.account || p.reference !== root.reference || p.generation !== root.generation || p.expiresAt <= now() || p.expiresAt < root.expiresAt) throw rejected();
    return root;
  };
  return {
    async register(source, reference) {
      if (!sources[source] || typeof reference !== 'string' || !reference || reference.length > 200) throw rejected();
      const p = await sources[source].validate(reference);
      if (!p || !p.active || !accountPattern.test(p.account || '') || p.reference !== reference || typeof p.generation !== 'string' || !p.generation || !Number.isSafeInteger(p.expiresAt) || p.expiresAt <= now()) throw rejected();
      const token = random(), root = {source, reference, generation: p.generation, account: p.account, expiresAt: p.expiresAt, revoked: false};
      await store.insert('root', digest(token), root);
      return {token, account: root.account, expiresAt: root.expiresAt};
    },
    async issue(rootToken, {target, returnPath, challenge}) {
      if (!tokenPattern.test(rootToken || '') || !challengePattern.test(challenge || '')) throw rejected();
      const t = targetFor(target, returnPath), rootKey = digest(rootToken), root = await currentRoot(await store.read('root', rootKey));
      const permission = await t.authorize(root.account);
      if (!permission?.allowed) throw rejected();
      const code = random(), expiresAt = Math.min(root.expiresAt, now() + 60000);
      await store.insert('ticket', digest(code), {rootKey, target, targetOrigin: t.origin, returnPath, challenge, account: root.account, expiresAt});
      return {code, expiresAt};
    },
    async exchange({code, target, targetOrigin, verifier, currentAccount = null}) {
      if (!tokenPattern.test(code || '') || !tokenPattern.test(verifier || '') || !targets[target] || targets[target].origin !== targetOrigin) throw rejected();
      // Invalid attempts consume the code too. A stolen code cannot be probed
      // repeatedly, and concurrent requests cannot both create a session.
      const ticket = await store.take('ticket', digest(code));
      if (!ticket || ticket.expiresAt <= now() || ticket.target !== target || ticket.targetOrigin !== targetOrigin || ticket.challenge !== digest(verifier) || currentAccount && currentAccount !== ticket.account) throw rejected();
      const t = targetFor(target, ticket.returnPath), root = await currentRoot(await store.read('root', ticket.rootKey));
      if (root.account !== ticket.account) throw rejected();
      const permission = await t.authorize(root.account);
      if (!permission?.allowed) throw rejected();
      const expiresAt = Math.min(root.expiresAt, now() + t.ttlMs), token = random();
      await store.insert('chain', digest(token), {rootKey: ticket.rootKey, target, account: root.account, expiresAt});
      // Permission metadata is returned by the target's own adapter. In
      // particular a company identity does not manufacture a UOF SOAP token.
      return {token, account: root.account, expiresAt, returnPath: ticket.returnPath, permission};
    },
    async check(token, target) {
      if (!tokenPattern.test(token || '') || !targets[target]) throw rejected();
      const chain = await store.read('chain', digest(token));
      if (!chain || chain.target !== target || chain.expiresAt <= now()) throw rejected();
      const root = await currentRoot(await store.read('root', chain.rootKey));
      if (chain.account !== root.account) throw rejected();
      const permission = await targets[target].authorize(root.account);
      if (!permission?.allowed) throw rejected();
      return {account: chain.account, expiresAt: Math.min(chain.expiresAt, root.expiresAt), permission};
    },
    async logout(rootToken) {
      if (!tokenPattern.test(rootToken || '')) throw rejected();
      await store.revokeRoot(digest(rootToken));
      return {ok: true};
    }
  };
}

// Isolated table: no employee, task, binding, grant or session rows are changed.
export function postgresContinuationStore(pool) {
  let ready;
  const ensure = () => ready ||= pool.query(`CREATE TABLE IF NOT EXISTS central_archive.login_continuation (
    kind text NOT NULL CHECK (kind IN ('root','ticket','chain')),
    key text NOT NULL CHECK (length(key)=64), value jsonb NOT NULL,
    expires_at bigint NOT NULL, PRIMARY KEY(kind,key))`).catch(e => {ready = null; throw e;});
  return {
    async insert(kind, key, value) {
      await ensure();
      await pool.query('INSERT INTO central_archive.login_continuation(kind,key,value,expires_at) VALUES($1,$2,$3::jsonb,$4)', [kind, key, JSON.stringify(value), value.expiresAt]);
    },
    async read(kind, key) {
      await ensure();
      return (await pool.query('SELECT value FROM central_archive.login_continuation WHERE kind=$1 AND key=$2', [kind, key])).rows[0]?.value || null;
    },
    async take(kind, key) {
      await ensure();
      return (await pool.query('DELETE FROM central_archive.login_continuation WHERE kind=$1 AND key=$2 RETURNING value', [kind, key])).rows[0]?.value || null;
    },
    async revokeRoot(key) {
      await ensure();
      await pool.query("UPDATE central_archive.login_continuation SET value=jsonb_set(value,'{revoked}','true') WHERE kind='root' AND key=$1", [key]);
    }
  };
}

// Adapters deliberately expose no password, SOAP token, attachment cookie or
// original browser cookie to the broker. Session lookup is server-to-server.
const denied = () => Object.assign(Error('原登入或使用資格已失效。'), {status: 401});
const accountPattern = /^\d{1,20}$/;
const linePattern = /^U[a-f0-9]{32}$/i;

export function sourceAuthority({readSession, currentPerson, readImportedChain, checkImportedChain, now = Date.now}) {
  return {
    async validate(reference) {
      if (typeof reference !== 'string' || !/^[a-f0-9]{64}$/.test(reference)) throw denied();
      const session = await readSession(reference);
      if (!session || !accountPattern.test(session.account || '') || session.expiresAt <= now() || !session.issuedAt) return null;
      // Registering an imported session as a fresh root would create a cycle
      // and accidentally extend its authority. Imported sessions must keep the
      // original chain rather than becoming a new independent source.
      if (await readImportedChain(reference)) throw denied();
      const person = await currentPerson(session.account);
      if (!person?.active || person.account !== session.account || person.activatedAt && session.issuedAt < person.activatedAt) return null;
      return {account: session.account, reference, generation: String(session.issuedAt), active: true, expiresAt: session.expiresAt};
    },
    async imported(reference, target) {
      const session = await readSession(reference), imported = await readImportedChain(reference);
      if (!session || !imported || session.expiresAt <= now()) throw denied();
      const grant = await checkImportedChain(imported.token, target);
      if (grant.account !== session.account || grant.expiresAt <= now()) throw denied();
      const person = await currentPerson(session.account);
      if (!person?.active || person.account !== session.account || person.activatedAt && session.issuedAt < person.activatedAt) throw denied();
      return {account: session.account, expiresAt: Math.min(session.expiresAt, grant.expiresAt), chainToken: imported.token};
    }
  };
}

export function featureAuthority({currentPerson, dailylogPermission, uofPermission, uofGrantStatus, confirmedLineIdentity, meetingIdentity, botUserId}) {
  const person = async account => {
    if (!accountPattern.test(account || '')) throw denied();
    const p = await currentPerson(account);
    if (!p?.active || p.account !== account) throw denied();
    return p;
  };
  return {
    async dailylog(account) {
      await person(account);
      const p = await dailylogPermission(account);
      return {allowed: p?.enabled === true || p?.hrEnabled === true || p?.admin === true};
    },
    async uof(account) {
      await person(account);
      const p = await uofPermission(account);
      if (!p?.enabled) return {allowed: false};
      // Absence of a grant is a visible need for original verification, never
      // a reason to make or recover a SOAP token using another identity.
      const grant = await uofGrantStatus(account);
      return {allowed: true, soap: grant?.soapValid === true, attachments: grant?.attachmentsValid === true};
    },
    async meetings(account) {
      await person(account);
      if (!linePattern.test(botUserId || '')) throw denied();
      const mapping = await confirmedLineIdentity(account, botUserId);
      if (!mapping || mapping.account !== account || mapping.botUserId !== botUserId || !mapping.confirmed || !mapping.reverseConfirmed || !linePattern.test(mapping.lineUserId || '')) return {allowed: false};
      const identity = await meetingIdentity(mapping.lineUserId);
      if (!identity || identity.account !== account || identity.userId !== mapping.lineUserId || !identity.tenantKey) return {allowed: false};
      // This identifies a person only. Each original meeting route must still
      // apply membership, named-reader, shared-publication and action checks.
      return {allowed: true, userId: mapping.lineUserId, tenantKey: identity.tenantKey};
    }
  };
}

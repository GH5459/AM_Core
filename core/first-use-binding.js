// A decision only: callers must supply server-verified identity and UOF gateway
// results. This module never creates a session or changes feature permissions.
const lineId = value => typeof value === 'string' && /^U[a-f0-9]{32}$/i.test(value);
const accountId = value => typeof value === 'string' && /^\d{1,20}$/.test(value);

export function firstUseBindingDecision({account, identity, binding, permission, onboardingEligible = false, available = true}) {
  if (!accountId(account) || (permission !== true && onboardingEligible !== true)) return {state: 'not-authorized'};
  if (!available) return {state: 'retry'};
  if (!identity || !binding) return {state: 'bind'};
  if (identity.conflict === true || identity.confirmed !== true || identity.account !== account || !lineId(identity.lineUserId)) {
    return {state: 'review'};
  }
  if (binding.status !== 'bound') return {state: 'bind'};
  if (binding.account !== account || binding.lineUserId !== identity.lineUserId || binding.groupId !== binding.lineUserId || !binding.bindingId) {
    return {state: 'review'};
  }
  return permission === true ? {state: 'continue'} : {state: 'await-permission'};
}

// Only same-origin paths may be retained across the onboarding flow.
export function safeFirstUseReturn(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://return.invalid');
    if (url.origin !== 'https://return.invalid' || url.username || url.password) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

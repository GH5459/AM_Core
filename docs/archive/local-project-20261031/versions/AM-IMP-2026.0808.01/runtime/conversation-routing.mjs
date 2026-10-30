import crypto from 'node:crypto';

export const CONVERSATION_TYPES = Object.freeze(['direct', 'group', 'room']);

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export function sourceConversation(source = {}) {
  const type = String(source.type || '').trim();
  if (!CONVERSATION_TYPES.includes(type)) throw new Error(`Unsupported LINE source type: ${type || '(empty)'}.`);
  const field = type === 'direct' ? 'userId' : type === 'group' ? 'groupId' : 'roomId';
  return { type, externalKey: required(source[field], `source.${field}`) };
}

export function keyedHash(value, secret) {
  return crypto.createHmac('sha256', required(secret, 'hashSecret')).update(required(value, 'hash input')).digest('hex');
}

export function platformConversationDescriptor({ source, lineConnectionId, hashSecret, now = new Date() }) {
  const connectionId = required(lineConnectionId, 'lineConnectionId');
  const resolved = sourceConversation(source);
  const externalConversationKeyHash = keyedHash(`${connectionId}\u0000${resolved.type}\u0000${resolved.externalKey}`, hashSecret);
  const platformConversationId = `pcv_${keyedHash(`platform\u0000${connectionId}\u0000${resolved.type}\u0000${externalConversationKeyHash}`, hashSecret).slice(0, 32)}`;
  return {
    platformConversationId,
    lineConnectionId: connectionId,
    conversationType: resolved.type,
    externalConversationKeyHash,
    firstSeenAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    _externalKey: resolved.externalKey,
  };
}

export function isBindingCode(text) {
  return /^\s*\d{6}\s*$/.test(String(text || ''));
}

export function isWorkspaceCommand(text) {
  return /^\s*(切換工作區|選擇工作區|解除綁定|撤銷綁定)(?:\s|$)/u.test(String(text || ''));
}

export function isGroupOnboardingCommand(text) {
  return /^\s*(綁定群組|群組綁定|設定群組)(?:\s|$)/u.test(String(text || ''));
}

export function classifyPreRouteCommand(event) {
  const text = event?.message?.type === 'text' ? String(event.message.text || '') : '';
  if (isBindingCode(text)) return 'binding-code';
  if (isWorkspaceCommand(text)) return 'workspace-command';
  if (isGroupOnboardingCommand(text)) return 'group-onboarding';
  return '';
}

function activeBinding(binding, now) {
  if (!binding || binding.status !== 'active') return false;
  const at = new Date(now).getTime();
  const start = binding.startsAt ? new Date(binding.startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const end = binding.endsAt ? new Date(binding.endsAt).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(at) && at >= start && at < end;
}

function publicDescriptor(descriptor) {
  const { _externalKey, ...safe } = descriptor;
  return safe;
}

export async function resolveConversationRoute({
  event,
  lineConnectionId,
  hashSecret,
  registry,
  resolveDirectRoute,
  resolveGroupRoute,
  now = new Date(),
}) {
  if (!event?.source) throw new Error('LINE event source is required.');
  const descriptor = platformConversationDescriptor({ source: event.source, lineConnectionId, hashSecret, now });
  const safeDescriptor = publicDescriptor(descriptor);
  await registry?.upsertPlatformConversation?.({ ...safeDescriptor, lastEventType: event?.message?.type || event?.type || 'unknown' });

  const preRouteCommand = classifyPreRouteCommand(event);
  let resolved = null;
  if (descriptor.conversationType === 'direct') {
    resolved = await resolveDirectRoute?.({
      lineConnectionId: descriptor.lineConnectionId,
      externalIdentityHash: keyedHash(`${descriptor.lineConnectionId}\u0000user\u0000${descriptor._externalKey}`, hashSecret),
      platformConversation: safeDescriptor,
      event,
    });
  } else {
    resolved = await resolveGroupRoute?.({
      lineConnectionId: descriptor.lineConnectionId,
      conversationType: descriptor.conversationType,
      externalConversationKeyHash: descriptor.externalConversationKeyHash,
      externalKey: descriptor._externalKey,
      platformConversation: safeDescriptor,
      event,
    });
  }

  if (!resolved?.tenant || !activeBinding(resolved.bindingPeriod, now)) {
    await registry?.recordRouteAudit?.({
      platformConversationId: descriptor.platformConversationId,
      result: preRouteCommand ? 'pre-route-command' : 'unbound',
      reason: resolved?.reason || 'no-active-binding',
      at: new Date(now).toISOString(),
    });
    return {
      tenant: null,
      binding: null,
      bindingPeriod: null,
      actorContext: resolved?.actorContext || null,
      platformConversation: safeDescriptor,
      preRouteCommand,
      routeAuditId: null,
      reason: resolved?.reason || 'no-active-binding',
    };
  }

  const tenantKey = required(resolved.tenant.key, 'tenant.key');
  const bindingPeriodId = required(resolved.bindingPeriod.id, 'bindingPeriod.id');
  const tenantConversationLookupKey = `tcv_${keyedHash(`${tenantKey}\u0000${descriptor.platformConversationId}\u0000${bindingPeriodId}`, hashSecret).slice(0, 32)}`;
  const routeAuditId = await registry?.recordRouteAudit?.({
    platformConversationId: descriptor.platformConversationId,
    tenantKey,
    bindingPeriodId,
    result: 'routed',
    at: new Date(now).toISOString(),
  }) || `audit_${keyedHash(`${tenantConversationLookupKey}\u0000${new Date(now).toISOString()}`, hashSecret).slice(0, 24)}`;

  return {
    tenant: resolved.tenant,
    binding: resolved.binding || null,
    bindingPeriod: resolved.bindingPeriod,
    actorContext: resolved.actorContext || null,
    platformConversation: safeDescriptor,
    tenantConversationLookupKey,
    preRouteCommand,
    routeAuditId,
    reason: 'routed',
  };
}

export function assertTenantRoute(route, expectedTenantKey) {
  if (!route?.tenant?.key) throw new Error('No routed tenant.');
  if (route.tenant.key !== expectedTenantKey) {
    throw new Error(`Cross-tenant access blocked: route belongs to ${route.tenant.key}, not ${expectedTenantKey}.`);
  }
  return true;
}

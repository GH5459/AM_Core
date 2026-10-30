import crypto from 'node:crypto';
import { assertTenantRoute } from './conversation-routing.mjs';

const COMMAND_PATTERNS = [
  /^\s*(查待辦|列出(?:今天|今日)的?待辦|打開第\s*\d+\s*個任務|看一下目前任務)\s*$/u,
  /^\s*(我的今日|我的行事曆|昨日未完成|身份設定)\s*$/u,
];

export function isSystemOperationCommand(text) {
  return COMMAND_PATTERNS.some((pattern) => pattern.test(String(text || '')));
}

function iso(value) {
  return new Date(value || Date.now()).toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function messageIdempotencyKey({ lineConnectionId, messageId, direction = 'incoming', fallbackSeed = '' }) {
  const stableId = String(messageId || '').trim() || `generated:${digest(fallbackSeed)}`;
  return `msg_${digest(`${lineConnectionId}\u0000${stableId}\u0000${direction}`)}`;
}

export function conversationTypeLabel(type) {
  return { direct: '個人', group: '群組', room: '聊天室' }[type] || type;
}

export async function storeConversationEvent({
  route,
  event,
  repository,
  direction = 'incoming',
  displayName = '',
  senderName = '',
  flags = {},
}) {
  if (!flags.lineConversationStorageEnabled) return { skipped: true, reason: 'feature-disabled' };
  if (!route?.tenant?.key) return { skipped: true, reason: 'unbound' };
  assertTenantRoute(route, repository.tenantKey);
  if (!repository.dataSources?.conversations || !repository.dataSources?.messages) {
    throw new Error(`Conversation storage is enabled for ${repository.tenantKey}, but conversations/messages data sources are incomplete.`);
  }

  const message = event?.message || {};
  const occurredAt = iso(event?.timestamp);
  const type = route.platformConversation.conversationType;
  let conversation = await repository.findConversationByLookupKey(route.tenantConversationLookupKey);
  if (!conversation) {
    conversation = await repository.createConversation({
      lookupKey: route.tenantConversationLookupKey,
      tenantConversationId: route.tenantConversationLookupKey,
      platformConversationId: route.platformConversation.platformConversationId,
      lineConnectionId: route.platformConversation.lineConnectionId,
      conversationType: type,
      conversationTypeLabel: conversationTypeLabel(type),
      displayName: displayName || `${conversationTypeLabel(type)}對話`,
      bindingStatus: '啟用',
      bindingPeriodId: route.bindingPeriod.id,
      bindingStartedAt: route.bindingPeriod.startsAt,
      bindingEndedAt: route.bindingPeriod.endsAt || null,
      privacyLevel: type === 'direct' ? '私人' : '租戶群組',
      taskJudgmentStatus: '待判斷',
      lastMessageAt: occurredAt,
    });
  }

  const idempotencyKey = messageIdempotencyKey({
    lineConnectionId: route.platformConversation.lineConnectionId,
    messageId: message.id,
    direction,
    fallbackSeed: `${route.routeAuditId}\u0000${occurredAt}\u0000${message.type}\u0000${message.text || ''}`,
  });
  const duplicate = await repository.findMessageByIdempotencyKey(idempotencyKey);
  if (duplicate) return { skipped: false, duplicate: true, conversation, message: duplicate };

  const systemOperationCommand = message.type === 'text' && isSystemOperationCommand(message.text);
  const storedMessage = await repository.createMessage({
    idempotencyKey,
    tenantConversationId: conversation.id,
    lineMessageId: String(message.id || idempotencyKey),
    direction,
    occurredAt,
    senderName: senderName || (direction === 'outgoing' ? 'AM Assistant' : '未知發送者'),
    messageType: String(message.type || 'text'),
    content: message.type === 'text' ? String(message.text || '') : String(message.fileName || ''),
    routeAuditId: route.routeAuditId,
    systemOperationCommand,
    taskEligible: !systemOperationCommand,
    bindingPageId: route.binding?.pageId || null,
  });

  let projectionPending = false;
  try {
    await repository.appendConversationProjection(conversation.id, storedMessage);
  } catch (error) {
    projectionPending = true;
    await repository.enqueueProjectionRepair({
      tenantConversationId: conversation.id,
      messageId: storedMessage.id,
      idempotencyKey,
      error: error.message,
    });
  }

  await repository.updateConversation(conversation.id, {
    lastMessageAt: occurredAt,
    lastMessageId: storedMessage.id,
    taskJudgmentStatus: systemOperationCommand ? conversation.taskJudgmentStatus : '待判斷',
  });

  if (['group', 'room'].includes(type) && event?.source?.userId) {
    await repository.upsertConversationMember?.({
      tenantConversationId: conversation.id,
      platformConversationId: route.platformConversation.platformConversationId,
      externalMemberIdentityHash: digest(`${route.platformConversation.lineConnectionId}\u0000${event.source.userId}`),
      displayName: senderName || '未知成員',
      status: '啟用',
      source: 'Webhook observed',
      observedAt: occurredAt,
    });
  }

  return { skipped: false, duplicate: false, projectionPending, conversation, message: storedMessage };
}

export async function repairConversationProjections(repository, { limit = 100 } = {}) {
  const pending = await repository.listProjectionRepairs(limit);
  const results = [];
  for (const item of pending) {
    try {
      const message = await repository.getMessage(item.messageId);
      if (!message) throw new Error('message-not-found');
      await repository.appendConversationProjection(item.tenantConversationId, message);
      await repository.completeProjectionRepair(item.id);
      results.push({ id: item.id, repaired: true });
    } catch (error) {
      await repository.failProjectionRepair(item.id, error.message);
      results.push({ id: item.id, repaired: false, error: error.message });
    }
  }
  return results;
}

export async function recentConversationContext(repository, conversationId, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer from 1 to 100.');
  return repository.listConversationMessages(conversationId, limit);
}

export class InMemoryTenantConversationRepository {
  constructor({ tenantKey, dataSources = { conversations: 'local-conversations', messages: 'local-messages' } }) {
    this.tenantKey = tenantKey;
    this.dataSources = dataSources;
    this.conversations = new Map();
    this.lookup = new Map();
    this.messages = new Map();
    this.messageKeys = new Map();
    this.projections = new Map();
    this.repairs = new Map();
    this.members = new Map();
    this.failNextProjection = false;
  }

  async findConversationByLookupKey(key) { return this.lookup.get(key) || null; }
  async createConversation(value) {
    const row = { id: `conversation-${this.conversations.size + 1}`, ...value };
    this.conversations.set(row.id, row);
    this.lookup.set(value.lookupKey, row);
    this.projections.set(row.id, []);
    return row;
  }
  async findMessageByIdempotencyKey(key) { return this.messageKeys.get(key) || null; }
  async createMessage(value) {
    const row = { id: `message-${this.messages.size + 1}`, ...value };
    this.messages.set(row.id, row);
    this.messageKeys.set(value.idempotencyKey, row);
    return row;
  }
  async appendConversationProjection(conversationId, message) {
    if (this.failNextProjection) { this.failNextProjection = false; throw new Error('simulated-projection-failure'); }
    const rows = this.projections.get(conversationId);
    if (!rows) throw new Error('conversation-not-found');
    if (!rows.some((row) => row.idempotencyKey === message.idempotencyKey)) rows.push(message);
  }
  async enqueueProjectionRepair(value) {
    const row = { id: `repair-${this.repairs.size + 1}`, status: 'pending', attempts: 0, ...value };
    this.repairs.set(row.id, row);
    return row;
  }
  async listProjectionRepairs(limit) { return [...this.repairs.values()].filter((r) => r.status !== 'done').slice(0, limit); }
  async getMessage(id) { return this.messages.get(id) || null; }
  async completeProjectionRepair(id) { Object.assign(this.repairs.get(id), { status: 'done' }); }
  async failProjectionRepair(id, error) {
    const row = this.repairs.get(id); Object.assign(row, { status: 'pending', attempts: row.attempts + 1, error });
  }
  async updateConversation(id, patch) { Object.assign(this.conversations.get(id), patch); return this.conversations.get(id); }
  async upsertConversationMember(value) {
    const key = `${value.tenantConversationId}:${value.externalMemberIdentityHash}`;
    const existing = this.members.get(key) || { firstSeenAt: value.observedAt };
    this.members.set(key, { ...existing, ...value, lastSeenAt: value.observedAt });
  }
  async listConversationMessages(conversationId, limit) {
    return [...this.messages.values()]
      .filter((message) => message.tenantConversationId === conversationId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(-limit);
  }
}

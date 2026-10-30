import assert from 'node:assert/strict';

const sample = {
  packageVersion: 'AM-IMP-2026.0808.01',
  projectKey: 'SAMPLE_AM',
  envPrefix: 'SAMPLE',
  installationMode: 'contract-installed-flags-off',
  dataSources: {
    conversations: 'SAMPLE_CONVERSATIONS_DATA_SOURCE_ID',
    messages: 'SAMPLE_MESSAGES_DATA_SOURCE_ID',
    attachments: 'SAMPLE_ATTACHMENTS_DATA_SOURCE_ID',
    conversationMembers: 'SAMPLE_LINE_GROUP_MEMBER_INDEX_DATA_SOURCE_ID',
  },
  platformReferences: {
    lineConnectionId: 'SAMPLE_LINE_CONNECTION_ID',
    conversationHashSecret: 'SAMPLE_CONVERSATION_HASH_SECRET',
  },
  featureFlags: {
    'lineConversationRegistry.enabled': false,
    'lineConversationStorage.enabled': false,
    'lineConversationDirectCapture.enabled': false,
    'lineConversationDualWrite.enabled': false,
    lineConversationReadSource: 'legacy',
    'lineConversationProjectionRepair.enabled': false,
  },
};

const requiredEnv = [
  'NOTION_TOKEN',
  ...Object.values(sample.dataSources),
  ...Object.values(sample.platformReferences),
];

assert.equal(sample.featureFlags['lineConversationStorage.enabled'], false);
assert.equal(sample.featureFlags.lineConversationReadSource, 'legacy');
assert.equal(requiredEnv.length, 7);
assert.ok(requiredEnv.every((name) => /^[A-Z0-9_]+$/.test(name)));

console.log(JSON.stringify({ ok: true, requiredEnv }, null, 2));

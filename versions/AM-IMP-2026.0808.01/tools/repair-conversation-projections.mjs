import fs from 'node:fs';
import path from 'node:path';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') out.input = argv[++i];
    else if (argv[i] === '--output') out.output = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!out.input) throw new Error('Usage: node repair-conversation-projections.mjs --input <state.json> [--output <repair-plan.json>]');
  return out;
}

const options = args(process.argv.slice(2));
const inputPath = path.resolve(options.input);
const state = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const messagesByConversation = new Map();
for (const message of state.messages || []) {
  if (!message.tenantConversationId || !message.idempotencyKey) continue;
  if (!messagesByConversation.has(message.tenantConversationId)) messagesByConversation.set(message.tenantConversationId, []);
  messagesByConversation.get(message.tenantConversationId).push(message);
}

const repairs = [];
for (const conversation of state.conversations || []) {
  const projected = new Set((conversation.projectedIdempotencyKeys || []).map(String));
  const missing = (messagesByConversation.get(conversation.id) || [])
    .filter((message) => !projected.has(String(message.idempotencyKey)))
    .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')))
    .map((message) => ({ messageId: message.id, idempotencyKey: message.idempotencyKey, occurredAt: message.occurredAt }));
  if (missing.length) repairs.push({ tenantConversationId: conversation.id, appendInOrder: missing });
}

const plan = {
  input: inputPath,
  repairCount: repairs.reduce((sum, item) => sum + item.appendInOrder.length, 0),
  repairs,
  safeguards: {
    createsMessages: false,
    deletesBlocks: false,
    idempotencyRequired: true,
    projectLocalAdapterRequiredForWrites: true,
  },
};
if (options.output) fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(plan, null, 2));

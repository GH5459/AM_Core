import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.input) throw new Error('Usage: node backfill-conversations.mjs --input <export.json> [--output <plan.json>] [--apply]');
  return args;
}

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stableGroupKey(row) {
  if (!row.tenantKey || !row.lineConnectionId || !['direct', 'group', 'room'].includes(row.sourceType) || !row.externalKeyHash) return '';
  return [row.tenantKey, row.lineConnectionId, row.sourceType, row.externalKeyHash].join('\u0000');
}

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const groups = new Map();
const manualReview = [];

for (const row of input.messages || []) {
  const key = stableGroupKey(row);
  if (!key) {
    manualReview.push({ messageId: row.messageId || '', reason: 'missing-verifiable-source-key' });
    continue;
  }
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const conversations = [];
const messageAssignments = [];
for (const [key, rows] of groups) {
  rows.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const [tenantKey, lineConnectionId, sourceType, externalKeyHash] = key.split('\u0000');
  const tenantConversationId = `tcv_backfill_${hash(key).slice(0, 24)}`;
  conversations.push({
    tenantKey,
    tenantConversationId,
    platformConversationId: `pcv_backfill_${hash(`${lineConnectionId}\u0000${sourceType}\u0000${externalKeyHash}`).slice(0, 24)}`,
    lineConnectionId,
    sourceType,
    externalKeyHash,
    firstMessageAt: rows[0]?.timestamp || null,
    lastMessageAt: rows.at(-1)?.timestamp || null,
    messageCount: rows.length,
  });
  for (const row of rows) messageAssignments.push({ messageId: row.messageId, tenantConversationId });
}

const plan = {
  mode: args.apply ? 'apply-plan' : 'dry-run',
  input: inputPath,
  conversations,
  messageAssignments,
  manualReview,
  safeguards: {
    guessedByDisplayName: false,
    deletesOrMovesExistingData: false,
    writesProductionSystems: false,
  },
};

if (args.apply && !args.output) throw new Error('--apply requires --output. This reference tool only writes an auditable JSON plan; a project-local adapter must perform Notion writes.');
if (args.output) fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(plan, null, 2));

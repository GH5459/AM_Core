import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageIds = [
  'AM-IMP-2026.0807.03',
  'AM-IMP-2026.0807.04',
  'AM-IMP-2026.0807.05',
  'AM-IMP-2026.0807.06'
];

const requiredPackageFiles = ['README.md', 'upgrade.json', 'INSTALL.md', 'VERIFY.md', 'ROLLBACK.md'];
const forbiddenPatterns = [
  /refresh[_ -]?token\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/i,
  /channel[_ -]?secret\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/i,
  /machine[_ -]?token\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/i,
  /line[_ -]?user[_ -]?id\s*[:=]\s*["']?U[0-9a-f]{20,}/i
];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

for (const packageId of packageIds) {
  const dir = path.join(root, 'versions', packageId);
  assert(fs.existsSync(dir), `Missing package directory: ${packageId}`);
  for (const file of requiredPackageFiles) {
    assert(fs.existsSync(path.join(dir, file)), `Missing ${packageId}/${file}`);
  }

  const metadata = JSON.parse(read(path.join(dir, 'upgrade.json')));
  assert(metadata.id === packageId, `upgrade.json id mismatch for ${packageId}`);
  assert(metadata.status === 'Ready', `${packageId} must remain Ready until project-local install/proof`);
  assert(metadata.dataIsolation?.canCopySecrets === false, `${packageId} must forbid copying secrets`);

  const packageText = walkFiles(dir).map(read).join('\n');
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(packageText), `${packageId} appears to contain a forbidden secret or raw LINE identifier`);
  }
}

const adr = path.join(root, 'docs', 'm0', 'AM_PLATFORM_STANDARDIZATION_M0_ADR_2026-08-07.md');
const ledger = path.join(root, 'docs', 'm0', 'AM_PLATFORM_STANDARDIZATION_BLOCKER_LEDGER_2026-08-07.md');
const cards = path.join(root, 'docs', 'work-cards', 'AM_PLATFORM_STANDARDIZATION_AGENT_WORK_CARDS_2026-08-07.md');

assert(fs.existsSync(adr), 'Missing M0 ADR');
assert(fs.existsSync(ledger), 'Missing blocker ledger');
assert(fs.existsSync(cards), 'Missing work cards');

console.log('AM Platform standardization package set is internally complete.');

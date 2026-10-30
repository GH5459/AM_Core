import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(packageRoot, '..', '..');
const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'upgrade.json'), 'utf8'));
assert.equal(metadata.contract, 'line-quoted-image-signed-download-v1');
assert.ok(fs.existsSync(path.join(packageRoot, 'runtime/attachment-delivery.js')));
// Exercise the reviewed native helper without requiring this older template
// checkout to have the production 1004.07 retrieval/central archive baseline.
const result = spawnSync(process.execPath, ['--test', path.join(packageRoot, 'reference-tests/test-attachment-delivery.mjs')], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

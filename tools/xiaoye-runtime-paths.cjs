const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

function appToolsDirectory(configured) {
  if (typeof configured !== 'string' || path.basename(path.dirname(configured)).toLowerCase() !== 'codex-app-tools') throw Error('Invalid Codex app tools directory');
  if (fs.existsSync(path.join(configured, 'server.mjs')) && fs.existsSync(path.join(configured, 'scripts', 'launch_codex_app_tools_mcp.cmd'))) return configured;
  const base = path.dirname(configured);
  const candidates = fs.readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(base, entry.name))
    .filter(folder => fs.existsSync(path.join(folder, 'server.mjs')) && fs.existsSync(path.join(folder, 'scripts', 'launch_codex_app_tools_mcp.cmd')))
    .sort((a,b) => path.basename(b).localeCompare(path.basename(a), undefined, { numeric: true }));
  if (!candidates.length) throw Error('Codex app tools installation unavailable');
  return candidates[0];
}

function codexExecutable(configured, { localAppData = process.env.LOCALAPPDATA, locate = () => cp.spawnSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }) } = {}) {
  if (configured && fs.existsSync(configured)) return configured;
  if (!localAppData) throw Error('Codex installation directory unavailable');
  const trusted = path.resolve(localAppData, 'OpenAI', 'Codex', 'bin').toLowerCase() + path.sep;
  const result = locate();
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const file = line.trim();
    if (path.basename(file).toLowerCase() === 'codex.exe' && path.resolve(file).toLowerCase().startsWith(trusted) && fs.existsSync(file)) return file;
  }
  throw Error('Codex executable unavailable');
}

module.exports = { appToolsDirectory, codexExecutable };

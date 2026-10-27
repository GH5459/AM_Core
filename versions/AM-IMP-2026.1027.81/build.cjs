'use strict';
// Patch only the reviewed permission function in a freshly downloaded Worker.
function patchWorker(source) {
  const start = source.indexOf('function taskCanEdit(');
  const end = source.indexOf('function taskCanCreateChild(', start);
  if (start < 0 || end < 0 || source.indexOf('function taskCanEdit(', start + 1) !== -1) throw Error('Unexpected task permission function');
  const original = source.slice(start, end);
  const anchor = '  const invited = contexts.get(t)?.invited || [];';
  if (original.split(anchor).length !== 2 || !original.includes('if (invited.includes(account2)) return creator(t) === account2;')) throw Error('Task permission rule has changed; review latest source');
  if (original.includes('t.lead?.account === account2) return true;')) throw Error('Assignee permission fix already present');
  const fixed = original.replace(anchor, '  // Direct responsibility survives inherited project viewing restrictions.\n  if (t.lead?.account === account2) return true;\n' + anchor);
  return source.slice(0, start) + fixed + source.slice(end);
}
module.exports = {patchWorker};

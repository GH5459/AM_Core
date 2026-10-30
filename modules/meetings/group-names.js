// Resolve names only for the existing OA's known groups. Fail closed to the
// saved label, without changing identity, membership, or historical records.
export async function currentGroupNames(rows, platform) {
  const result = new Map();
  const groups = rows.filter(r => r.source_kind === 'group' && /^C[0-9a-f]{32}$/i.test(r.source_id || '') && !['left', 'blocked'].includes(r.connection_state));
  let next = 0;
  async function worker() {
    while (next < groups.length) {
      const row = groups[next++];
      try {
        const summary = await platform.lineGet(`/v2/bot/group/${encodeURIComponent(row.source_id)}/summary`, {timeoutMs: 3000});
        const name = typeof summary?.groupName === 'string' ? summary.groupName.trim() : '';
        if (summary?.groupId === row.source_id && name) result.set(row.key, name);
      } catch { /* Keep the saved name when LINE cannot confirm it. */ }
    }
  }
  await Promise.all(Array.from({length: Math.min(10, groups.length)}, worker));
  return result;
}

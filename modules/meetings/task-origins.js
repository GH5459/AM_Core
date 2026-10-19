// Server-to-server metadata only. The caller selects sources from tasks that
// have already passed its current task permissions; this is not a member API.
export const TASK_ORIGINS_CONTRACT = 'dailylog-task-origins-v1';

export async function readTaskOrigins(input, {pool, botId}) {
  const valid = (list, pattern) => Array.isArray(list) && list.length <= 80
    && new Set(list).size === list.length && list.every(v => typeof v === 'string' && pattern.test(v));
  if (!input || Object.keys(input).some(k => !['contract', 'meetingIds', 'groupIds'].includes(k))
    || input.contract !== TASK_ORIGINS_CONTRACT
    || !valid(input.meetingIds, /^[a-f0-9]{64}$/)
    || !valid(input.groupIds, /^C[a-f0-9]{32}$/i)
    || input.meetingIds.length + input.groupIds.length > 80) {
    throw Object.assign(Error('來源查詢格式不正確。'), {status: 400});
  }
  const [meetings, groups] = await Promise.all([
    input.meetingIds.length ? pool.query(`SELECT w.id,w.fields->'settings'->>'topic' AS title,
      w.fields->'settings'->>'date' AS date,
      CASE WHEN c.source_kind='group' THEN c.display_name ELSE '' END AS group_name
      FROM central_archive.meeting_workspaces w
      JOIN central_archive.conversations c ON c.key=w.conversation_key
      WHERE c.bot_id=$1 AND w.state='published' AND w.id=ANY($2::text[])`, [botId, input.meetingIds]) : {rows: []},
    input.groupIds.length ? pool.query(`SELECT source_id AS id,display_name AS name
      FROM central_archive.conversations
      WHERE bot_id=$1 AND source_kind='group' AND source_id=ANY($2::text[])`, [botId, input.groupIds]) : {rows: []}
  ]);
  const text = v => typeof v === 'string' ? v.trim().slice(0, 200) : '';
  return {contract: TASK_ORIGINS_CONTRACT,
    meetings: meetings.rows.map(r => ({id: r.id, title: text(r.title), date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : '', groupName: text(r.group_name)})),
    groups: groups.rows.map(r => ({id: r.id, name: text(r.name)}))};
}

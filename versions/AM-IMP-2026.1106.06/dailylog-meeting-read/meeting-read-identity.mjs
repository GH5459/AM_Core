import {readTaskIdentity} from './task-read-identity.mjs';

// Inspect a bounded copy. This is only an optimization selector, never an authority.
export async function isMeetingListRead(request) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/meetings/review/hub/api') return false;
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type') || '')) return false;
  const limit = 32768, length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) return false;
  let reader;
  try {
    reader = request.clone().body?.getReader();
    if (!reader) return false;
    const chunks = []; let size = 0;
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { reader.cancel().catch(() => {}); return false; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value) && value.action === 'list';
  } catch { return false; }
  finally { reader?.releaseLock(); }
}

export async function meetingSession(inner, request, env, ctx, narrow) {
  if (narrow) {
    const {response, auth} = await readTaskIdentity(inner, request, env, ctx);
    return {response, session: auth};
  }
  const response = await inner.fetch(new Request(new URL('/api/auth/session', request.url), {
    headers: {Cookie: request.headers.get('Cookie') || ''}
  }), env, ctx);
  return {response, session: await response.json()};
}

const upstreamNames = new Set(['meeting_embedded', 'meeting_auth', 'meeting_inventory', 'meeting_view', 'meeting_related', 'meeting_total']);
const localNames = new Set(['dailylog_meeting_identity', 'dailylog_meeting_binding', 'dailylog_meeting_upstream']);
export function meetingReadTiming(enabled, now = () => performance.now()) {
  if (!enabled) return null;
  const started = now(); let previous = started;
  const stages = [];
  const metric = (name, value) => Number.isFinite(value) && value >= 0 ? name + ';dur=' + value.toFixed(1) : null;
  return {
    mark(name) {
      const current = now();
      if (localNames.has(name)) { const value = metric(name, current - previous); if (value) stages.push(value); }
      previous = current;
    },
    header(upstream) {
      const values = [...stages], seen = new Set();
      for (const part of String(upstream || '').split(',')) {
        const match = /^\s*([a-z_]+)\s*;\s*dur\s*=\s*(\d+(?:\.\d+)?)\s*$/.exec(part);
        if (!match || !upstreamNames.has(match[1]) || seen.has(match[1])) continue;
        const value = metric(match[1], Number(match[2]));
        if (value) { values.push(value); seen.add(match[1]); }
      }
      const total = metric('dailylog_meeting_total', now() - started);
      if (total) values.push(total);
      return values.join(', ');
    }
  };
}

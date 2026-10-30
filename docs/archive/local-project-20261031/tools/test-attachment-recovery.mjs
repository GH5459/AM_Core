import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import sharp from 'sharp';
import collect from '../modules/collect/index.js';
import { createAttachmentRecovery, isRecoveryRequest } from '../modules/collect/attachment-recovery.js';
import { createDispatcher } from '../core/modules.js';

const rt = (value) => ({ rich_text: [{ text: { content: value } }] });
const request = (command = '請提供我這個檔案', quotedMessageId = 'original') => ({
  type: 'text', id: 'request', text: `@助手 ${command}`, quotedMessageId,
  mention: { mentionees: [{ index: 0, length: 3, type: 'user', isSelf: true }] },
});
const tenant = { key: 'synthetic-tenant', runtimeEnabled: true, modules: ['collect', 'triage'],
  driveConfigured: true, driveRootFolderId: 'synthetic-root', dataSources: { messages: 'messages', attachments: 'attachments' } };

function harness({ mimeType = 'image/png', size = 256, group = 'group', outside = false, missing = false,
  noBackup = false, duplicates = false, pageTwo = false, deleted = false, failArchive = false, failReply = false } = {}) {
  const calls = [], replies = [], logs = [];
  let timestamp = Date.UTC(2026, 9, 8), currentTenant = tenant;
  const source = { id: 'source-page', properties: { 'LINE 訊息 ID': rt('original'), 'LINE 群組 ID': rt(group) } };
  const attachment = (fileId) => ({ id: 'attachment-page', properties: {
    '訊息': { relation: [{ id: 'source-page' }] }, 'Drive 連結': { url: `https://drive.google.com/file/d/${fileId}/view` },
  } });
  const platform = {
    logger: { warn: (v) => logs.push(v) }, publicBaseUrl: 'https://example.test', publicLinkSecret: 'synthetic-test-secret',
    getDriveAccessToken: async () => 'synthetic-token', resolveSenderName: async () => 'Synthetic sender',
    router: { resolveGroupBinding: async () => ({ tenant: currentTenant }) },
    replyLineMessages: async (token, messages) => {
      calls.push(['reply', messages.length]);
      if (failReply && messages.length > 1) throw Object.assign(new Error('bad image'), { lineStatus: 400 });
      replies.push(messages);
    },
    notionRequest: async (path, options) => {
      calls.push(['notion', path, options]);
      assert.equal(options.tenantKey, tenant.key);
      if (path === '/v1/pages') {
        if (failArchive) throw new Error('synthetic storage failure');
        return { id: 'request-page' };
      }
      if (path.includes('/messages/')) {
        assert.equal(options.body.filter.and[0].rich_text.equals, 'original');
        assert.equal(options.body.filter.and[1].rich_text.equals, 'group');
        if (missing) return { results: [] };
        if (pageTwo && !options.body.start_cursor) return { results: [], has_more: true, next_cursor: 'second' };
        return { results: [source] };
      }
      return { results: noBackup ? [] : duplicates ? [attachment('file'), attachment('other')] : [attachment('file')] };
    },
  };
  const fetchImpl = async (input) => {
    const url = new URL(input);
    calls.push(['drive', url.pathname, url.search]);
    if (url.searchParams.get('alt') === 'media') return new Response(await sharp({ create: { width: 1200, height: 900,
      channels: 3, background: 'red' } }).png().toBuffer());
    const id = url.pathname.split('/').at(-1);
    return Response.json(id === 'file' ? { id, name: '測試照片.png', mimeType, size: String(size),
      parents: ['day-folder'], trashed: deleted } : { id, parents: [outside ? 'foreign-root' : 'synthetic-root'] });
  };
  const recovery = createAttachmentRecovery(platform, { fetchImpl, now: () => timestamp });
  const ctx = { tenant, groupId: 'group', message: request(), event: { replyToken: 'synthetic-reply', timestamp, source: { groupId: 'group' } } };
  return { recovery, ctx, platform, calls, replies, logs, expire: () => { timestamp += 7201000; }, revoke: () => { currentTenant = { key: 'other' }; } };
}

async function download(h, tokenUrl, targetTenant = tenant) {
  const signedUrl = new URL(tokenUrl);
  const server = http.createServer((req, res) => h.recovery.handleDownload(req, res, { url: signedUrl, tenant: targetTenant }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/line-attachment`);
    return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) };
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('recognizes only actual self mentions and supported retrieval commands', () => {
  for (const cmd of ['請提供我這個檔案', '請提供我這張照片', '<請提供我這個檔案>', '麻煩找回原始的附件', '重傳這張圖片']) assert.ok(isRecoveryRequest(request(cmd)), cmd);
  assert.equal(isRecoveryRequest({ ...request(), mention: undefined }), false);
  assert.equal(isRecoveryRequest({ ...request(), mention: { mentionees: [{ isSelf: false }] } }), false);
  assert.equal(isRecoveryRequest(request('請提供我這個檔案並明天寄給客戶')), false);
});

test('reply resolves exact source and returns photo plus private signed download', async () => {
  const h = harness({ pageTwo: true });
  assert.equal(await h.recovery.onMessage(h.ctx), true);
  assert.equal(h.replies[0][1].type, 'image');
  assert.ok(h.calls.filter((c) => c[0] === 'notion').length >= 3);
  const result = await download(h, h.replies[0][1].originalContentUrl);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.ok(result.buffer.length > 0);
  const original = await sharp({ create: { width: 1200, height: 900, channels: 3, background: 'red' } }).png().toBuffer();
  assert.deepEqual(result.buffer, original, 'original image bytes must be preserved');
  const preview = await download(h, h.replies[0][1].previewImageUrl);
  assert.equal(preview.headers.get('content-type'), 'image/jpeg');
  assert.ok(preview.buffer.length <= 1024 * 1024);
  assert.ok((await sharp(preview.buffer).metadata()).width <= 1024);
});

test('generic file, oversized image and unsupported image use original download', async () => {
  for (const options of [{ mimeType: 'application/pdf' }, { size: 11 * 1024 * 1024 }, { mimeType: 'image/heic' }]) {
    const h = harness(options);
    await h.recovery.onMessage(h.ctx);
    assert.equal(h.replies[0].length, 1);
    const result = await download(h, h.replies[0][0].text.split('\n').at(-1));
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-disposition'), /^attachment;/);
    assert.equal(result.headers.get('content-type'), 'application/octet-stream');
  }
});

test('no quote, unknown source, missing backup, conflict, deleted file and foreign scope fail honestly', async () => {
  for (const [options, expected] of [[{ missing: true }, /找不到/], [{ noBackup: true }, /沒有/],
    [{ duplicates: true }, /多份/], [{ deleted: true }, /刪除/], [{ group: 'foreign' }, /找不到/], [{ outside: true }, /雲端範圍|無法讀取/]]) {
    const h = harness(options);
    await h.recovery.onMessage(h.ctx);
    assert.match(h.replies[0][0].text, expected);
    assert.equal(h.replies[0].length, 1);
    assert.ok(!h.replies[0][0].text.includes('token='));
  }
  const h = harness(); h.ctx.message.quotedMessageId = '';
  await h.recovery.onMessage(h.ctx);
  assert.match(h.replies[0][0].text, /先在原始/);
  assert.equal(h.calls.filter((c) => c[0] === 'notion').length, 0);
});

test('tampered, expired, cross-tenant tokens and revoked group bindings cannot download', async () => {
  for (const change of ['signature', 'expiry', 'tenant', 'binding']) {
    const h = harness(); await h.recovery.onMessage(h.ctx);
    const url = new URL(h.replies[0][1].originalContentUrl);
    if (change === 'signature') url.searchParams.set('token', `${url.searchParams.get('token')}x`);
    if (change === 'expiry') h.expire();
    if (change === 'tenant') h.platform.publicLinkSecret = 'other-secret';
    if (change === 'binding') h.revoke();
    const before = h.calls.filter((c) => c[0] === 'drive').length;
    assert.equal((await download(h, url.href)).status, 403);
    assert.equal(h.calls.filter((c) => c[0] === 'drive').length, before);
    assert.ok(h.logs.every((v) => !v.includes('token=') && !v.includes('synthetic-token')));
  }
});

test('LINE rejects image payload: retry once with the download text', async () => {
  const h = harness({ failReply: true });
  await h.recovery.onMessage(h.ctx);
  assert.deepEqual(h.calls.filter((c) => c[0] === 'reply').map((c) => c[1]), [2, 1]);
  assert.equal(h.replies[0].length, 1);
});

test('same signing secret does not allow a different tenant to use the link', async () => {
  const h = harness();
  await h.recovery.onMessage(h.ctx);
  const before = h.calls.length;
  assert.equal((await download(h, h.replies[0][1].originalContentUrl, { ...tenant, key: 'foreign-tenant' })).status, 403);
  assert.equal(h.calls.length, before);
});

test('real dispatcher keeps recovery command out of triage even if command storage fails', async () => {
  const h = harness({ failArchive: true });
  collect.init(h.platform);
  let triaged = 0;
  const dispatcher = createDispatcher({ tenants: [tenant], platform: h.platform,
    modules: new Map([['collect', collect], ['triage', { onMessage: async () => { triaged++; } }]]) });
  // Missing quote gives guidance without invoking the real Drive transport.
  await dispatcher.dispatchMessage({ tenant, binding: {}, event: { ...h.ctx.event, message: request('請提供我這張照片', '') } });
  assert.equal(triaged, 0);
  assert.match(h.replies[0][0].text, /回覆/);
  const routes = dispatcher.collectRoutes();
  assert.ok(routes.some((r) => r.route.prefix === '/line-attachment'));
});

test('stored recovery operation preserves quote evidence and stays out of pending queue', async () => {
  const h = harness({ missing: true });
  collect.init(h.platform);
  const ctx = { ...h.ctx, notionRequest: (p, o) => h.platform.notionRequest(p, { ...o, tenantKey: tenant.key }) };
  assert.equal(await collect.onMessage(ctx), true);
  const record = h.calls.find((c) => c[0] === 'notion' && c[1] === '/v1/pages')[2].body.properties;
  assert.equal(record['掛載狀態'].select.name, '一般對話');
  assert.match(record['內容'].rich_text[0].text.content, /原始 LINE 訊息 ID：original/);
});

test('guidance transport failure cannot leak the command into task extraction', async () => {
  const h = harness();
  h.platform.replyLineMessages = async () => { throw new Error('synthetic transport failure'); };
  collect.init(h.platform);
  h.ctx.message.quotedMessageId = '';
  assert.equal(await collect.onMessage(h.ctx), true);
});

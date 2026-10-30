import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

const TTL_SECONDS = 2 * 60 * 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const text = (prop) => (prop?.rich_text || prop?.title || []).map((p) => p.plain_text || p.text?.content || '').join('');
const failure = (code) => Object.assign(new Error(code), { code });

export function isRecoveryRequest(message) {
  if (message?.type !== 'text' || !message.mention?.mentionees?.some((m) => m.isSelf === true)) return false;
  // Remove actual mention spans (LINE offsets are UTF-16), never infer bot identity from names.
  let command = String(message.text || '');
  for (const m of [...message.mention.mentionees].sort((a, b) => b.index - a.index)) {
    if (Number.isInteger(m.index) && Number.isInteger(m.length)) command = command.slice(0, m.index) + command.slice(m.index + m.length);
  }
  command = command.replace(/[\s，,。.!！?？<>＜＞「」『』]/g, '');
  return /^(?:請|麻煩)?(?:提供|給|傳|重傳|重新傳|再傳|找回|下載|取回)(?:給)?(?:我)?(?:一下)?(?:這個|這張|這份|這些|該|原本的|原始的|原)?(?:檔案|照片|圖片|附件)(?:給我|一次|一下)?$/.test(command);
}

export function createAttachmentRecovery(platform, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const secretFor = (tenant) => platform.publicLinkSecretForTenant?.(tenant) || platform.publicLinkSecret || '';
  const sign = (data, secret) => crypto.createHmac('sha256', secret).update(`am-line-attachment-v1:${data}`).digest('base64url');
  const nreq = (tenant, pathname, body) => platform.notionRequest(pathname, { method: 'POST', body, tenantKey: tenant.key });

  async function query(tenant, ds, filter) {
    const rows = [];
    let cursor;
    do {
      const page = await nreq(tenant, `/v1/data_sources/${encodeURIComponent(ds)}/query`, {
        filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
      });
      rows.push(...(page.results || []).filter((p) => !p.archived && !p.in_trash));
      cursor = page.has_more ? page.next_cursor : null;
      if (page.has_more && !cursor) throw failure('lookup_failed');
    } while (cursor);
    return rows;
  }

  async function resolve(tenant, groupId, messageId) {
    if (!tenant?.dataSources?.messages || !tenant.dataSources.attachments) throw failure('not_configured');
    const messages = await query(tenant, tenant.dataSources.messages, { and: [
      { property: 'LINE 訊息 ID', rich_text: { equals: messageId } },
      { property: 'LINE 群組 ID', rich_text: { equals: groupId } },
    ] });
    // Check returned values as well as the API filter. Never search by filename or latest image.
    const sources = messages.filter((m) => text(m.properties?.['LINE 訊息 ID']) === messageId
      && text(m.properties?.['LINE 群組 ID']) === groupId);
    if (!sources.length) throw failure('not_found');
    const files = new Map();
    for (const source of sources) {
      const attachments = await query(tenant, tenant.dataSources.attachments, { property: '訊息', relation: { contains: source.id } });
      for (const row of attachments) {
        if (!row.properties?.['訊息']?.relation?.some((r) => r.id === source.id)) continue;
        let url;
        try { url = new URL(row.properties?.['Drive 連結']?.url); } catch { continue; }
        if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') continue;
        const fileId = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1];
        if (fileId) files.set(fileId, { fileId, attachmentId: row.id });
      }
    }
    if (!files.size) throw failure('not_backed_up');
    if (files.size !== 1) throw failure('ambiguous');
    return [...files.values()][0];
  }

  async function metadata(fileId) {
    const token = await platform.getDriveAccessToken();
    const response = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,parents,trashed&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw failure(response.status === 404 ? 'backup_missing' : 'drive_unavailable');
    const result = await response.json();
    if (result.trashed) throw failure('backup_missing');
    return result;
  }

  async function ownedMetadata(tenant, fileId) {
    if (!tenant.driveRootFolderId || !tenant.driveConfigured || !platform.getDriveAccessToken) throw failure('not_configured');
    const file = await metadata(fileId);
    let parents = file.parents || [];
    const seen = new Set([fileId]);
    for (let depth = 0; depth < 20 && parents.length; depth++) {
      if (parents.includes(tenant.driveRootFolderId)) return file;
      const next = [];
      for (const parent of parents) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        next.push(...((await metadata(parent)).parents || []));
      }
      parents = next;
    }
    throw failure('outside_tenant');
  }

  function link(tenant, groupId, messageId, fileId, mode) {
    const secret = secretFor(tenant);
    let base;
    try { base = new URL(platform.publicBaseUrlForTenant?.(tenant) || platform.publicBaseUrl); } catch { throw failure('not_configured'); }
    if (!secret || base.protocol !== 'https:' || base.username || base.password) throw failure('not_configured');
    const payload = Buffer.from(JSON.stringify({ v: 1, tenant: tenant.key, groupId, messageId, fileId, mode,
      exp: Math.floor(now() / 1000) + TTL_SECONDS })).toString('base64url');
    const url = new URL(`${base.href.replace(/\/$/, '')}/line-attachment`);
    url.searchParams.set('tenant', tenant.key);
    url.searchParams.set('token', `${payload}.${sign(payload, secret)}`);
    return url.href;
  }

  function verify(tenant, token) {
    if (!token || token.length > 2500 || !secretFor(tenant)) throw failure('invalid_link');
    const [data, signature, extra] = token.split('.');
    if (!data || !signature || extra) throw failure('invalid_link');
    const expected = Buffer.from(sign(data, secretFor(tenant)));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) throw failure('invalid_link');
    let p;
    try { p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); } catch { throw failure('invalid_link'); }
    if (p.v !== 1 || p.tenant !== tenant.key || !p.groupId || !p.messageId || !p.fileId
      || !['download', 'image', 'preview'].includes(p.mode) || !Number.isInteger(p.exp)
      || p.exp <= Math.floor(now() / 1000) || p.exp > Math.floor(now() / 1000) + TTL_SECONDS) throw failure('invalid_link');
    return p;
  }

  const responses = {
    not_found: '找不到這則訊息的備份紀錄，請確認回覆的是原始照片或檔案。',
    not_backed_up: '找到原始訊息，但沒有可取用的雲端原檔備份。請原發送者重新提供。',
    backup_missing: '雲端備份已刪除或無法存取，請原發送者重新提供。',
    ambiguous: '這則訊息有多份不同的附件備份，需要管理者確認原檔後再提供。',
    not_configured: '附件取回服務尚未設定完成，請管理者確認附件庫、雲端硬碟與下載網址設定。',
    outside_tenant: '備份檔案不在此專案的雲端範圍，暫時無法提供。',
  };
  const say = (ctx, value) => platform.replyLineMessages(ctx.event.replyToken, [{ type: 'text', text: value }]);

  async function onMessage(ctx) {
    if (!isRecoveryRequest(ctx.message)) return false;
    if (!ctx.groupId || !ctx.message.quotedMessageId) {
      await say(ctx, '請先在原始照片或檔案上按「回覆」，再 @我說「請提供我這個檔案」或「請提供我這張照片」。');
      return true;
    }
    let messages;
    try {
      const record = await resolve(ctx.tenant, ctx.groupId, String(ctx.message.quotedMessageId));
      const file = await ownedMetadata(ctx.tenant, record.fileId);
      const download = link(ctx.tenant, ctx.groupId, String(ctx.message.quotedMessageId), record.fileId, 'download');
      const name = String(file.name || '原始附件').replace(/[\r\n]/g, ' ').slice(0, 180);
      messages = [{ type: 'text', text: `已找到備份：${name}\n原檔下載（連結有效 2 小時，過期可再次回覆取回）：\n${download}` }];
      if (['image/jpeg', 'image/png'].includes(file.mimeType) && Number(file.size) > 0 && Number(file.size) <= MAX_IMAGE_BYTES) {
        messages.push({ type: 'image',
          originalContentUrl: link(ctx.tenant, ctx.groupId, String(ctx.message.quotedMessageId), record.fileId, 'image'),
          previewImageUrl: link(ctx.tenant, ctx.groupId, String(ctx.message.quotedMessageId), record.fileId, 'preview'),
        });
      }
    } catch (error) {
      platform.logger?.warn?.(`[attachment-recovery] lookup result=${responses[error.code] ? error.code : 'unavailable'}`);
      await say(ctx, responses[error.code] || '目前無法讀取雲端備份，請稍後再試。');
      return true;
    }
    // Do not claim success or send an extra reply after an uncertain transport failure.
    try { await platform.replyLineMessages(ctx.event.replyToken, messages); }
    catch (error) {
      if (messages.length > 1 && error.lineStatus === 400) {
        await platform.replyLineMessages(ctx.event.replyToken, [messages[0]]);
      } else platform.logger?.warn?.('[attachment-recovery] reply unavailable');
    }
    return true;
  }

  async function handleDownload(req, res, { url, tenant }) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!tenant || tenant.runtimeEnabled === false) throw failure('invalid_link');
      const p = verify(tenant, url.searchParams.get('token'));
      // Recheck binding and source on every use, including after routing or attachment changes.
      platform.router.invalidate?.(p.groupId);
      const binding = await platform.router.resolveGroupBinding(p.groupId);
      if (binding.tenant?.key !== tenant.key) throw failure('invalid_link');
      const record = await resolve(tenant, p.groupId, p.messageId);
      if (record.fileId !== p.fileId) throw failure('invalid_link');
      const file = await ownedMetadata(tenant, p.fileId);
      if (p.mode !== 'download' && (!['image/jpeg', 'image/png'].includes(file.mimeType)
        || !(Number(file.size) > 0 && Number(file.size) <= MAX_IMAGE_BYTES))) throw failure('invalid_link');
      const token = await platform.getDriveAccessToken();
      const upstream = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.fileId)}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000),
      });
      if (!upstream.ok || !upstream.body) throw failure('drive_unavailable');
      if (p.mode === 'preview') {
        // Bound image input even when the stored Drive size is stale.
        const chunks = [];
        let size = 0;
        for await (const chunk of Readable.fromWeb(upstream.body)) {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) throw failure('image_too_large');
          chunks.push(chunk);
        }
        const preview = await sharp(Buffer.concat(chunks), { limitInputPixels: 40000000 })
          .rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 75 }).toBuffer();
        if (preview.length > 1024 * 1024) throw failure('image_too_large');
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(preview);
      } else {
        res.setHeader('Content-Type', p.mode === 'image' ? file.mimeType : 'application/octet-stream');
        const name = String(file.name || 'attachment').replace(/[\r\n\u0000-\u001f\u007f]/g, '').slice(0, 180);
        res.setHeader('Content-Disposition', `${p.mode === 'image' ? 'inline' : 'attachment'}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, '%27')}`);
        await pipeline(Readable.fromWeb(upstream.body), res);
      }
    } catch (error) {
      platform.logger?.warn?.(`[attachment-recovery] download result=${error.code === 'invalid_link' ? 'invalid_link' : 'unavailable'}`);
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      res.statusCode = error.code === 'invalid_link' ? 403 : 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(error.code === 'invalid_link' ? '連結已失效，請回到原始 LINE 訊息再次回覆取回。' : '目前無法讀取備份，請稍後再試。');
    }
  }

  return { isRequest: isRecoveryRequest, onMessage, handleDownload };
}

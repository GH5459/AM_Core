import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

import { createContractArtifactService } from './contract-artifacts.js';
import { renderLineConversationArchive } from './contract-pdf-renderer.js';

const MAX_MESSAGES = 5000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const STICKER_MARKER = /^\[sticker\]\s+package:([^\s]*)\s+sticker:([^\s]+)$/i;

function archiveError(code, message, statusCode = 400, details = {}) {
  return Object.assign(new Error(message), { code, statusCode, details });
}
function text(value) { return String(value ?? '').trim(); }
function plain(items) { return (items || []).map((item) => item?.plain_text || item?.text?.content || '').join('').trim(); }
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function driveFileId(url) { return text(url).match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || ''; }
function stageLabel(stage) {
  if (stage === 'final_issue') return '正式確認版送簽前';
  if (stage === 'historical_supplement') return '歷史對話補充封存';
  return '草約送廠商確認前';
}

async function fetchBoundedImage(url, timeoutMs = 12_000) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only HTTPS media is allowed.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`Media download failed (${response.status}).`);
    const contentType = text(response.headers.get('content-type')).split(';')[0].toLowerCase();
    if (!['image/png', 'image/jpeg'].includes(contentType)) throw new Error('Media is not a supported image.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE_BYTES) throw new Error('Media exceeds the archive limit.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Media size is invalid.');
    return { buffer, mimeType: contentType };
  } finally {
    clearTimeout(timer);
  }
}

async function queryAllMessages(deps, groupBindingId, startedAfter, endedAt) {
  if (!deps.dataSources?.messages) throw archiveError('LINE_ARCHIVE_MESSAGES_UNAVAILABLE', '工程 LINE 訊息資料庫尚未設定。', 503);
  const filters = [
    { property: '群組綁定', relation: { contains: groupBindingId } },
    { property: '時間', date: { on_or_before: endedAt } },
  ];
  if (startedAfter) filters.push({ property: '時間', date: { after: startedAfter } });
  const rows = [];
  let cursor;
  do {
    const result = await deps.notionRequest(`/v1/data_sources/${encodeURIComponent(deps.dataSources.messages)}/query`, {
      method: 'POST',
      body: {
        filter: { and: filters }, sorts: [{ property: '時間', direction: 'ascending' }],
        page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
      },
    });
    rows.push(...(result.results || []));
    if (rows.length > MAX_MESSAGES) throw archiveError('LINE_ARCHIVE_TOO_MANY_MESSAGES', '本次 LINE 對話超過 5,000 則，請先縮小封存區間。', 413);
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return rows;
}

async function messageAttachments(deps, messagePageId) {
  if (!deps.dataSources?.attachments) return [];
  const result = await deps.notionRequest(`/v1/data_sources/${encodeURIComponent(deps.dataSources.attachments)}/query`, {
    method: 'POST', body: { filter: { property: '訊息', relation: { contains: messagePageId } }, page_size: 20 },
  });
  const output = [];
  for (const page of result.results || []) {
    const properties = page.properties || {};
    const name = plain(properties['檔案名稱']?.rich_text) || plain(properties['附件項目']?.title) || 'LINE 附件';
    const id = driveFileId(properties['Drive 連結']?.url);
    const notionFile = properties['檔案']?.files?.[0];
    const notionUrl = text(notionFile?.file?.url || notionFile?.external?.url);
    const attachment = { name, fileId: id, mimeType: '', sha256: '', buffer: null };
    if (id && typeof deps.downloadFromDrive === 'function') {
      try {
        await deps.auditDrivePrivate?.(id);
        const downloaded = await deps.downloadFromDrive(id, MAX_IMAGE_BYTES);
        if (Buffer.isBuffer(downloaded?.buffer) && downloaded.buffer.length) {
          attachment.buffer = downloaded.buffer;
          attachment.mimeType = text(downloaded.mimeType || downloaded.contentType).toLowerCase()
            || (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg');
          attachment.sha256 = sha256(downloaded.buffer);
        }
      } catch { /* metadata remains in the immutable archive even when media cannot be embedded */ }
    }
    if (!attachment.buffer && notionUrl) {
      try {
        const downloaded = await fetchBoundedImage(notionUrl);
        attachment.buffer = downloaded.buffer;
        attachment.mimeType = downloaded.mimeType;
        attachment.sha256 = sha256(downloaded.buffer);
      } catch { /* keep metadata even when the temporary Notion URL is unavailable */ }
    }
    output.push(attachment);
  }
  return output;
}

async function stickerAttachment(content) {
  const match = text(content).match(STICKER_MARKER);
  if (!match) return [];
  const stickerId = match[2];
  if (!/^\d{1,20}$/.test(stickerId)) return [];
  try {
    const downloaded = await fetchBoundedImage(
      `https://stickershop.line-scdn.net/stickershop/v1/sticker/${encodeURIComponent(stickerId)}/android/sticker.png`,
    );
    return [{
      name: `LINE-貼圖-${stickerId}.png`, fileId: '', mimeType: downloaded.mimeType,
      sha256: sha256(downloaded.buffer), buffer: downloaded.buffer,
    }];
  } catch {
    return [];
  }
}

async function normalizedMessages(deps, pages) {
  const messages = [];
  for (const page of pages) {
    const properties = page.properties || {};
    const message = {
      pageId: page.id,
      messageId: plain(properties['LINE 訊息 ID']?.rich_text) || page.id,
      sender: plain(properties['發送者']?.rich_text) || '未知發言人',
      time: properties['時間']?.date?.start || page.created_time,
      messageType: properties['訊息類型']?.select?.name || '其他',
      content: plain(properties['內容']?.rich_text) || plain(properties['訊息']?.title),
      attachments: [],
    };
    if (['照片', '檔案'].includes(message.messageType)) message.attachments = await messageAttachments(deps, page.id);
    if (message.messageType === '貼圖') message.attachments = await stickerAttachment(message.content);
    messages.push(message);
  }
  return messages;
}

function evidenceManifest(messages) {
  return messages.map((message) => ({
    pageId: message.pageId, messageId: message.messageId, sender: message.sender,
    time: message.time, messageType: message.messageType, content: message.content,
    attachments: message.attachments.map(({ name, fileId, sourceFileId, mimeType, sha256: hash }) => ({ name, fileId, ...(sourceFileId?{sourceFileId}:{}), mimeType, sha256: hash })),
  }));
}

export function publicLineArchive(row) {
  return {
    id: row.id, versionId: row.version_id, versionNo: Number(row.version_no), stage: row.stage,
    stageLabel: stageLabel(row.stage), startedAfter: row.started_after, endedAt: row.ended_at,
    firstMessageAt: row.source_manifest?.[0]?.time || null,
    messageCount: Number(row.message_count), firstMessageId: row.first_message_id,
    originals: (row.source_manifest || []).flatMap(m => m.attachments || []).map((a,index) => ({id:String(index),name:a.name})),
    lastMessageId: row.last_message_id, fileName: row.file_name
      || (row.stage === 'historical_supplement'
        ? `V${row.version_no}-V1前歷史補充-LINE對話封存.pdf`
        : `V${row.version_no}-${row.stage === 'final_issue' ? '正式送簽前' : '草約送出前'}-LINE對話封存.pdf`),
    mimeType: 'application/pdf', sha256: row.pdf_sha256, createdAt: row.created_at,
  };
}

export async function captureContractLineArchive(deps, input, options = {}) {
  const required = ['createLineConversationArchive', 'listLineConversationArchives'];
  if (required.some((method) => typeof deps.contractStore?.[method] !== 'function')) {
    throw archiveError('LINE_ARCHIVE_STORE_UNAVAILABLE', '工程合約 LINE 對話封存資料庫尚未完成升級。', 503);
  }
  const artifacts = options.artifactService || createContractArtifactService(deps);
  const contract = input.contract;
  const version = input.version;
  const cutoff = new Date(input.endedAt || new Date()).toISOString();
  const archiveKey = input.archiveKey;
  const existing = await deps.contractStore.listLineConversationArchives(input.context.tenant, contract.id);
  const duplicate = existing.find((row) => row.archive_key === archiveKey);
  if (duplicate) return { ...publicLineArchive(duplicate), driveFileId: duplicate.pdf_drive_file_id };
  const previous = [...existing].filter((row) => Date.parse(row.ended_at) < Date.parse(cutoff)).at(-1);
  const startedAfter = input.startedAfter !== undefined ? input.startedAfter : (previous?.ended_at || null);
  const messages = options.messages || await normalizedMessages(deps,
    await queryAllMessages(deps, input.group.groupBindingId, startedAfter, cutoff));
  const manifest = evidenceManifest(messages);
  const manifestSha256 = sha256(Buffer.from(canonical(manifest), 'utf8'));
  let pdf = await renderLineConversationArchive({
    contractNumber: contract.contractNumber || contract.contract_number, title: contract.title,
    versionNo: version.versionNo || version.version_no, groupName: input.group.groupName,
    stageLabel: stageLabel(input.stage), startedAfter, endedAt: cutoff, messages,
  });
  // Keep PDF attachments readable in the archive as well as preserving their original bytes.
  const pdfFiles=messages.flatMap(m=>m.attachments).filter(a=>a.mimeType==='application/pdf'&&a.buffer);
  if(pdfFiles.length){
    const bundle=await PDFDocument.load(pdf);
    for(const file of pdfFiles){const document=await PDFDocument.load(file.buffer);for(const page of await bundle.copyPages(document,document.getPageIndices()))bundle.addPage(page);}
    pdf=Buffer.from(await bundle.save());
  }
  const rendered = { buffer: pdf, sha256: sha256(pdf), byteSize: pdf.length };
  const fileName = `${contract.contractNumber || contract.id}-V${version.versionNo || version.version_no}-${input.stage === 'final_issue' ? 'FINAL' : 'DRAFT'}-LINE-對話封存.pdf`;
  const stored = await artifacts.storePdf({
    projectLabel: contract.projectCode || contract.projectId,
    contractLabel: contract.contractNumber || contract.title || contract.id,
    filename: fileName, folderName: 'LINE 對話封存', rendered,
  });
  const row = await deps.contractStore.createLineConversationArchive(input.context.tenant, {
    archiveKey, versionId: version.id, externalReviewId: input.externalReviewId,
    stage: input.stage, groupBindingId: input.group.groupBindingId, lineGroupId: input.group.lineGroupId,
    startedAfter, endedAt: cutoff, firstMessageId: manifest.at(0)?.messageId,
    lastMessageId: manifest.at(-1)?.messageId, messageCount: manifest.length,
    sourceManifest: manifest, sourceManifestSha256: manifestSha256,
    pdfDriveFileId: stored.driveFileId, pdfSha256: stored.sha256,
    pdfByteSize: stored.byteSize, actor: input.context.actor,
  });
  return { ...publicLineArchive({ ...row, file_name: fileName }), driveFileId: stored.driveFileId };
}

export const __test = { canonical, stageLabel, evidenceManifest, publicLineArchive, driveFileId, stickerAttachment };

export async function captureSavedContractConversation(deps,input) {
  if(typeof deps.loadCentralContractMessages!=='function')throw archiveError('CENTRAL_ARCHIVE_UNAVAILABLE','LINE 歷史對話收集服務尚未就緒。',503);
  const messages=await deps.loadCentralContractMessages({tenantKey:input.context.tenant.key,
    groupBindingId:input.group.groupBindingId,lineGroupId:input.group.lineGroupId,endedAt:input.endedAt});
  if(!messages.length)throw archiveError('LINE_ARCHIVE_EMPTY','這個群組尚無已保存的對話。',409);
  const identity=messages.map(m=>({...m,attachments:m.attachments.map(({name,sha256,fileId})=>({name,sha256,fileId}))}));
  const archiveKey=`saved-conversation:${input.contract.id}:${sha256(Buffer.from(canonical(identity)))}`;
  const existing=await deps.contractStore.listLineConversationArchives(input.context.tenant,input.contract.id);
  const duplicate=existing.find(row=>row.archive_key===archiveKey);
  if(duplicate)return publicLineArchive(duplicate);
  const max=60*1024*1024; let total=0;
  const hydrated=new Map();
  // Copy originals to the contract's private archive; never change source sharing.
  const folder=await deps.ensureDriveFolder('工程合約管理',deps.driveRootFolderId);
  const project=await deps.ensureDriveFolder(String(input.contract.projectCode||input.contract.projectId),folder);
  const contractFolder=await deps.ensureDriveFolder(String(input.contract.contractNumber||input.contract.id),project);
  const target=await deps.ensureDriveFolder('LINE 對話原始附件',contractFolder);
  if((await deps.auditDrivePrivate(target))?.private!==true)throw archiveError('LINE_ARCHIVE_NOT_PRIVATE','附件封存資料夾必須保持私有。',409);
  for(const message of messages)for(let i=0;i<message.attachments.length;i++){
    const a=message.attachments[i];
    if(!a.fileId||!/^[a-f0-9]{64}$/i.test(a.sha256||''))throw archiveError('LINE_ARCHIVE_SOURCE_MISSING',`附件尚未完整保存：${a.name}`,409);
    if(hydrated.has(a.fileId)){message.attachments[i]=hydrated.get(a.fileId);continue;}
    if((await deps.auditDrivePrivate(a.fileId))?.private!==true)throw archiveError('LINE_ARCHIVE_NOT_PRIVATE','來源附件必須保持私有。',409);
    const original=await deps.downloadFromDrive(a.fileId,max);
    const buffer=original?.buffer;
    if(!Buffer.isBuffer(buffer)||!buffer.length||sha256(buffer)!==a.sha256)throw archiveError('LINE_ARCHIVE_SOURCE_CHANGED',`附件檢查失敗：${a.name}`,409);
    total+=buffer.length;if(total>max)throw archiveError('LINE_ARCHIVE_TOO_LARGE','附件超過 60 MB，請分批封存。',413);
    const mimeType=original.mimeType||original.contentType||(/\.pdf$/i.test(a.name)?'application/pdf':'application/octet-stream');
    const name=String(a.name).replace(/[\\/\x00-\x1f]/g,'_').slice(0,180);
    const saved=await deps.uploadToDrive(buffer,`${a.sha256.slice(0,12)}-${name}`,mimeType,target);
    if(!saved?.id||(await deps.auditDrivePrivate(saved.id))?.private!==true)throw archiveError('LINE_ARCHIVE_COPY_FAILED','附件原檔封存未完成。',503);
    const item={...a,sourceFileId:a.fileId,fileId:saved.id,mimeType,buffer};
    hydrated.set(a.fileId,item);message.attachments[i]=item;
  }
  return captureContractLineArchive(deps,{...input,stage:'historical_supplement',startedAfter:null,
    archiveKey},{messages});
}

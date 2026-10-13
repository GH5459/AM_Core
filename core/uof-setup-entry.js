import { directUofQuery } from './line-io/conversation.js';

export const UOF_SETUP_ENTRY_CONTRACT = 'line-unbound-uof-setup-entry-v1';
const setupUrl = 'https://uof-line.ghotel.tw/Line/Setup?openExternalBrowser=1';

export function uofSetupMessage() {
  return { type: 'template', altText: '首次使用 UOF，請先完成 LINE 綁定：' + setupUrl,
    template: { type: 'buttons', text: '請先完成 UOF LINE 綁定。\n用外部瀏覽器開啟啟用頁，以本人 UOF 帳密登入，複製啟用文字到此私訊送出，再回瀏覽器確認自己的 LINE 名稱。',
      actions: [{ type: 'uri', label: '開啟 UOF LINE 啟用頁', uri: setupUrl }] } };
}

export function createUofSetupEntry({ line, lineIo, logger = console }) {
  const replies = new Map();
  async function partition(events) {
    const candidates = events.filter(directUofQuery);
    const setupEvents = candidates.length && lineIo.uofSetupEvents ? await lineIo.uofSetupEvents(candidates) : [];
    const selected = new Set(setupEvents);
    return { setupEvents, remaining: events.filter(event => !selected.has(event)) };
  }
  async function handle(event) {
    if (!directUofQuery(event)) return false;
    if (!event.replyToken || event.mode === 'standby') return true;
    // Public navigation only. No UOF account, pairing code or access grant is
    // inferred from a LINE click; the linked site keeps its existing checks.
    const key = event.webhookEventId || event.replyToken;
    const now = Date.now();
    for (const [id, until] of replies) if (until <= now) replies.delete(id);
    if (replies.has(key)) return true;
    if (replies.size >= 2000) replies.delete(replies.keys().next().value);
    replies.set(key, now + 600000);
    try { await line.replyLineMessages(event.replyToken, [uofSetupMessage()], { timeoutMs: 5000 }); }
    catch { logger.warn?.('UOF setup entry reply unavailable.'); }
    return true;
  }
  return { partition, handle, health: () => ({ contract: UOF_SETUP_ENTRY_CONTRACT,
    enabled: Boolean(lineIo.bindingsEnabled), scope: 'unbound-direct-chat-navigation', requiresUofLogin: true, browserMode: 'external' }) };
}

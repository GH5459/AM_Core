// Public navigation only; destination sites authenticate the person opening the link.
// Replies contain public URLs only and use the triggering reply token, never push.
export const PORTAL_COMMAND_CONTRACT = 'line-meeting-uof-navigation-v1';
export function portalCommand(event) {
  const s = event?.source;
  if (event?.type !== 'message' || event.message?.type !== 'text' || !/^U[0-9a-f]{32}$/i.test(s?.userId || '')) return '';
  if (!(s.type === 'user' && !s.groupId && !s.roomId || s.type === 'group' && /^C[0-9a-f]{32}$/i.test(s.groupId || '') || s.type === 'room' && /^R[0-9a-f]{32}$/i.test(s.roomId || ''))) return '';
  const text = String(event.message.text || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return text === '會議' ? 'meeting' : /^uof$/i.test(text) ? 'uof' : '';
}
export function createPortalCommandEntry({ line, logger = console }) {
  async function handle(event) {
    const command = portalCommand(event);
    if (!command) return false;
    if (!event.replyToken || event.mode === 'standby') return true;
    let message;
    try {
      let uri = 'https://uof-line.ghotel.tw/Line/Review?openExternalBrowser=1';
      const label = command === 'meeting' ? '開啟我的會議' : '開啟 UOF 待簽';
      if (command === 'meeting') {
        const association = await line.lineGet('/v2/bot/user/all/richmenu', { timeoutMs: 3000 });
        if (!/^richmenu-[0-9a-f]{32}$/i.test(association?.richMenuId || '')) throw Error('menu_missing');
        const menu = await line.lineGet('/v2/bot/richmenu/' + association.richMenuId, { timeoutMs: 3000 });
        const actions = (menu?.areas || []).map(a => a.action).filter(a => a?.label === '會議' && a.type === 'uri');
        if (actions.length !== 1) throw Error('meeting_entry_missing');
        uri = actions[0].uri;
      }
      const url = new URL(uri);
      if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw Error('entry_invalid');
      message = { type: 'template', altText: label, template: { type: 'buttons', text: command === 'meeting' ? '點選下方按鈕查看自己的會議或新增會議；需要時請登入本人帳號。' : '點選下方按鈕開啟 UOF 待簽，請登入本人帳號。', actions: [{ type: 'uri', label, uri }] } };
    } catch {
      logger.warn?.('Portal navigation lookup unavailable.');
      message = { type: 'text', text: '目前無法取得入口，請稍後再輸入「' + (command === 'meeting' ? '會議' : 'UOF') + '」。' };
    }
    try { await line.replyLineMessages(event.replyToken, [message], { timeoutMs: 5000 }); }
    catch { logger.warn?.('Portal navigation reply unavailable.'); }
    return true;
  }
  return { matches: event => Boolean(portalCommand(event)), handle, health: () => ({ contract: PORTAL_COMMAND_CONTRACT, commands: ['會議', 'UOF'], scope: 'direct-group-room-public-navigation', meetingSource: 'active-default-rich-menu', uofPath: '/Line/Review', requiresDestinationLogin: true }) };
}

// Public documentation navigation: no account lookup, task creation or AI call.
export const USAGE_GUIDE_CONTRACT = 'line-usage-guide-entry-v1';
export const USAGE_GUIDE_URL = 'https://leaf-snail-quick-guide.chatgpt-673.workers.dev/';
const user = /^U[0-9a-f]{32}$/i;
export function isUsageGuideEvent(event, botUserId) {
  if (event?.type !== 'message' || event.message?.type !== 'text' || !user.test(event.source?.userId || '')) return false;
  let text = event.message.text;
  if (typeof text !== 'string') return false;
  const source = event.source;
  if (source.type === 'user') {
    if (source.groupId || source.roomId) return false;
  } else if (source.type === 'group' && /^C[0-9a-f]{32}$/i.test(source.groupId || '') && !source.roomId) {
    const mentions = event.message.mention?.mentionees;
    if (!user.test(botUserId || '') || !Array.isArray(mentions) || !mentions.length) return false;
    // Only native mentions of this OA are removed; literal names and colleague
    // mentions cannot turn a real work assignment into a navigation command.
    let end = text.length;
    for (const m of [...mentions].sort((a,b) => b.index-a.index)) {
      if (m.type !== 'user' || m.isSelf !== true || m.userId && m.userId !== botUserId
        || !Number.isInteger(m.index) || !Number.isInteger(m.length) || m.index < 0 || m.length <= 0 || m.index + m.length > end) return false;
      end = m.index;
      text = text.slice(0,m.index) + text.slice(m.index+m.length);
    }
  } else return false;
  text = text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
  return /^(?:[，,:：\s]*)(?:請|麻煩)?\s*(?:給我|提供|顯示|開啟|打開)?\s*使用說明[。!！?？\s]*$/u.test(text);
}
export function createUsageGuideEntry({ line, botUserId, logger = console }) {
  const matches = event => isUsageGuideEvent(event,botUserId);
  async function handle(event) {
    if (!matches(event)) return false;
    if (event.mode === 'standby' || !event.replyToken) return true;
    try { await line.replyLineMessages(event.replyToken,[{type:'text',text:'葉小蝸 AI 小助手使用說明：\n'+USAGE_GUIDE_URL+'\n\n包含自己的任務、交辦同仁、會議邀約、截圖交辦與群組功能。'}],{timeoutMs:5000}); }
    catch { logger.warn?.('Usage guide entry reply unavailable.'); }
    return true;
  }
  return { matches, handle, health: () => ({contract:USAGE_GUIDE_CONTRACT,command:'使用說明',url:USAGE_GUIDE_URL,scope:'direct-or-native-bot-mention-group'}) };
}

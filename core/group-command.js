export const GROUP_COMMAND_POLICY='line-group-native-keyword-commands-v1';
// LINE mention offsets use UTF-16 indices, as do JavaScript string slices.
export function groupCreateCommand(event, bot) {
  if (event?.type !== 'message' || event.source?.type !== 'group' || event.message?.type !== 'text') return null;
  const text = event.message.text;
  const mentions = event.message.mention?.mentionees;
  if (typeof text !== 'string' || !Array.isArray(mentions) || mentions.length < 1 || mentions.length > 20) return null;
  let end=0, selfCount=0;
  for(const m of [...mentions].sort((a,b)=>a.index-b.index)){
    if(m.type!=='user'||!Number.isInteger(m.index)||!Number.isInteger(m.length)||m.index<end||m.length<1||m.index+m.length>text.length||!/^[\s,，、:：]*$/u.test(text.slice(end,m.index)))return null;
    const self=m.isSelf===true||m.userId===bot;if(self)selfCount++;else if(!/^U[0-9a-f]{32}$/i.test(m.userId||''))return null;
    end=m.index+m.length;
  }
  const self=selfCount===mentions.length;
  const match = text.slice(end).match(/^[\s,，、:：]*(任務|活動|會議)/u);
  if (!match) return null;
  return { kind: match[1] === '任務' ? (self ? 'selftask' : 'task') : 'meeting', self, word: match[1], ...(selfCount&&!self?{includeSelf:true}:{}) };
}

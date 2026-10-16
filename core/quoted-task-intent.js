// Shared by both decision gates. A quote is context, never evidence of image contents.
export const QUOTED_TASK_POLICY='quoted-colleague-delivery-v1';
export function quotedTaskContext(source,mentionCount){return {hasReplyReference:/^\d{15,30}$/.test(source.quotedMessageId||''),colleagueMentionCount:mentionCount,quotedContentInspected:false};}
export function quotedExplanationTask(source,mentionCount){
 const context=quotedTaskContext(source,mentionCount),text=String(source.text||'').normalize('NFKC').trim();
 // Only a single confirmed recipient and an explicit, narrowly defined deliverable.
 // Ambiguous/multiple recipients and all other wording retain semantic judgment.
 if(!context.hasReplyReference||mentionCount!==1||text.length>4000)return null;
 if(/不用|不要|不必|無須|無需|不需要|先別|取消|停止|不是交辦|進度|做完了嗎|完成了嗎|轉述|轉貼|例如|範例|假如|如果|測試|他說|她說|「|」|“|”|"/.test(text))return null;
 const match=text.match(/(?:^|[\s，,。！!：:])(?:請|麻煩)(?:你|妳|您)?(?:幫我|幫忙|協助)?(說明|解釋|補充說明)\s*((?:這張|這個|該張|上面|上述|引用的|附上的)?(?:圖片|照片|截圖|圖))\s*的?\s*(目的|用途|背景|原因)(?=$|[\s，,。！？!?、；;])/u);
 if(!match)return null;
 const instruction=text.slice(match.index).trim().replace(/^[，,。！!：:]\s*/u,'');
 return {title:match[1]+'引用圖片的'+match[3],description:instruction};
}

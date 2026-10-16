import test from 'node:test';import assert from 'node:assert/strict';
import {quotedExplanationTask,quotedTaskContext} from '../core/quoted-task-intent.js';
const quote='12345678901234567',source=text=>({text,quotedMessageId:quote});
test('single mentioned colleague explicit replied-image explanation is a bounded deliverable, without inventing image contents',()=>{
 for(const text of ['@同仁甲 請說明這張圖片的目的','@同仁甲 麻煩妳解釋這張照片的用途。','@同仁甲 請幫忙補充說明上述截圖的背景，謝謝。','@同仁甲\n請說明這張圖片的原因']){
 const t=quotedExplanationTask(source(text),1);assert(t,text);assert.match(t.title,/引用圖片/);assert(!t.description.includes('@同仁甲'));assert(!t.description.includes('已完成'));assert.equal(t.recipientAccounts,undefined);}
 assert.deepEqual(quotedTaskContext(source('x'),1),{hasReplyReference:true,colleagueMentionCount:1,quotedContentInspected:false});
});
test('quote and mention alone never force tasks; ambiguity, negation, examples, progress and questions retain semantic judgment',()=>{
 for(const text of ['@同仁甲 你覺得這張圖片如何？','@同仁甲 請問這張圖片是什麼？','@同仁甲 圖片說明進度如何？','@同仁甲 不用說明這張圖片的目的','@同仁甲 不要處理。請說明這張圖片的目的','@同仁甲 例如：請說明這張圖片的目的','@同仁甲 他說請說明這張圖片的目的','@同仁甲 「請說明這張圖片的目的」','@同仁甲 如果方便，請說明這張圖片的目的','@同仁甲 早安，謝謝','@同仁甲 請整理清單','@同仁甲 明天開會'])assert.equal(quotedExplanationTask(source(text),1),null,text);
 for(const count of [0,2,20])assert.equal(quotedExplanationTask(source('@同仁甲 請說明這張圖片的目的'),count),null);
 for(const quotedMessageId of [undefined,'','not-a-quote'])assert.equal(quotedExplanationTask({text:'@同仁甲 請說明這張圖片的目的',quotedMessageId},1),null);
});

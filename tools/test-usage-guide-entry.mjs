import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUsageGuideEntry,isUsageGuideEvent,USAGE_GUIDE_URL} from '../core/usage-guide-entry.js';
const uid='U'+'1'.repeat(32),bot='U'+'2'.repeat(32),groupId='C'+'3'.repeat(32);
const direct=text=>({type:'message',source:{type:'user',userId:uid},replyToken:'fixture',message:{type:'text',text}});
const group=(tail='使用說明')=>({...direct('@葉小蝸 '+tail),source:{type:'group',userId:uid,groupId},message:{type:'text',text:'@葉小蝸 '+tail,mention:{mentionees:[{type:'user',isSelf:true,userId:bot,index:0,length:4}]}}});
test('direct commands accept whitespace, polite variants and punctuation, not work sentences',()=>{
 for(const text of ['使用說明',' 使用說明！ ','請給我使用說明','開啟使用說明','\u200B使用說明\uFEFF'])assert(isUsageGuideEvent(direct(text),bot),text);
 for(const text of ['請撰寫使用說明','明天完成使用說明','使用說明 https://evil.example','我要交辦使用說明','不用使用說明','使用說明有問題','@葉小蝸 使用說明'])assert(!isUsageGuideEvent(direct(text),bot),text);
});
test('groups require native self mention, valid source and exact residual command',()=>{
 assert(isUsageGuideEvent(group(),bot));assert(isUsageGuideEvent(group('，請給我使用說明。'),bot));
 for(const patch of [{mention:undefined},{mention:{mentionees:[{type:'user',userId:uid,index:0,length:4}]}},{mention:{mentionees:[{type:'user',isSelf:true,userId:uid,index:0,length:4}]}},{mention:{mentionees:[{type:'user',isSelf:true,index:-1,length:4}]}},{mention:{mentionees:[{type:'all',index:0,length:4}]}}])assert(!isUsageGuideEvent({...group(),message:{...group().message,...patch}},bot));
 assert(!isUsageGuideEvent(group('請小美整理使用說明'),bot));assert(!isUsageGuideEvent(group(),''));
 for(const source of[{type:'room',userId:uid,roomId:'R1'},{type:'group',userId:uid,groupId:'bad'},{type:'user',userId:uid,groupId},{type:'user',userId:''}])assert(!isUsageGuideEvent({...direct('使用說明'),source},bot));
 const g=group();g.message.text+=' @同仁';g.message.mention.mentionees.push({type:'user',userId:uid,index:10,length:3});assert(!isUsageGuideEvent(g,bot));
});
test('reply uses exact public URL and original reply token; standby or unsupported events send nothing',async()=>{
 const sent=[];const entry=createUsageGuideEntry({botUserId:bot,line:{replyLineMessages:async(...a)=>sent.push(a)},logger:{warn(){}}});
 assert(await entry.handle(direct('使用說明')));assert(await entry.handle(group()));assert.equal(sent.length,2);assert.equal(sent[0][0],'fixture');assert(sent[0][1][0].text.includes(USAGE_GUIDE_URL));assert.equal(sent[0][1][0].type,'text');
 assert(await entry.handle({...group(),mode:'standby'}));assert(await entry.handle({...direct('使用說明'),replyToken:undefined}));assert.equal(await entry.handle(direct('你好')),false);assert.equal(sent.length,2);
 const failing=createUsageGuideEntry({botUserId:bot,line:{replyLineMessages:async()=>{throw Error('offline')}},logger:{warn(){}}});assert(await failing.handle(group()));
});

import test from 'node:test';import assert from 'node:assert/strict';
import {createXiaoyeSecretary,secretaryCommand} from '../core/xiaoye-secretary.js';
const user='U'+'b'.repeat(32),bot='U'+'a'.repeat(32),group='C'+'c'.repeat(32);
const event=(text,extra={})=>({type:'message',webhookEventId:'fixture-event',timestamp:Date.now(),source:{type:'user',userId:user},message:{id:'fixture-message',type:'text',text},...extra});
test('explicit support commands, native bot mention and mixed-human exclusion',()=>{
 assert.deepEqual(secretaryCommand(event('回報問題：儲存失敗')),{start:true,text:'儲存失敗'});assert.equal(secretaryCommand(event('一般開會討論')),null);
 assert.deepEqual(secretaryCommand(event('@小葉 回報問題：不能儲存',{source:{type:'group',groupId:group,userId:user},message:{type:'text',text:'@小葉 回報問題：不能儲存',mention:{mentionees:[{type:'user',isSelf:true,index:0,length:3,userId:bot}]}}})),{start:true,text:'不能儲存'});
 assert.equal(secretaryCommand(event('回報問題',{message:{type:'text',text:'回報問題',mention:{mentionees:[{type:'user',isSelf:false,userId:user}]}}})),null);
});
test('existing source identity and group membership gate intake; image stays in an explicit active session',async()=>{
 const calls=[];let active=false,valid=true,member=true;const tasks={secretaryCall:async(action,v)=>{calls.push({action,v});if(action==='active')return {active};return {ok:true,handled:true};},meetingShareIdentity:async()=>valid?{account:'fictional',tenantKey:'fixture'}:null,groupServices:async()=>[{key:'fixture'}],resolveTaskGroupIdentity:async()=>member?{}:null};
 const x=createXiaoyeSecretary({tasks,line:{downloadLineContent:async()=>({buffer:new Uint8Array([137,80,78,71]).buffer})},env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot}});
 const image=event('',{message:{type:'image',id:'image'}});assert.equal((await x.capture([event('一般訊息'),image])).length,0);assert.equal(calls.length,0,'ordinary paused/private input performs no secretary lookup');assert.equal((await x.capture([event('回報問題：儲存失敗')])).length,1);assert.equal(calls.at(-1).v.sender.botUserId,bot);
 active=true;assert.equal((await x.capture([image])).length,1);assert(calls.at(-1).v.image.base64);
 valid=false;assert.equal((await x.capture([event('回報問題')])).length,0);valid=true;member=false;assert.equal((await x.capture([event('回報問題',{source:{type:'group',groupId:group,userId:user}})])).length,0);
});
test('notification only sends to current verified recipient, retaining one stable retry key',async()=>{
 const pushes=[],calls=[];let notification={id:'fixture-notice',account:'fictional',expectedUserId:user,lease:'fixture-lease',message:'隔離通知'},recipient={userId:user};let iteration=0;
 const tasks={secretaryCall:async(action,v)=>{calls.push({action,v});if(action==='notifications/claim')return {notification:iteration++===0?notification:null};return {ok:true};},groupServices:async()=>[{key:'fixture'}],meetingShareRecipient:async()=>recipient};
 const x=createXiaoyeSecretary({tasks,line:{pushLineMessage:async(...v)=>{pushes.push(v);return {requestId:'fixture'};}},logger:{warn(){}}});await x.drain();assert.equal(pushes.length,1);assert.equal(pushes[0][0],user);assert.equal(pushes[0][3].retryKey,'xiaoye:fixture-notice');assert.equal(calls.findLast(c=>c.action==='notifications/receipt').v.state,'sent');
 iteration=0;recipient={userId:'U'+'d'.repeat(32)};await x.drain();assert.equal(pushes.length,1);assert.notEqual(calls.findLast(c=>c.action==='notifications/receipt').v.state,'sent');
});

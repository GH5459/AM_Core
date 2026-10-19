import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalCommand, createPortalCommandEntry } from '../core/portal-command-entry.js';
const userId='U'+'1'.repeat(32), groupId='C'+'2'.repeat(32), roomId='R'+'3'.repeat(32), richMenuId='richmenu-'+'a'.repeat(32);
const event=(text,source={type:'user',userId})=>({type:'message',source,message:{type:'text',text},replyToken:'fixture'});
test('exact navigation commands in direct, group and room; natural conversation and existing pending query are untouched',()=>{
 for(const source of [{type:'user',userId},{type:'group',userId,groupId},{type:'room',userId,roomId}])for(const text of ['會議','UOF','uof',' ＵＯＦ '])assert(portalCommand(event(text,source)));
 for(const text of ['待簽','工作日誌','明天會議','安排會議','UOF 核准','會議記錄','<會議>'])assert.equal(portalCommand(event(text)),'');
 for(const source of [{type:'group',groupId},{type:'group',userId,groupId:'bad'},{type:'user',userId,groupId}])assert.equal(portalCommand(event('會議',source)),'');
});
test('meeting uses the current default menu, UOF opens original authenticated web review, no identity in shared buttons',async()=>{
 const replies=[],reads=[];let uri='https://liff.line.me/1234567890-abc/hub';
 const entry=createPortalCommandEntry({line:{lineGet:async p=>{reads.push(p);return p.endsWith('/all/richmenu')?{richMenuId}:{areas:[{action:{type:'uri',label:'會議',uri}}]};},replyLineMessages:async(t,m)=>replies.push(m)},logger:{warn(){}}});
 await entry.handle(event('會議',{type:'group',userId,groupId}));assert.equal(replies[0][0].template.actions[0].uri,uri);assert(!JSON.stringify(replies).includes(userId));
 uri='https://liff.line.me/1234567890-new/hub';await entry.handle(event('會議'));assert.equal(replies.at(-1)[0].template.actions[0].uri,uri);
 const count=reads.length;await entry.handle(event('UOF'));assert.equal(reads.length,count);assert.equal(replies.at(-1)[0].template.actions[0].uri,'https://uof-line.ghotel.tw/Line/Review?openExternalBrowser=1');
 await entry.handle({...event('UOF'),mode:'standby'});await entry.handle({...event('UOF'),replyToken:''});assert.equal(replies.length,3);assert.equal(await entry.handle(event('待簽')),false);
});
test('failed or ambiguous meeting navigation never guesses or leaks provider errors',async()=>{
 for(const areas of [[],[{action:{label:'會議',type:'uri',uri:'javascript:alert(1)'}}],[1,2].map(()=>({action:{label:'會議',type:'uri',uri:'https://example.com'}}))]){
 const replies=[];const entry=createPortalCommandEntry({line:{lineGet:async p=>p.endsWith('/all/richmenu')?{richMenuId}:{areas},replyLineMessages:async(t,m)=>replies.push(m)},logger:{warn(){}}});await entry.handle(event('會議'));assert.equal(replies[0][0].type,'text');assert(!JSON.stringify(replies).includes('http'));
 }
});

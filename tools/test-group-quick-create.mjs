import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-leaf-groups.mjs';
import {quickCreateIntent,extractSelfTask} from '../core/group-quick-create.js';
const bot='U'+'0'.repeat(32),owner='U'+'1'.repeat(32),other='U'+'2'.repeat(32);
const botMessage=(f,text,others=[])=>{const e=f.message(text,[bot,...others]);e.message.mention.mentionees[0].isSelf=true;return e;};
const selfButton=(f,p,...args)=>{const e=f.button(p.id,p.revision,...args);e.postback.data=e.postback.data.replace('groupcal:','grouptask:');return e;};
const draft={title:'整理招募進度',description:'整理本週招募進度',acceptance:'職缺人數清單',dueDate:'2026-10-23',dueAt:null,missing:[]};
function model(f){const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.title?structuredClone(draft):original(input);}
test('explicit direct self task creates without a button, preserves source and deduplicates replay',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.executionDate?{title:'盤點用品',description:'盤點三樓用品',executionDate:'2026-10-14',missing:[]}:original(input);
 const e=botMessage(f,'@葉小蝸 任務 明天盤點三樓用品');Object.assign(e.message.mention.mentionees[0],{index:0,length:4});
 await f.capture(e);await f.drain();assert.equal(f.selfSubmissions.length,1);assert.equal(f.selfSubmissions[0].d.executionDate,'2026-10-14');assert.equal(f.selfSubmissions[0].d.dueDate,'2026-10-16');assert.equal(f.selfSubmissions[0].c,undefined);assert.equal(f.selfSubmissions[0].e.message.text,e.message.text);
 await f.capture(e);f.restart();await f.drain();assert.equal(f.selfSubmissions.length,1);
}finally{await f.close();}});
test('task command can start immediately after the mention without a separator',()=>{
 const e={type:'message',source:{type:'group'},message:{type:'text',text:'@小葉任務明天盤點',mention:{mentionees:[{type:'user',userId:bot,isSelf:true,index:0,length:3}]}}};assert.deepEqual(quickCreateIntent(e,bot),{kind:'selftask',direct:true});
});
test('explicit group task creates one shared task and mentions the sender and recipients',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.executionDate?{title:'盤點用品',description:'共同盤點三樓用品',executionDate:'2026-10-14',missing:[]}:original(input);
 const e=f.message('@甲 @乙 任務 明天盤點三樓用品',[other,'U'+'3'.repeat(32)]);Object.assign(e.message.mention.mentionees[0],{index:0,length:2});Object.assign(e.message.mention.mentionees[1],{index:3,length:2});
 await f.capture(e);await f.drain();assert.equal(f.submissions.length,1);assert.equal(f.submissions[0].p.length,3);assert.equal(f.submissions[0].d.dueDate,'2026-10-16');const notice=f.pushes.find(x=>x.message?.type==='textV2')?.message;assert.equal(Object.keys(notice.substitution).length,3);assert.match(notice.text,/執行日期：2026-10-14/);
 await f.capture(e);f.restart();await f.drain();assert.equal(f.submissions.length,1);
}finally{await f.close();}});
test('reply to original task notice changes the linked task only once',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.executionDate&&input.schema.properties.action?{action:'date',executionDate:'2026-10-15',title:'',description:'',question:''}:input.schema.properties.executionDate?{title:'盤點用品',description:'共同盤點三樓用品',executionDate:'2026-10-14',missing:[]}:original(input);
 const e=f.message('@甲 任務 明天盤點用品',[other]);Object.assign(e.message.mention.mentionees[0],{index:0,length:2});await f.capture(e);await f.drain();const task=(await f.rows()).find(x=>x.directSelfTask);assert(task.noticeMessageId);
 const reply=f.message('改到週四',[],other);reply.message.quotedMessageId=task.noticeMessageId;await f.capture(reply);await f.drain();assert.equal(f.updates.length,1);assert.equal(f.updates[0].change.dueDate,'2026-10-17');
 await f.capture(reply);f.restart();await f.drain();assert.equal(f.updates.length,1);
}finally{await f.close();}});
test('reply to change content receives current task details before merging',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>{if(input.schema.properties.action){const source=JSON.parse(input.userContent);assert.equal(source.existing.description,'共同盤點三樓用品');return {action:'content',executionDate:'',title:'盤點用品及消防設備',description:'共同盤點三樓用品及消防設備',question:''};}return input.schema.properties.executionDate?{title:'盤點用品',description:'共同盤點三樓用品',executionDate:'2026-10-14',missing:[]}:original(input);};
 const e=f.message('@甲 任務 明天盤點用品',[other]);Object.assign(e.message.mention.mentionees[0],{index:0,length:2});await f.capture(e);await f.drain();const task=(await f.rows()).find(x=>x.directSelfTask);
 const reply=f.message('加上消防設備',[],owner);reply.message.quotedMessageId=task.noticeMessageId;await f.capture(reply);await f.drain();assert.equal(f.updates[0].change.description,'共同盤點三樓用品及消防設備');assert.equal(f.updates[0].expectedVersion,1);
}finally{await f.close();}});
test('twenty recipients and the sender are mentioned in separate messages and both notices can be replied to',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.action?{action:'cancel',executionDate:'',title:'',description:'',question:''}:input.schema.properties.executionDate?{title:'盤點 {A}',description:'共同盤點',executionDate:'2026-10-14',missing:[]}:original(input);
 const users=Array.from({length:20},(_,i)=>'U'+(i+100).toString(16).padStart(32,'0'));for(const [i,id] of users.entries()){f.identities.set(id,{account:'colleague-'+i,bindingId:'binding-'+i});f.names.set(id,'同仁'+i);}
 const labels=users.map((_,i)=>'@'+String(i).padStart(2,'0')),text=labels.join(' ')+' 任務 明天盤點',e=f.message(text,users);let offset=0;for(const [i,m] of e.message.mention.mentionees.entries()){m.index=offset;m.length=labels[i].length;offset+=labels[i].length+1;}
 await f.capture(e);await f.drain();const task=(await f.rows()).find(x=>x.directSelfTask),push=f.pushes.find(x=>x.message?.type==='textV2');assert.equal(task.noticeMessageIds.length,2);assert.equal(Object.keys(push.message.substitution).length,20);assert.equal(Object.keys(push.options.additionalMessages[0].substitution).length,1);assert.match(push.message.text,/\{\{A\}\}/);
 const reply=f.message('取消任務',[],owner);reply.message.quotedMessageId=task.noticeMessageIds[1];await f.capture(reply);await f.drain();assert.equal(f.updates.length,1);assert.equal(f.updates[0].change.action,'cancel');
}finally{await f.close();}});
test('if LINE does not return the first notice ID the replacement notice is recorded',async()=>{const f=await fixture();try{
 const originalModel=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.executionDate?{title:'盤點',description:'盤點用品',executionDate:'2026-10-14',missing:[]}:originalModel(input);
 const originalPush=f.options.platform.pushLineMessage;let first=true;f.options.platform.pushLineMessage=async(...args)=>{const result=await originalPush(...args);if(first){first=false;return {messageIds:[],replayed:true};}return result;};
 const e=botMessage(f,'@葉小蝸 任務 明天盤點用品');Object.assign(e.message.mention.mentionees[0],{index:0,length:4});await f.capture(e);await f.drain();const task=(await f.rows())[0];assert.equal(f.selfSubmissions.length,1);assert.equal(f.pushes.length,2);assert.equal(task.noticeMessageIds.length,1);assert.match(f.pushes[1].message.text,/回覆本則訊息/);
}finally{await f.close();}});
test('explicit group task with an unbound recipient is not created',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.executionDate?{title:'盤點',description:'共同盤點',executionDate:'2026-10-14',missing:[]}:original(input);
 f.identities.delete(other);const e=f.message('@甲 任務 明天盤點',[other]);Object.assign(e.message.mention.mentionees[0],{index:0,length:2});await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);
}finally{await f.close();}});
test('direct task asks for missing execution date and creates after a clear supplement',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;let called=0;f.options.llm.completeJson=async input=>input.schema.properties.executionDate?{title:'盤點',description:'盤點用品',executionDate:called++?'2026-10-14':'',missing:called===1?['請提供執行日期']:[]}:original(input);
 const e=botMessage(f,'@葉小蝸 任務 盤點用品');Object.assign(e.message.mention.mentionees[0],{index:0,length:4});await f.capture(e);await f.drain();assert.equal(f.selfSubmissions.length,0);assert.match(JSON.stringify(f.pushes),/任務尚未建立/);
 const extra=f.message('補充任務：明天',[]);await f.capture(extra);await f.drain();assert.equal(f.selfSubmissions.length,1);assert.equal(f.selfSubmissions[0].d.executionDate,'2026-10-14');
}finally{await f.close();}});
test('bot-only explicit self task needs original actor confirmation, survives restart, and cannot be clicked by others/groups',async()=>{const f=await fixture();try{
 model(f);const e=botMessage(f,'@葉小蝸 幫我建立任務：整理本週招募進度，10月23日前完成');assert.equal((await f.capture(e)).length,1);await f.drain();const p=(await f.rows())[0];assert.equal(p.mode,'selftask');assert.equal(p.phase,'confirmation');assert.equal(f.selfSubmissions.length,0);assert.match(JSON.stringify(f.pushes),/建立我的任務/);
 await f.capture(selfButton(f,p,other));await f.drain();assert.equal(f.selfSubmissions.length,0);
 await f.capture(selfButton(f,p,owner,'C'+'5'.repeat(32)));await f.drain();assert.equal(f.selfSubmissions.length,0);
 f.restart();await f.capture(selfButton(f,p));await f.drain();assert.equal(f.selfSubmissions.length,1);assert.equal(f.selfSubmissions[0].p.account,'owner');assert.deepEqual(f.selfSubmissions[0].e,e);assert.equal(f.submissions.length,0);assert.equal(f.writes.size,0);
 await f.capture(e);await f.capture(selfButton(f,p));await f.drain();assert.equal(f.selfSubmissions.length,1);
}finally{await f.close();}});
test('explicit bot meeting uses existing fanout; bot-only meeting visibly selects only organizer',async()=>{const f=await fixture();try{
 for(const peers of [[],[other]]){const e=botMessage(f,'@葉小蝸 幫我們安排會議：明天15:00專案會議',peers);await f.capture(e);await f.drain();const p=(await f.rows()).find(p=>p.phase==='confirmation');const card=f.pushes.filter(x=>x.message.type==='flex').at(-1);if(!peers.length)assert.match(JSON.stringify(card),/僅加入本人/);await f.capture(f.button(p.id));await f.drain();}
 assert.deepEqual(f.attempts.map(x=>x.account),['owner','owner','a']);assert.equal(f.selfSubmissions.length,0);
}finally{await f.close();}});
test('bot-only discussion, typed name, negation, query and @all do not create work',async()=>{const f=await fixture();try{
 for(const text of ['@葉小蝸 要怎麼建立任務？','@葉小蝸 不用建立任務','@葉小蝸 列出我的任務','@葉小蝸 早安'])assert.equal((await f.capture(botMessage(f,text))).length,0);
 const typed=f.message('@葉小蝸 幫我建立任務：整理清單',[]);assert.equal((await f.capture(typed)).length,0);
 const all=botMessage(f,'@葉小蝸 建立會議：明天15:00');all.message.mention.mentionees.push({type:'all'});assert.equal((await f.capture(all)).length,0);assert.equal((await f.rows()).length,0);
}finally{await f.close();}});
test('missing work asks only missing fields; corrections invalidate old cards without renewing timeout',async()=>{const f=await fixture();try{
 let count=0;f.options.llm.completeJson=async()=>({...draft,...count++?{}:{title:'',description:'',missing:['請補充具體工作內容。']}});
 await f.capture(botMessage(f,'@葉小蝸 幫我建立任務'));await f.drain();let p=(await f.rows())[0];assert(p.prepared.missing.length);assert(!JSON.stringify(f.pushes).includes('grouptask:confirm'));
 f.advance(1000);await f.capture(f.message('補充任務：整理本週招募進度',[]));await f.drain();const next=(await f.rows()).find(x=>x.id===p.id);assert.equal(next.revision,2);assert.equal(next.confirmationStartedAt,p.confirmationStartedAt);assert.equal(next.prepared.missing.length,0);
 await f.capture(selfButton(f,p));await f.drain();assert.equal(f.selfSubmissions.length,0);f.advance(600000);await f.capture(selfButton(f,next));await f.drain();assert.equal(f.selfSubmissions.length,0);assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');
}finally{await f.close();}});
test('identity change, source removal and cancellation never submit own task',async()=>{const f=await fixture();try{
 model(f);await f.capture(botMessage(f,'@葉小蝸 建立自己的任務：整理清單'));await f.drain();const p=(await f.rows())[0];f.identities.set(owner,{account:'different',bindingId:'changed'});await f.capture(selfButton(f,p));await f.drain();assert.equal(f.selfSubmissions.length,0);
}finally{await f.close();}});
test('calendar and self draft date validation preserves date-only precision and rejects impossible clock',async()=>{
 const llm={available:true,completeJson:async()=>({...draft,dueAt:'2026-10-23T25:00:00+08:00'})};const p=await extractSelfTask({text:'10月23日前完成',at:Date.now(),llm});assert(p.missing.length);
 llm.completeJson=async()=>({...draft,dueDate:null,dueAt:null});const optional=await extractSelfTask({text:'x',at:Date.now(),llm});assert.equal(optional.missing.length,0);assert.equal(optional.draft.dueAt,null);
 assert.equal(quickCreateIntent({type:'message',source:{type:'group'},message:{type:'text',text:'建立任務',mention:{mentionees:[]}}},bot),null);
});

test('own-task cancellation and archived source withdrawal block later clicks and restart',async()=>{for(const kind of ['cancel','unsend']){const f=await fixture();try{model(f);const e=botMessage(f,'@葉小蝸 幫我建立任務：整理清單');await f.capture(e);await f.drain();const p=(await f.rows())[0];if(kind==='cancel')await f.capture(selfButton(f,p,owner,undefined,'cancel'));else await f.capture({type:'unsend',webhookEventId:'withdrawal',timestamp:f.options.now(),source:e.source,unsend:{messageId:e.message.id}});await f.drain();f.restart();await f.capture(selfButton(f,p));await f.drain();assert.equal(f.selfSubmissions.length,0);}finally{await f.close();}}});

test('relative deadline ambiguity is never silently erased as an optional field',async()=>{const llm={available:true,completeJson:async()=>({...draft,dueDate:null,dueAt:null,missing:['請確認下週的確切截止日期。']})};const p=await extractSelfTask({text:'幫我建立任務：整理資料，下週完成',at:Date.now(),llm});assert.equal(p.missing.length,1);});

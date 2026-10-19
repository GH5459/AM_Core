import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-leaf-groups.mjs';
import {quickCreateIntent,extractSelfTask} from '../core/group-quick-create.js';
const bot='U'+'0'.repeat(32),owner='U'+'1'.repeat(32),other='U'+'2'.repeat(32);
const botMessage=(f,text,others=[])=>{const e=f.message(text,[bot,...others]);e.message.mention.mentionees[0].isSelf=true;return e;};
const selfButton=(f,p,...args)=>{const e=f.button(p.id,p.revision,...args);e.postback.data=e.postback.data.replace('groupcal:','grouptask:');return e;};
const draft={title:'整理招募進度',description:'整理本週招募進度',acceptance:'職缺人數清單',dueDate:'2026-10-23',dueAt:null,missing:[]};
function model(f){const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>input.schema.properties.title?structuredClone(draft):original(input);}
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEvents,prepareEvent,preview,calendarCandidate} from '../core/leaf-calendar/extract.js';
import {explicitCalendarRequest} from '../core/leaf-calendar/date-intent.js';
test('活動 and 會議 are equivalent commands and ordinary meeting questions stay questions',()=>{
 for(const text of ['活動：明天討論計畫','活動 明天討論計畫','會議：明天討論計畫','會議 明天討論計畫'])assert.equal(explicitCalendarRequest(text),true,text);
 for(const text of ['會議 如何安排？','會議紀錄：已完成'])assert.equal(explicitCalendarRequest(text),false,text);
});
test('meeting flow and preparation survive summarization in calendar content',async()=>{
 const text='會議：10/30 11:00 討論策略\n【會前準備】整理困境\n【當天會議流程】討論一小時';
 const llm={available:true,completeJson:async()=>({events:[{topic:'策略',date:'2026-10-30',time:'11:00',location:'總部',content:'討論策略'}]})};
 const [event]=await extractEvents({text,at:Date.parse('2026-10-29T00:00:00Z'),llm,groupInvitation:true});assert.match(event.content,/【會前準備】整理困境/);assert.match(event.content,/【當天會議流程】/);
});
test('activity command triggers clarification without complete date, while a usage question does not',()=>{
 assert.equal(calendarCandidate('活動：下週碰面'),true);assert.equal(calendarCandidate('活動明天討論'),true);assert.equal(calendarCandidate('活動：怎麼建立活動？'),false);
});
test('agenda remains in calendar content even when the model summarizes it',async()=>{
 const text='活動 2026年11月3日 15:00 台北會議室\n議程：\n1. 預算\n2. 三樓設備';
 const llm={available:true,completeJson:async()=>({events:[{topic:'預算會議',date:'2026-11-03',time:'15:00',location:'台北會議室',content:'討論預算'}]})};
 const [event]=await extractEvents({text,at:Date.parse('2026-10-29T00:00:00Z'),llm,groupInvitation:true});const prepared=prepareEvent(event,'fixture');
 assert.ok(prepared.event.content.includes('1. 預算\n2. 三樓設備'));assert.equal(prepared.event.durationMinutes,60);
});
test('long agenda is not truncated in calendar payload but preview indicates shortened display',()=>{
 const content='議程：'+('資料'.repeat(1500));const p=prepareEvent({topic:'會議',date:'2026-11-03',time:'15:00',location:'辦公室',content},'fixture');
 assert.equal(p.event.content,content);assert.match(JSON.stringify(preview({request_id:'f'.repeat(48),revision:1,payload:p})),/完整內容會保留至行事曆/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import lunar from '../core/leaf-calendar/lunar.cjs';
import recurrence from '../core/leaf-calendar/recurrence.cjs';
import {calendarCandidate,extractEvents,prepareEvent,preview} from '../core/leaf-calendar/extract.js';
const text='請幫我建一個活動：\n活動名稱：家族紀念日\n時間設定：每年農曆 10 月 17 日（國曆 11 月 25 日，請按農曆設定每年重複）\n備忘：回家團聚';
const at=Date.parse('2026-10-19T12:00:00+08:00');
test('spaces/full width dates and incomplete explicit requests always enter processing',()=>{
 for(const value of [text,'活動名稱：測試\n日期：2026 年 11 月 25 日\n時間：20:00','幫我建立活動','幫我新增行程：１１ 月 ２５ 日 全天 紀念日'])assert.equal(calendarCandidate(value),true);
 assert.equal(calendarCandidate('查詢今天行事曆'),false);assert.equal(calendarCandidate('早安'),false);
});
test('lunar anniversary remains lunar, all-day and original content; years use different Gregorian dates',async()=>{
 const [e]=await extractEvents({text,at,llm:{available:true,completeJson:async()=>{throw Error('lunar dates must not be guessed by AI');}}});const p=prepareEvent(e,'fixture');
 assert.deepEqual(p.missing,[]);assert.equal(p.event.date,'2026-11-25');assert.equal(p.event.allDay,true);assert.equal(p.event.content,'回家團聚');assert.equal(p.event.time,undefined);assert.equal(p.defaultDuration,false);
 const dates=lunar.lunarOccurrences(p.event.recurrence,p.event.date);assert.equal(dates[1],'2027-11-14');assert.equal(dates.length,75);for(const date of dates){const l=lunar.lunarParts(date);assert.equal(l.month,10);assert.equal(l.day,17);assert.equal(l.leapMonth,false);}
 const lines=recurrence.recurrenceLines(p.event.recurrence,p.event.date,{allDay:true});assert.match(lines[0],/^RDATE;VALUE=DATE:20261125,20271114,/);assert(!lines[0].includes('RRULE'));assert.match(JSON.stringify(preview({request_id:'a'.repeat(48),revision:1,payload:p})),/全天/);assert.match(JSON.stringify(preview({request_id:'a'.repeat(48),revision:1,payload:p})),/2100/);
 const [next]=await extractEvents({text:text.replace('10 月 17 日','十月十七'),at:Date.parse('2026-11-26T00:00:00+08:00')});assert.equal(next.date,'2027-11-14');
});
test('lunar conversion handles leap months and absent day30 without replacing dates',()=>{
 assert.equal(lunar.lunarToSolar(2023,2,1,true),'2023-03-22');assert.equal(lunar.lunarToSolar(2023,2,1,false),'2023-02-20');assert.equal(lunar.lunarToSolar(2024,2,1,true),null);
 const dates=lunar.lunarOccurrences({calendar:'chinese',frequency:'YEARLY',month:2,day:1,leapMonth:true,throughYear:2030},'2023-03-22');assert(dates.length>=1);for(const d of dates)assert.equal(lunar.lunarParts(d).leapMonth,true);
 assert.throws(()=>recurrence.recurrenceLines({calendar:'chinese',frequency:'YEARLY',month:10,day:17},'2026-11-26',{allDay:true}));
});
test('unsupported lunar conditions block with explanation; never become fixed Gregorian',async()=>{
 for(const phrase of ['每年農曆 十三 月 十七 日 忌日','每隔兩年農曆十月十七忌日','每年農曆十月十七忌日，截止2030年','每年農曆明天 忌日']){const [e]=await extractEvents({text:'請幫我建立活動：'+phrase,at});assert(prepareEvent(e,'x').missing.length,phrase);}
});
test('all-day Gregorian yearly and bounded until use date-only recurrence',async()=>{
 const p=prepareEvent({topic:'週年',date:'2026-11-25',allDay:true,recurrence:{frequency:'YEARLY',until:'2030-11-25'}},'x');assert.equal(p.missing.length,0);assert.equal(p.event.time,undefined);assert.deepEqual(recurrence.recurrenceLines(p.event.recurrence,p.event.date,{allDay:true}),['RRULE:FREQ=YEARLY;INTERVAL=1;UNTIL=20301125']);
 assert(prepareEvent({date:'2026-11-25',allDay:true,time:'10:00'},'x').missing.length);
});

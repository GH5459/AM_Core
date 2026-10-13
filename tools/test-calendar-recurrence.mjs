import test from 'node:test';
import assert from 'node:assert/strict';
import recurrence from '../core/leaf-calendar/recurrence.cjs';
import {calendarCandidate,extractEvents,prepareEvent,preview} from '../core/leaf-calendar/extract.js';
const text='請幫我設定一個固定活動：每個禮拜二晚上 8 點到 9 點，活動名稱是「範例家族線上聊天」。';
test('weekday aliases and deterministic upcoming weekly dates including midnight/year rollover',async()=>{
 for(const label of ['每個禮拜二','每週二','每個星期二'])assert.equal(calendarCandidate(text.replace('每個禮拜二',label)),true);
 for(const [at,date] of [['2026-10-13T19:59:00+08:00','2026-10-13'],['2026-10-13T20:00:00+08:00','2026-10-20'],['2026-12-31T23:00:00+08:00','2027-01-05']]){
  const [event]=await extractEvents({text,at:Date.parse(at)});assert.equal(event.date,date);assert.equal(event.time,'20:00');assert.equal(event.endTime,'21:00');assert.equal(event.topic,'範例家族線上聊天');
  const p=prepareEvent(event,'fixture');assert.deepEqual(p.missing,[]);assert.deepEqual(p.event.recurrence,{frequency:'WEEKLY',interval:1,weekdays:['TU']});assert.match(JSON.stringify(preview({request_id:'a'.repeat(48),revision:1,payload:p})),/每週 星期二/);
 }
});
test('Google native recurrence uses Taipei timezone, inclusive until and bounded count',()=>{
 const {recurrenceLines,normalizeRecurrence}=recurrence;
 assert.deepEqual(recurrenceLines({frequency:'WEEKLY',weekdays:['TU']},'2026-10-13'),['RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU']);
 assert.deepEqual(recurrenceLines({frequency:'DAILY',interval:2,count:4},'2026-10-13'),['RRULE:FREQ=DAILY;INTERVAL=2;COUNT=4']);
 assert.deepEqual(recurrenceLines({frequency:'MONTHLY',until:'2027-02-28'},'2026-10-31'),['RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20270228T155959Z']);
 assert.deepEqual(normalizeRecurrence({frequency:'WEEKLY',weekdays:['FR','TU']},'2026-10-13').weekdays,['TU','FR']);
 for(const r of [{frequency:'HOURLY'},{frequency:'WEEKLY',weekdays:['MO']},{frequency:'WEEKLY',weekdays:[]},{frequency:'DAILY',interval:0},{frequency:'DAILY',count:0},{frequency:'DAILY',until:'2026-02-30'},{frequency:'DAILY',until:'2026-10-12'},{frequency:'DAILY',until:'2026-12-31',count:4},{frequency:'DAILY',weekdays:['TU']},{frequency:'DAILY',rrule:'malicious'}])assert.throws(()=>recurrenceLines(r,'2026-10-13'));
});
test('AI retains rich recurrence; vague recurrence and lost ending cannot silently become one-off/unbounded',async()=>{
 const base={topic:'測試',date:'2026-10-13',time:'20:00',endTime:'21:00',location:'',content:''};
 const llm=event=>({available:true,completeJson:async args=>{assert.match(args.system,/支援 DAILY/);assert.ok(args.schema.properties.events.items.properties.recurrence);return {events:[event]};}});
 const [weekly]=await extractEvents({text,at:Date.parse('2026-10-13T21:00:00+08:00'),llm:llm(base)});assert.equal(weekly.date,'2026-10-20');assert.equal(prepareEvent(weekly,'x').missing.length,0);
 const [unknown]=await extractEvents({text:'幫我設定固定活動，20:00',at:Date.now(),llm:llm(base)});assert.ok(prepareEvent(unknown,'x').missing.length);
 const [bounded]=await extractEvents({text:'每週二晚上8點到9點，截止12月31日',at:Date.now(),llm:llm(base)});assert.ok(prepareEvent(bounded,'x').missing.length);
 const [monthly]=await extractEvents({text:'每月13日晚上8點開會，總共4次',at:Date.now(),llm:llm({...base,recurrence:{frequency:'MONTHLY',count:4}})});assert.deepEqual(prepareEvent(monthly,'x').event.recurrence,{frequency:'MONTHLY',interval:1,count:4});
});

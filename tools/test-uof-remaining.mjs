import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUrgency,URGENCY_POLICY} from '../versions/AM-IMP-2026.1027.04/urgency.mjs';
const u=createUrgency(),now=Date.parse('2026-10-27T16:00:00+08:00');
const item=(level,age)=>({urgentLevel:level,nodeStartedAt:new Date(now-age*3600000).toISOString()});
test('24 / 48 / 72 exact hours; no calendar-day rounding',()=>{
 for(const [level,age,color]of [[0,0,'red'],[0,23.9,'red'],[1,0,'orange'],[1,23.999,'orange'],[1,24,'red'],[2,0,'green'],[2,23.999,'green'],[2,24,'orange'],[2,48,'red']])assert.equal(u.evaluate(item(level,age),now).color,color);
 assert.equal(u.evaluate(item(0,0),now).dueAt,'2026-10-28T08:00:00.000Z');
});
test('due now distinct from overdue; overdue remains red',()=>{const due=u.evaluate(item(2,72),now);assert.equal(due.label,'已到期，請立即處理');assert.equal(due.overdue,false);const late=u.evaluate(item(2,80),now);assert.equal(late.label,'已逾期 8 小時');assert.equal(late.color,'red');assert(late.overdue);});
test('unknown and future values never become safe green',()=>{for(const i of [{},{urgentLevel:null,nodeStartedAt:item(2,0).nodeStartedAt},item(-1,0),item(3,0),item('2',0),item(2,-1),{urgentLevel:2,nodeStartedAt:'2026-10-27T08:00:00'},{urgentLevel:2,nodeStartedAt:'invalid'}])assert.equal(u.evaluate(i,now).color,'unknown');});
test('millisecond boundaries and different timezone offsets',()=>{const start='2026-10-27T00:00:00+08:00';const i={urgentLevel:2,nodeStartedAt:start},boundary=Date.parse(start)+24*3600000;assert.equal(u.evaluate(i,boundary-1).color,'green');assert.equal(u.evaluate(i,boundary).color,'orange');assert.equal(u.evaluate(i,boundary+24*3600000).color,'red');assert.equal(u.evaluate({...i,nodeStartedAt:'2026-10-26T16:00:00Z'},boundary).dueAt,u.evaluate(i,boundary).dueAt);});
test('counts partition cases; overdue subset; approved excluded',()=>{const items=[item(0,40),item(0,1),item(1,1),item(2,1),{}, {...item(2,80),uiStatus:'approved'}];const c=u.counts(items,now);assert.deepEqual([c.red,c.orange,c.green,c.unknown,c.overdue],[2,1,1,1,1]);assert.equal(c.red+c.orange+c.green+c.unknown,5);assert.equal(c.nearestDueAt,u.evaluate(items[0],now).dueAt);});
test('sort old overdue, nearest deadline, unknown then approved',()=>{const items=[{...item(2,1),taskId:'green'},{taskId:'unknown'},{...item(0,30),taskId:'late'},{...item(1,30),taskId:'red'},{...item(0,40),taskId:'older'},{...item(0,90),taskId:'done',uiStatus:'approved'}];assert.deepEqual(items.sort((a,b)=>u.compare(a,b,now)).map(i=>i.taskId),['older','late','red','green','unknown','done']);});
test('factory is self contained for both original clients',()=>{const browser=Function('return ('+createUrgency.toString()+')()')();assert.deepEqual(browser.evaluate(item(1,30),now),u.evaluate(item(1,30),now));assert.equal(URGENCY_POLICY,'uof-remaining-hours-v1');});

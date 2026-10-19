import assert from 'node:assert/strict';
import vm from 'node:vm';
import {meetingDueDate} from '../modules/meetings/workspace-schedule.js';
import {checkField,initialFields,MEETING_TYPES} from '../modules/meetings/workspace-model.js';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
const settings=(date,frequency,extra={})=>({...initialFields({timestamp:Date.parse(date)}).settings,date,cycle:{frequency,intervalDays:7,nextDate:'',...extra}});
const browser=vm.runInNewContext('('+meetingDueDate.toString()+')');
for(const [date,frequency,extra,expected] of [
 ['2026-10-19','daily',{},'2026-10-19'],
 ['2026-10-19','weekly',{},'2026-10-25'],
 ['2026-12-28','weekly',{},'2027-01-03'],
 ['2026-10-19','monthly',{},'2026-11-18'],
 ['2026-01-31','monthly',{},'2026-02-27'],
 ['2028-01-31','monthly',{},'2028-02-28'],
 ['2026-12-31','monthly',{},'2027-01-30'],
 ['2026-10-19','custom',{intervalDays:14},'2026-11-01'],
 ['2026-10-19','custom',{intervalDays:1},'2026-10-19'],
 ['2026-10-19','weekly',{nextDate:'2026-10-29'},'2026-10-28'],
 ['2026-10-19','none',{},'fallback'],
 ]){
 const s=settings(date,frequency,extra);checkField('settings',s);
 assert.equal(meetingDueDate(s,'fallback'),expected);assert.equal(browser(s,'fallback'),expected,'Browser and server use identical dates');
}
assert.equal(meetingDueDate({...settings('2026-10-19','weekly'),type:'電話'},'fallback'),'fallback');
assert.equal(meetingDueDate({type:'會議',date:'2026-10-19'},'legacy'),'legacy');
assert.deepEqual(MEETING_TYPES.map(t=>t.name),['工作會議','電話','討論','主題研討']);
for(const cycle of [null,[],{frequency:'unknown',intervalDays:7,nextDate:''},{frequency:'custom',intervalDays:0,nextDate:''},{frequency:'custom',intervalDays:366,nextDate:''},{frequency:'custom',intervalDays:1.5,nextDate:''},{frequency:'weekly',intervalDays:7,nextDate:'2026-10-19'},{frequency:'monthly',intervalDays:7,nextDate:'2026-02-30'}])assert.throws(()=>checkField('settings',{...settings('2026-10-19','weekly'),cycle}));
const html=workspaceHtml({id:'a'.repeat(64),liffId:'fixture'});for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
assert(html.includes('id="frequency"')&&html.includes('id="nextDate"')&&html.includes('id="duePreview"'));

process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
const actor={id:f.event.source.userId,name:'主持人'},oldIds=[...f.taskIds];
for(const [frequency,expected,extra] of [['weekly','2026-10-25',{}],['monthly','2026-11-18',{}],['custom','2026-11-01',{intervalDays:14}],['weekly','2026-10-28',{nextDate:'2026-10-29'}]]){
 const event={...f.event,message:{id:'cycle-fixture-'+frequency+expected,type:'audio'}};
 let r=await f.service.offer(f.row,event,'synthetic.m4a',actor.name);
 await f.service.choice({source:event.source,postback:{data:'meetingwork:yes:'+r.id}},f.row.key);
 r=await f.service.store.edit(r.id,actor,{field:'settings',value:{...settings('2026-10-19',frequency,extra),topic:'週期合成測試'},version:0});
 await f.service.store.transition(r.id,actor,'start',Number(r.revision));await f.service.drain();await f.service.settle();
 r=await f.service.store.get(r.id);assert.equal(r.state,'review');const key=Object.keys(r.fields).find(k=>k.startsWith('todo:'));assert.equal(r.fields[key].due,expected);
 r=await f.service.store.edit(r.id,actor,{field:key,value:{...r.fields[key],due:'2027-02-01'},version:1});
 assert.equal(r.fields[key].due,'2027-02-01');assert.equal((await f.service.store.get(r.id)).fields[key].due,'2027-02-01','Manual override survives reload');
}
assert.deepEqual([...f.taskIds],oldIds,'Generating scheduled candidates never creates or modifies existing work tasks');
await f.pg.close();
console.log('Meeting schedule passed: daily/weekly/monthly/custom dates, month-end/leap-year/year rollover, next-date override, invalid settings, browser/server parity, real generation, manual date preservation and no existing-task writes.');

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),source=readFileSync(new URL('../versions/AM-IMP-2026.1028.06/hub-entry.js',import.meta.url),'utf8'),build=require('../versions/AM-IMP-2026.1028.06/build.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(api){
 const dom=new JSDOM('<section id="newPanel" hidden><h2>預排會議</h2><form id="form"><select id="source"><option value=""></option><option value="private">個人</option></select><input id="topic"><input id="start"><input id="end"><input id="location"><input id="calendar" type="checkbox"><button id="create">建立</button></form></section>');
 const w=dom.window,$=selector=>w.document.querySelector(selector),setup=async()=>{w.dailylogMeetingSources=[{kind:'user',key:'private'}];};
 const install=new Function('window','document','$','api','setup','calendarMode','crypto',`let calendarRef='',operationId='';${source};return ()=>calendarRef;`);const getRef=install(w,w.document,$,api,setup,()=>{},crypto);return {w,$,getRef};
}
test('the form appears immediately and stays visible while calendar verification waits',async()=>{
 let finish;const gate=new Promise(resolve=>{finish=resolve;}),events=[];const f=fixture(async v=>{events.push(v.action);return gate;});
 f.w.dailylogCalendarEntry({id:'event-1',date:'2026-10-29',topic:'示例會議',start:'2026-10-29T09:00:00+08:00',end:'2026-10-29T10:00:00+08:00'});
 assert.equal(f.$('#newPanel').hidden,false);assert.equal(f.$('#topic').value,'示例會議');assert.equal(f.$('#create').disabled,true);assert.equal(f.$('#source').disabled,true);assert.equal(f.$('#form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true})),false);assert.deepEqual(events,['calendar-week']);
 finish({items:[{id:'event-1',topic:'已核對會議',start:'2026-10-29T09:00:00+08:00',end:'2026-10-29T10:00:00+08:00',calendarRef:'signed-ref'}]});await tick();
 assert.equal(f.$('#newPanel').hidden,false);assert.equal(f.$('#topic').value,'已核對會議');assert.equal(f.$('#create').disabled,false);assert.equal(f.$('#source').value,'private');assert.equal(f.getRef(),'signed-ref');assert.deepEqual(events,['calendar-week']);f.w.close();
});
test('missing or unavailable calendar event leaves the form open and provides a safe retry',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return calls===1?{items:[]}:{items:[{id:'e',topic:'活動',start:'2026-10-29T09:00:00+08:00',end:'2026-10-29T10:00:00+08:00',calendarRef:'signed'}]};});
 f.w.dailylogCalendarEntry({id:'e',date:'2026-10-29',topic:'活動'});await tick();assert.equal(f.$('#newPanel').hidden,false);assert.equal(f.$('#create').disabled,true);assert.match(f.$('[role=status]').textContent,/行程已變更/);const retry=[...f.w.document.querySelectorAll('button')].find(x=>x.textContent==='重新核對行程');assert(!retry.hidden);retry.click();await tick();assert.equal(f.$('#create').disabled,false);assert.equal(f.getRef(),'signed');assert.equal(calls,2);f.w.close();
});
test('the update keeps unrelated existing interface changes and compiles as browser code',()=>{
 const native=require('../versions/AM-IMP-2026.1028.04/build.cjs').clientSource();const compact=native.replace('root.append(head,body);','root.append(head,body);/* existing compact interface */');const updated=build.patchClient(compact);assert(updated.includes('/* existing compact interface */'));assert(updated.includes('pendingCalendar.set(path,value);open(path)'));assert.doesNotThrow(()=>new Function(updated));assert.throws(()=>build.patchClient('unexpected previous client'));
});

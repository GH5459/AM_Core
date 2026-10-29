import test from 'node:test';
import assert from 'node:assert/strict';
import {taskDates,matchesExplicitDate} from '../core/line-task-dates.mjs';
import {extractDirectSelfTask} from '../core/group-quick-create.js';
import {createLineSelfTask,DIRECT_SELF_TASK_CONTRACT} from '../core/line-self-task-worker.mjs';

test('deadline includes weekends and crosses years',()=>{
  assert.deepEqual(taskDates('2026-10-30',Date.parse('2026-10-29T08:00:00Z')),{executionDate:'2026-10-30',dueDate:'2026-11-01',dueAt:'2026-11-01T23:59:00+08:00'});
  assert.equal(taskDates('2026-12-31',Date.parse('2026-12-30T08:00:00Z')).dueDate,'2027-01-02');
});
test('direct task extracts execution date and requires missing information',async()=>{
 const at=Date.parse('2026-10-29T08:00:00Z');
 const llm={available:true,completeJson:async()=>({title:'盤點',description:'盤點三樓用品',executionDate:'2026-10-30',missing:[]})};
 const result=await extractDirectSelfTask({text:'任務 明天盤點三樓用品',at,llm});
 assert.equal(result.draft.executionDate,'2026-10-30');assert.equal(result.draft.dueDate,'2026-11-01');assert.deepEqual(result.missing,[]);
 assert.ok((await extractDirectSelfTask({text:'任務 盤點用品',at,llm})).missing.length);
 llm.completeJson=async()=>({title:'盤點',description:'盤點用品',executionDate:'',missing:[]});
 assert.ok((await extractDirectSelfTask({text:'任務 盤點用品',at,llm})).missing.length);
});
test('Taiwan date and invalid dates are enforced',()=>{
  assert.throws(()=>taskDates('2026-10-28',Date.parse('2026-10-28T16:00:00Z')),/execution_date_in_past/);
  assert.throws(()=>taskDates('2026-02-30',Date.parse('2026-01-01T00:00:00Z')),/invalid_execution_date/);
});
test('explicit date must agree with message rather than model guess',()=>{
 const at=Date.parse('2026-12-31T09:00:00Z');assert.equal(matchesExplicitDate('下週一執行',at,'2027-01-04'),true);assert.equal(matchesExplicitDate('下週一執行',at,'2027-01-11'),false);
 assert.equal(matchesExplicitDate('12月30日執行',at,'2027-12-30'),false);assert.equal(matchesExplicitDate('1月2日及1月3日執行',at,'2026-01-02'),false);
 const october=Date.parse('2026-10-29T00:00:00Z');assert.equal(matchesExplicitDate('11月3日執行，11月5日截止',october,'2026-11-03'),true);assert.equal(matchesExplicitDate('11月3日執行，11月6日截止',october,'2026-11-03'),false);
});
test('direct worker rejects a deadline that does not match the execution date',async()=>{
 const at=Date.parse('2026-10-29T08:00:00Z'), user='U'+'1'.repeat(32);
 const value={contract:DIRECT_SELF_TASK_CONTRACT,id:'a'.repeat(64),botUserId:'U'+'0'.repeat(32),actor:{userId:user,account:'111',bindingId:'binding'},source:{groupId:'C'+'2'.repeat(32),messageId:'msg',eventId:'event',text:'任務 明天盤點',timestamp:at},revision:1,draft:{title:'盤點',description:'盤點',acceptance:'',executionDate:'2026-10-30',dueDate:'2026-11-05',dueAt:'2026-11-05T23:59:00+08:00'}};
 await assert.rejects(createLineSelfTask(value,{DB:{}},{now:()=>at}),e=>e.code==='INVALID_DUE_DATE');
});

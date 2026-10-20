import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the shipped handler with radio-group semantics: checking a later radio
// unchecks the earlier one, including copies of the same employee.
test('clicking either department copy keeps that exact row checked',()=>{
 const fragment=fs.readFileSync(new URL('../versions/AM-IMP-2026.1020.30/dailylog/personal-completion-ui.fragment.js',import.meta.url),'utf8');
 const body=fragment.match(/node\.addEventListener\('change',e=>\{([\s\S]*?)\}\);/)[1];
 const people=[{account:'synthetic-a',name:'Synthetic A'},{account:'synthetic-b',name:'Synthetic B'}];
 const radios=[];let current=null;
 for(const value of ['synthetic-a','synthetic-b','synthetic-a'])radios.push({name:'personalRecipient',value,closest:()=>true,get checked(){return current===this;},set checked(v){if(v)current=this;else if(current===this)current=null;}});
 const status={},next={disabled:true};const node={querySelectorAll:()=>radios,querySelector:()=>status};
 const ctx=vm.createContext({people,node,next,selected:null,treeSelection:null,e:null});
 for(const radio of [radios[0],radios[2],radios[1]]){
  radio.checked=true;ctx.e={target:radio};vm.runInContext('(function(){'+body+'})()',ctx);
  assert.equal(current,radio);assert.equal(ctx.selected,radio.value);assert.equal(ctx.treeSelection,radio);
  assert.equal(radios.filter(r=>r.checked).length,1);assert.equal(next.disabled,false);
  assert(status.textContent.includes(radio.value));
 }
});

test('delivered response embeds the reviewed picker and explicit revision marker',async()=>{
 const {personalCompletionResponse}=await import('../versions/AM-IMP-2026.1020.30/dailylog/line-personal-completion-response.mjs');
 const fragment=fs.readFileSync(new URL('../versions/AM-IMP-2026.1020.30/dailylog/personal-completion-ui.fragment.js',import.meta.url),'utf8');
 const source=" function rowSummary(task){ function bindCard(){function lineReportButton(t){const job={task:structuredClone(task),packet,fields,state:'saving'};toast('任務資料已儲存。');return true;";
 const response=await personalCompletionResponse(new Request('https://example.test/tasks.js'),new Response(source));
 assert.equal(response.status,200);assert.equal(response.headers.get('X-DailyLog-Recipient-Selection'),'clicked-row-v2');
 assert((await response.text()).includes(fragment));
});

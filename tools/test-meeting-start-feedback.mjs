import test from 'node:test';
import assert from 'node:assert/strict';
import {meetingStartFeedback} from '../modules/meetings/workspace-start-feedback.js';
function setup(overrides={}){
 const button={},status={},checkButton={};let state='setup',busy=false,calls=0,reads=0;
 const c=meetingStartFeedback({button,status,checkButton,beforeStart:async()=>{},start:async()=>{calls++;return {state:'processing'};},read:async()=>{reads++;return {state:'setup'};},onData:v=>{state=v.state;},getState:()=>state,isBusy:()=>busy,setBusy:v=>{busy=v;},report:()=>{},...overrides});
 return {c,button,status,checkButton,calls:()=>calls,reads:()=>reads};
}
test('pending submission immediately reports progress and duplicate clicks do not submit twice',async()=>{
 let resolve,calls=0;const a=setup({start:()=>{calls++;return new Promise(r=>{resolve=r;});}});
 const first=a.c.submit();assert.match(a.status.textContent,/正在/);assert.equal(a.button.disabled,true);
 await Promise.resolve();await a.c.submit();assert.equal(calls,1);
 resolve({state:'processing'});await first;assert.match(a.status.textContent,/已受理/);
});
test('settings failure does not submit and explains the failure beside the button',async()=>{
 const a=setup({beforeStart:async()=>{throw Error('請填寫會議主題');}});
 await a.c.submit();assert.equal(a.calls(),0);assert.equal(a.status.textContent,'請填寫會議主題');assert.equal(a.button.disabled,false);
});
test('unknown response blocks resubmission and recovery reads status without another start',async()=>{
 let starts=0,reads=0;const a=setup({start:async()=>{starts++;throw TypeError('network');},read:async()=>{reads++;return {state:'processing'};}});
 await a.c.submit();assert.equal(a.button.disabled,true);assert.equal(a.checkButton.hidden,false);assert.match(a.status.textContent,/不要重送/);
 await a.c.submit();assert.equal(starts,1);await a.c.check();assert.equal(starts,1);assert.equal(reads,1);assert.match(a.status.textContent,/已受理/);
});
test('failed recovery stays locked; a confirmed setup state allows a separate explicit retry',async()=>{
 let failures=true;const a=setup({start:async()=>{throw Error('lost');},read:async()=>{if(failures)throw Error('offline');return {state:'setup'};}});
 await a.c.submit();await a.c.check();assert.equal(a.button.disabled,true);
 failures=false;await a.c.check();assert.equal(a.button.disabled,false);assert.match(a.status.textContent,/尚未開始/);
});
test('a definite request rejection remains actionable and does not claim acceptance',async()=>{
 const a=setup({start:async()=>{throw Object.assign(Error('沒有整理資格'),{status:403});}});
 await a.c.submit();assert.equal(a.status.textContent,'沒有整理資格');assert.equal(a.button.disabled,false);
});
test('capture-phase preconditions have a nearby error without starting or changing data',()=>{
 const a=setup();a.c.guard('請先保存錄音');assert.equal(a.status.textContent,'請先保存錄音');assert.equal(a.calls(),0);assert.equal(a.reads(),0);
});
test('an unfamiliar state cannot be mistaken for an accepted submission',async()=>{
 const a=setup({start:async()=>({state:'unexpected'})});await a.c.submit();
 assert.equal(a.button.disabled,true);assert.match(a.status.textContent,/尚未確認/);
});import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
import vm from 'node:vm';
test('rendered workspace carries valid embedded controller and adjacent status controls',()=>{
 const h=workspaceHtml({id:'isolated'});
 for(const x of h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(x[1]);
 assert.ok(h.includes('id="startStatus"'));assert.ok(h.includes('id="checkStart"'));
 assert.ok(h.includes('const meetingStartFeedback='));
});

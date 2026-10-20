import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
const todo='todo:11111111-1111-4111-8111-111111111111', block='a'.repeat(32),record='record:'+block;
const clone=structuredClone;
async function fixture(){
 const fields={settings:{topic:'合成版本同步測試',date:'2026-10-20',speakers:[]},record:'原始段落',transcript:'原始逐字稿',[todo]:{content:'合成待辦',ownerId:'',due:'2026-10-25',evidence:'合成依據'}};
 let state={ok:true,access:'member',host:true,canEdit:true,actor:{id:'synthetic',name:'合成主持人'},types:[],sharing:{enabled:false,people:[],version:0},workspace:{state:'review',revision:1,fields,versions:{[record]:0,[todo]:0,transcript:0},ownerNames:{}},editing:{fields,versions:{[record]:0,[todo]:0,transcript:0},blocks:[{id:block,text:fields.record}],revision:1},changes:[],presence:[],members:{people:[]}};
 const dom=new JSDOM(workspaceHtml({id:'f'.repeat(64),liffId:'synthetic'}),{url:'https://meeting.example.test/meetings/review/work/'+ 'f'.repeat(64),runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[],timers=[];let behavior=null;
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.structuredClone=clone;w.confirm=()=>true;w.setInterval=fn=>{timers.push(fn);return timers.length;};w.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic'};
 function commit(input){const v=state.editing.versions[input.field]||0;if(input.version!==v)return {status:409,error:'這一段或待辦已被其他人修改。'};state=clone(state);state.editing.fields[input.field]=input.value;if(input.field.startsWith('record:')){state.editing.blocks.find(b=>'record:'+b.id===input.field).text=input.value;state.editing.fields.record=input.value;}state.editing.versions[input.field]=v+1;state.editing.revision++;state.workspace={...state.workspace,fields:state.editing.fields,versions:state.editing.versions,revision:state.editing.revision};return {status:200};}
 w.fetch=async(url,options)=>{const input=JSON.parse(options.body);requests.push(input);const result=behavior?await behavior(input,commit):input.action==='save-part'?commit(input):{status:200};if(result?.throw)throw Error(result.throw);return {ok:result.status===200,status:result.status,json:async()=>result.error?{error:result.error}:clone(result.body||state)};};
 for(const script of dom.window.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 w.initializeMeetingHub=()=>{};
 const tick=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};await tick();
 const el=key=>w.document.querySelector('[data-part="'+key+'"]'),area=key=>el(key).querySelector(key===transcript?'textarea':key.startsWith('todo:')?'[data-content]':'[contenteditable]');
 function edit(key,value){const e=area(key);e.focus();if(e.tagName==='TEXTAREA')e.value=value;else e.innerText=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
 const save=key=>el(key).querySelector('[data-save]').onclick();const transcript='transcript';
 return {w,el,edit,save,tick,requests,poll:()=>timers[0](),get state(){return state;},setBehavior:fn=>behavior=fn,commit,close:()=>dom.window.close()};
}
let checks=0;
for(const key of [record,todo,'transcript']){
 const f=await fixture();try{
 f.edit(key,'第一次編輯');await f.save(key);assert.equal(f.el(key).dataset.version,'1');assert.equal(f.w.document.activeElement.closest('[data-part]'),f.el(key),'Focus retained while saving');
 f.edit(key,'第二次編輯');await f.save(key);assert.equal(f.state.editing.versions[key],2);assert.equal(f.requests.filter(r=>r.action==='save-part').at(-1).version,1);assert(!f.el(key).classList.contains('dirty'));checks+=3;
 }finally{f.close();}
}
for(const failure of ['lost',503,409]){
 const f=await fixture();try{let once=true;f.setBehavior((input,commit)=>{if(input.action==='save-part'){const result=commit(input);if(once){once=false;return failure==='lost'?{throw:'response lost'}:{status:failure,error:'synthetic uncertain save'};}return result;}return {status:200};});
 f.edit(todo,'已提交但回應遺失');await f.save(todo);assert.equal(f.state.editing.versions[todo],1);assert(!f.el(todo).classList.contains('dirty'));assert.equal(f.w.document.querySelector('#error').textContent,'');f.w.document.querySelector('#publish').click();assert(f.w.document.querySelector('#confirmDialog').open);checks+=3;
 }finally{f.close();}
}
{
 const f=await fixture();try{let release,started;const waiting=new Promise(r=>started=r);f.setBehavior(async(input,commit)=>{if(input.action==='save-part'){const result=commit(input);started();await new Promise(r=>release=r);return result;}return {status:200};});f.edit(record,'先送出內容');const saving=f.save(record);await waiting;f.edit(record,'送出期間的新輸入');release();await saving;assert(f.el(record).classList.contains('dirty'));assert.equal(f.el(record).querySelector('[contenteditable]').innerText,'送出期間的新輸入');assert.equal(f.el(record).dataset.version,'1');f.setBehavior(null);await f.save(record);assert.equal(f.state.editing.fields.record,'送出期間的新輸入');assert.equal(f.state.editing.versions[record],2);checks+=4;}finally{f.close();}
}
{
 const f=await fixture();try{f.edit(record,'本人尚未儲存');f.commit({field:record,value:'另一人已儲存',version:0});await f.save(record);assert(f.el(record).classList.contains('dirty'));assert(f.el(record).querySelector('[data-conflict]').textContent.includes('另一人已儲存'));assert.equal(f.state.editing.fields.record,'另一人已儲存');assert.equal(f.el(record).querySelector('[contenteditable]').innerText,'本人尚未儲存');f.w.document.querySelector('#publish').click();assert(!f.w.document.querySelector('#confirmDialog').open);checks+=5;}finally{f.close();}
}
{
 const f=await fixture();try{f.edit(todo,'等待回讀確認');f.commit({field:todo,value:{evidence:'合成依據',due:'2026-10-25',ownerId:'',content:'等待回讀確認'},version:0});await f.poll();assert(!f.el(todo).classList.contains('dirty'),'Object property order must not prevent recovery');assert.equal(f.el(todo).dataset.version,'1');checks+=2;}finally{f.close();}
}
{
 const f=await fixture();try{f.edit(record,'新內容未提交');let reads=0;f.setBehavior(input=>input.action==='read'?{status:503,error:'read unavailable'}:{throw:'original save failure'});await f.save(record);assert(f.el(record).classList.contains('dirty'));assert(f.w.document.querySelector('#contentSaveStatus').textContent.includes('original save failure'));assert.equal(f.el(record).querySelector('[contenteditable]').innerText,'新內容未提交');checks+=3;}finally{f.close();}
}
{
 const f=await fixture();try{let release,started;const waiting=new Promise(r=>started=r),old=clone(f.state);f.setBehavior(async(input,commit)=>{if(input.action==='read'){started();await new Promise(r=>release=r);return {status:200,body:old};}return commit(input);});const poll=f.poll();await waiting;f.edit(todo,'新版本');await f.save(todo);release();await poll;assert.equal(f.el(todo).dataset.version,'1');f.edit(todo,'再編輯');f.setBehavior(null);await f.save(todo);assert.equal(f.state.editing.versions[todo],2);checks+=2;}finally{f.close();}
}
console.log('Meeting client version recovery: '+checks+' checks passed (focused paragraph/todo/transcript saves, lost/503/409 acknowledgments, in-flight typing, true conflicts, property-order-independent equality, read failure and stale poll).');


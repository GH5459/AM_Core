import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
const todo='todo:11111111-1111-4111-8111-111111111111', block='a'.repeat(32),record='record:'+block;
const clone=structuredClone;
async function fixture(){
 const fields={settings:{topic:'合成版本同步測試',date:'2026-10-20',speakers:[]},record:'原始段落',transcript:'原始逐字稿',[todo]:{content:'合成待辦',ownerId:'',due:'2026-10-25',evidence:'合成依據'}};
 let state={ok:true,access:'member',host:true,canEdit:true,actor:{id:'synthetic',name:'合成主持人'},types:[],sharing:{enabled:false,people:[],version:0},publication:{key:'1'.repeat(64),name:'合成來源群組',kind:'group',original:true,version:0,locked:false},publicationTargets:[{key:'1'.repeat(64),name:'合成來源群組'},{key:'2'.repeat(64),name:'合成發布群組'},{key:'3'.repeat(64),name:'合成另個群組'}],workspace:{state:'review',revision:1,fields,versions:{[record]:0,[todo]:0,transcript:0},ownerNames:{}},editing:{fields,versions:{[record]:0,[todo]:0,transcript:0},blocks:[{id:block,text:fields.record}],revision:1},changes:[],presence:[],members:{people:[]}};
 const dom=new JSDOM(workspaceHtml({id:'f'.repeat(64),liffId:'synthetic'}),{url:'https://meeting.example.test/meetings/review/work/'+ 'f'.repeat(64),runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[],timers=[];let behavior=null;
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.structuredClone=clone;w.confirm=()=>true;w.setInterval=fn=>{timers.push(fn);return timers.length;};w.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic'};
 function commit(input){if(input.action==='publication-target'){if(input.version!==state.publication.version)return {status:409,error:'發布群組已更新'};state=clone(state);state.publication={...state.publication,key:input.key,name:state.publicationTargets.find(x=>x.key===input.key)?.name||'已選群組',original:input.key==='1'.repeat(64),version:state.publication.version+1};state.editing.revision++;state.workspace.revision=state.editing.revision;return {status:200};}const v=state.editing.versions[input.field]||0;if(input.version!==v)return {status:409,error:'這一段或待辦已被其他人修改。'};state=clone(state);state.editing.fields[input.field]=input.value;if(input.field.startsWith('record:')){state.editing.blocks.find(b=>'record:'+b.id===input.field).text=input.value;state.editing.fields.record=input.value;}state.editing.versions[input.field]=v+1;state.editing.revision++;state.workspace={...state.workspace,fields:state.editing.fields,versions:state.editing.versions,revision:state.editing.revision};return {status:200};}
 w.fetch=async(url,options)=>{const input=JSON.parse(options.body);requests.push(input);const result=behavior?await behavior(input,commit):['save-part','publication-target'].includes(input.action)?commit(input):{status:200};if(result?.throw)throw Error(result.throw);return {ok:result.status===200,status:result.status,json:async()=>result.error?{error:result.error}:clone(result.body||state)};};
 for(const script of dom.window.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 w.initializeMeetingHub=()=>{};
 const tick=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};await tick();
 const el=key=>w.document.querySelector('[data-part="'+key+'"]'),area=key=>el(key).querySelector(key===transcript?'textarea':key.startsWith('todo:')?'[data-content]':'[contenteditable]');
 function edit(key,value){const e=area(key);e.focus();if(e.tagName==='TEXTAREA')e.value=value;else e.innerText=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
 const save=key=>el(key).querySelector('[data-save]').onclick();const transcript='transcript';
 return {w,el,edit,save,tick,requests,poll:()=>timers[0](),get state(){return state;},setBehavior:fn=>behavior=fn,commit,mutate:fn=>fn(state),close:()=>dom.window.close()};
}
const selected='2'.repeat(64),source='1'.repeat(64),other='3'.repeat(64);
async function choose(f,key=selected){const $=s=>f.w.document.querySelector(s);await $('#loadPublicationTargets').onclick();$('#publicationTarget').value=key;$('#publicationTarget').dispatchEvent(new f.w.Event('change',{bubbles:true}));}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s),originalTodo=clone(f.state.editing.fields[todo]);assert(!$('#publicationPanel').hidden);f.edit(record,'人工修改尚未保存');f.edit(todo,'保持原待辦負責人');await choose(f);$('#publish').click();assert(!$('#confirmDialog').open);assert($('#error').textContent.includes('發布群組'));await $('#savePublicationTarget').onclick();assert.equal(f.state.publication.key,selected);assert.equal(f.el(record).querySelector('[contenteditable]').innerText,'人工修改尚未保存');assert(f.el(record).classList.contains('dirty'));assert.equal(f.state.editing.fields[todo].ownerId,originalTodo.ownerId);await $('#saveContent').onclick();$('#publish').click();assert($('#confirmDialog').open);assert($('#confirmText').textContent.includes('合成發布群組'));assert($('#confirmText').textContent.includes('收聽錄音'));assert.equal(f.state.editing.fields.record,'人工修改尚未保存');assert(!f.requests.some(r=>r.action==='publish'));await $('#confirmPublish').onclick();const sent=f.requests.find(r=>r.action==='publish');assert.equal(sent.publicationKey,selected);assert.equal(sent.publicationVersion,1);}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);await choose(f);f.commit({action:'publication-target',key:other,version:0});await f.poll();assert.equal($('#publicationTarget').value,selected);await $('#savePublicationTarget').onclick();assert.equal(f.state.publication.key,other);assert.equal($('#publicationTarget').value,selected);const compared=$('#publicationStatus button');assert(compared);compared.click();await f.tick();assert.equal(f.state.publication.key,selected);assert.equal(f.requests.filter(r=>r.action==='publication-target').at(-1).version,1);}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);await choose(f);f.mutate(s=>s.publicationTargets=s.publicationTargets.filter(t=>t.key!==selected));await $('#loadPublicationTargets').onclick();assert.equal($('#publicationTarget').value,selected,'A disappearing group must not silently replace the local draft');$('#cancelPublicationTarget').click();assert.equal($('#publicationTarget').value,source);assert.equal(f.state.publication.key,source);assert(!f.requests.some(r=>r.action==='publication-target'));}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);await choose(f);let lost=true;f.setBehavior((input,commit)=>{if(input.action==='publication-target'){const result=commit(input);if(lost){lost=false;return {throw:'response_lost'};}return result;}return {status:200};});await $('#savePublicationTarget').onclick();assert.equal(f.state.publication.version,1);assert($('#savePublicationTarget').disabled);assert($('#publicationStatus').textContent.includes('儲存成功'));assert.equal(f.requests.filter(r=>r.action==='publication-target').length,1);}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);await choose(f);const e=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(e);assert(e.defaultPrevented);f.mutate(s=>{s.workspace.state='publishing';s.publication.locked=true;s.workspace.revision++;s.editing.revision++;});await f.poll();assert($('#publicationTarget').disabled);assert($('#savePublicationTarget').disabled);$('#cancelPublicationTarget').click();assert.equal($('#publicationTarget').value,source);}finally{f.close();}
}
console.log('Publication UI: unsaved content/assignee preservation, explicit group save, destination/read-scope confirmation, stale selection comparison, removed-group draft retention, lost-response recovery, unload protection and publishing lock passed.');

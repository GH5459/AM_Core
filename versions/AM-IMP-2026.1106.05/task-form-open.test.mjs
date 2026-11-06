import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {patchTasks,patchProjectIdentity,patchBlankCreation,taskFormOpenResponse} from './task-form-open.mjs';
const {patchWorker}=createRequire(import.meta.url)('./patch-worker.cjs');
// Deliberately synthetic anchor fixtures: no production source or user data.
const tasks=` async function editForm(task=null,todoId=null,preferredLead=null,context={}){
  let available;try{available=[...(context.people||await people())];}catch(e){error('無法取得同仁名單：'+e.message);return;}
  const form=node.querySelector('#taskEditForm'),select=form.elements.leadAccount,levelSelect=node.querySelector('[name="workLevel"]');cardBaselines.set(form,cardState(form));
  function refresh(people,latest){const next=[...people];for(const p of participants(latest))if(!next.some(q=>q.account===p.account))next.push(p);available.splice(0,available.length,...next);}
  const saveEditor=async event=>{event.preventDefault();if(form.dataset.readReady==='false')return false;if(form.aiTitle&&!await form.aiTitle.ensure())return;const projectFields={};const values={level};if(task)return existingSave();if(values.level>1){try{const existing=await window.dailylogProjects.check(values);if(existing){return false;}}catch(e){error(e.message);return false;}}return saveCreation({...values,id:active.id,sourceTodoId:todoId||null},form);};
${' '}
 }

 let taskOpenSequence=0;`;
const projects=`window.dailylogProjects=(()=>{const key=context=>'draft:'+window.DAILYLOG_AUTH.user.id+':'+(context.level||1);
 function createId(context){return 'synthetic';}
 const remember=()=>{},check=()=>{},offer=()=>{},mount=()=>{};
 function quick(){confirm.onclick=async()=>{if(busy||!description.value.trim())return;if(controller&&!await controller.ensure())return;if(!input.value.trim())return;const existing=await check({level:2,title,leadAccount:account});let task;
 accept(task);if(![...form.elements.primaryParentId.options].length)return;};}
 return {createId,remember,check,offer,quick,mount};})();`;
const worker='const operation_speed_worker={...routine_dialog_worker,async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await routine_dialog_worker.fetch(request,env,ctx),env,start);}};';
const creation=` function paintCreations(){let tray={};tray.hidden=!creationJobs.size;const signature=[...creationJobs].map(([id,j])=>id);tray.innerHTML=[...creationJobs].map(([id,j])=>id);}
 async function readCreations(){}
 async function sendCreation(id){const job=creationJobs.get(id);if(!job||job.busy)return;job.busy=true;job.state='saving';job.message='';try{await writeCreation(job);paintCreations();if(!job.result){job.attempted=true;await writeCreation(job);const r=await dailylogRequest('/api/tasks',job.packet);job.result=r.task;await writeCreation(job);}accept(job.result);await writeCreation(job,true);creationJobs.delete(id);
 }catch(e){job.state='failed';job.message=e.message;job.conflict=[401,403,404,409].includes(e.status);try{await writeCreation(job);}catch{}paintCreations();toast('！儲存未完成，內容已保留。');}finally{job.busy=false;}}
 function creationFields(form){return [];}
 async function saveCreation(packet,form,controller=null,clearDraft=()=>{}){
  if(form.dataset.creationSaving==='true'||creationJobs.get(packet.id)?.busy)return false;const old=creationJobs.get(packet.id),job={owner:creationOwner(),packet};
  // Never change an unconfirmed creation command;
  try{await writeCreation(job);creationJobs.set(packet.id,job);clearDraft();dialog().close();void sendCreation(packet.id);return true;}catch(e){error('裝置無法保留內容與附件，畫面已保留，請重試。');return false;}
 }
 async function restoreCreation(id){const job=creationJobs.get(id);if(!job||job.busy)return;
  if(job.result){return;}try{const r=await dailylogRequest('/api/tasks/'+id);if(r.task){await writeCreation(job);accept(r.task);if(!job.files.length){await writeCreation(job,true);creationJobs.delete(id);}return;}}catch(e){if(e.status!==404){toast(e.message);return;}}
  await editForm(null,job.packet.sourceTodoId||null,null,{creationJob:job});
  const form=dialog().querySelector('#taskEditForm');if(form)error('synthetic');
 }
 document.addEventListener('click',event=>{const retry=event.target.closest('[data-create-retry]');});`;

test('worker preserves final operation/version cache wrapper',()=>{
 const result=patchWorker(worker);assert.match(result,/operationSpeedResponse\(request,await form_open_worker.fetch/);assert.match(result,/taskFormOpenResponse\(request,await routine_dialog_worker.fetch/);assert.throws(()=>patchWorker(result),/anchor changed/);
});
test('worker patch fails closed for changed or duplicated anchors',()=>{assert.throws(()=>patchWorker(''),/anchor changed/);assert.throws(()=>patchWorker(worker+worker),/anchor changed/);});
test('synthetic tasks patch parses and retains original save guard',()=>{const result=patchTasks(tasks);new vm.Script(result);assert.match(result,/if\(form.dataset.readReady==='false'\)return false/);assert.match(result,/form.blankTaskCanSave&&!form.blankTaskCanSave\(\)/);assert.match(result,/if\(blankTaskRead\)beginBlankTaskRead\(form,node\)/);});
test('task anchors reject missing, duplicate and repeat application',()=>{
 const anchors=[' async function editForm(task=null,todoId=null,preferredLead=null,context={}){',"  let available;try{available=[...(context.people||await people())];}catch(e){error('無法取得同仁名單：'+e.message);return;}","const form=node.querySelector('#taskEditForm'),select=form.elements.leadAccount,levelSelect=node.querySelector('[name=\"workLevel\"]');cardBaselines.set(form,cardState(form));",'for(const p of participants(latest))if(!next.some(q=>q.account===p.account))next.push(p);available.splice',"const saveEditor=async event=>{event.preventDefault();if(form.dataset.readReady==='false')",'\n \n }\n\n let taskOpenSequence=0;'];
 for(const anchor of anchors){assert.throws(()=>patchTasks(tasks.replace(anchor,'')),/anchor changed/);assert.throws(()=>patchTasks(tasks+anchor),/anchor changed/);}assert.throws(()=>patchTasks(patchTasks(tasks)),/anchor changed/);
});
test('only genuinely absent draft keys permit early open',()=>{
 let value=null;const context={window:{DAILYLOG_AUTH:{user:{id:'synthetic-user'}}},sessionStorage:{getItem:()=>value}};vm.runInNewContext(patchProjectIdentity(projects),context);
 const available=context.window.dailylogProjects.blankCreateAvailable;assert.equal(available({}),true);for(value of ['', '{}','null','malformed','{"fields":[]}'])assert.equal(available({}),false);context.sessionStorage.getItem=()=>{throw Error('unavailable');};assert.equal(available({}),false);
});
test('scope excludes all edits, todos, assignment and explicit contexts',()=>{
 const result=patchTasks(tasks),expression=result.match(/const blankTaskRead=(.*);/)[1];
 const check=(args)=>vm.runInNewContext(expression,{task:null,todoId:null,preferredLead:null,context:{},window:{dailylogProjects:{blankCreateAvailable:()=>true}},...args});
 assert.equal(check({}),true);for(const args of [{task:{}},{todoId:'synthetic'},{preferredLead:'synthetic'},{context:{creationJob:{}}},{context:{level:1}},{context:{parent:'synthetic'}},{context:{people:[]}}])assert.equal(check(args),false);assert.equal(check({window:{dailylogProjects:{}}}),false);
});
test('draft patch rejects changed, duplicate and repeat anchors',()=>{assert.throws(()=>patchProjectIdentity(projects.replace(' function createId(context)','')),/anchor changed/);assert.throws(()=>patchProjectIdentity(projects+projects),/anchor changed/);assert.throws(()=>patchProjectIdentity(patchProjectIdentity(projects)),/anchor changed/);});
test('task response transforms bytes and clears stale metadata',async()=>{
 const response=await taskFormOpenResponse(new Request('https://example.test/tasks.js?assetVersion=synthetic'),new Response(tasks+creation,{headers:{'Content-Type':'text/javascript','ETag':'old','Content-Length':'1','Last-Modified':'old','X-Keep':'yes'}}));
 assert.equal(response.status,200);assert.equal(await response.text(),patchBlankCreation(patchTasks(tasks+creation)));assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('ETag'),null);assert.equal(response.headers.get('Content-Length'),null);assert.equal(response.headers.get('Last-Modified'),null);assert.equal(response.headers.get('X-Keep'),'yes');
});
test('project response exposes read-only draft presence without altering draft persistence',async()=>{const r=await taskFormOpenResponse(new Request('https://example.test/project-identity.js'),new Response(projects));assert.equal(await r.text(),patchProjectIdentity(projects));});
test('non-GET, denied and unrelated responses pass through untouched',async()=>{for(const [path,method,status]of [['/tasks.js','POST',200],['/tasks.js','GET',401],['/tasks.js','GET',403],['/tasks.js','GET',503],['/api/tasks','GET',200]]){const response=new Response('synthetic',{status});assert.equal(await taskFormOpenResponse(new Request('https://example.test'+path,{method}),response),response);assert.equal(response.bodyUsed,false);}});
test('late result check precedes directory side effects and no new authority TTL exists',()=>{const result=patchTasks(tasks);assert(result.indexOf('if(!current()){abandon();return;}')<result.indexOf('rememberPeople(packet)'));assert.match(result,/Date.now\(\)-directoryAt<60000/);assert.match(result,/node.querySelector\('#taskEditForm'\)===form&&active\?\.id===id&&taskOpenSequence===ticket/);assert.match(result,/sameForm\(\)&&!ownerInvalid&&creationOwner\(\)===owner/);});
test('pending UI keeps original form and close controls, only updates choices',()=>{const result=patchTasks(tasks);assert(!result.includes('node.innerHTML='));assert.match(result,/control===form.elements.title\|\|control===form.elements.description/);assert.match(result,/data-close-discard/);assert.match(result,/form.syncReadBaseline\(\)/);assert.match(result,/event.stopImmediatePropagation\(\)/);});
test('AI continuation cannot save a no-longer-current blank form',async()=>{
 let release,allowed=true,writes=0;const wait=new Promise(r=>release=r),form={dataset:{readReady:'true'},blankTaskCanSave:()=>allowed,aiTitle:{ensure:()=>wait}};
 const body=patchTasks(tasks).match(/const saveEditor=(async event=>.*);\n/)[1];
 const save=vm.runInNewContext('('+body+')',{form,level:1,task:null,active:{id:'synthetic'},todoId:null,saveCreation:()=>{writes++;},window:{dailylogProjects:{}},error:()=>{}});
 const promise=save({preventDefault(){}});allowed=false;release(true);await promise;assert.equal(writes,0);
});
test('project continuation cannot save a no-longer-current blank form',async()=>{
 let release,allowed=true,writes=0;const wait=new Promise(r=>release=r),form={dataset:{readReady:'true'},blankTaskCanSave:()=>allowed};
 const body=patchTasks(tasks).match(/const saveEditor=(async event=>.*);\n/)[1];
 const save=vm.runInNewContext('('+body+')',{form,level:2,task:null,active:{id:'synthetic'},todoId:null,saveCreation:()=>{writes++;},window:{dailylogProjects:{check:()=>wait}},error:()=>{}});
 const promise=save({preventDefault(){}});allowed=false;release(null);await promise;assert.equal(writes,0);
});
test('creation patch rejects missing sections and repeated patching',()=>{const result=patchBlankCreation(creation);new vm.Script(result);assert.throws(()=>patchBlankCreation(result),/anchor changed/);assert.throws(()=>patchBlankCreation(creation.replace(' function creationFields(form)',' function other(form)')),/section changed/);});
test('marked outbox job cannot POST after identity changes at durable attempted checkpoint',async()=>{
 for(const guarded of [false,true]){
  let owner='old',writes=0,posts=0;const job={owner,blankFormOwnerGuard:guarded,packet:{id:'synthetic'}},creationJobs=new Map([['synthetic',job]]);
  const context={creationJobs,creationOwner:()=>owner,writeCreation:async()=>{if(++writes===2)owner='new';},dailylogRequest:async()=>{posts++;return {task:{id:'synthetic'}};},paintCreations(){},accept(){},toast(){},document:{addEventListener(){}}};
  vm.createContext(context);vm.runInContext(patchBlankCreation(creation),context);await context.sendCreation('synthetic');assert.equal(posts,guarded?0:1);if(guarded){assert.equal(job.state,'failed');assert.equal(job.conflict,false);assert.equal(job.owner,'old');}
 }
});
test('accepted marked command keeps new form/draft while same-owner background send continues',async()=>{
 let clears=0,closes=0,sends=0;const oldForm={dataset:{},isConnected:false,blankTaskCanSave:()=>true},newForm={},context={creationJobs:new Map(),creationOwner:()=>'owner',writeCreation:async()=>{},paintCreations(){},dialog:()=>({open:true,querySelector:()=>newForm,close(){closes++;}}),error(){},document:{addEventListener(){}}};vm.createContext(context);vm.runInContext(patchBlankCreation(creation),context);context.sendCreation=()=>{sends++;};await context.saveCreation({id:'synthetic'},oldForm,null,()=>clears++);assert.equal(sends,1);assert.equal(clears,0);assert.equal(closes,0);assert.equal(context.creationJobs.get('synthetic').blankFormOwnerGuard,true);
});
test('restored marked job cannot be re-keyed under another owner even without a form capability',async()=>{
 let writes=0;const old={owner:'original',key:'original:synthetic',blankFormOwnerGuard:true,packet:{id:'synthetic'}},context={creationJobs:new Map([['synthetic',old]]),creationOwner:()=>'different',writeCreation:async()=>writes++,document:{addEventListener(){}}};vm.createContext(context);vm.runInContext(patchBlankCreation(creation),context);assert.equal(await context.saveCreation(old.packet,{dataset:{}}),false);assert.equal(writes,0);assert.equal(context.creationJobs.get('synthetic').owner,'original');
});

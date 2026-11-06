// Render only a genuinely blank ordinary creation form before its people read.
// The existing form, draft writer, save handler and server permissions remain in use.
const client = String.raw`
 function guardRestoredBlankTask(form,node,job){
  const owner=job.owner,id=job.packet.id,ticket=taskOpenSequence;let invalid=false;
  const same=()=>form.isConnected&&node.open&&node.querySelector('#taskEditForm')===form&&active?.id===id&&taskOpenSequence===ticket;
  const allowed=control=>control.matches('[data-card-close],[data-card-close-foot],[data-edit-cancel],[data-close-continue],[data-close-discard]');
  const dispose=()=>{node.removeEventListener('click',guard,true);node.removeEventListener('input',guard,true);node.removeEventListener('change',guard,true);node.removeEventListener('close',dispose);};
  const blocked=()=>{invalid=true;form.dataset.readReady='false';for(const control of node.querySelectorAll('button,input,select,textarea'))if(!allowed(control))control.disabled=true;error('登入帳號已變更，請用原帳號重新開啟；原待送內容仍保留。');};
  form.blankTaskOwner=owner;form.dataset.readReady='true';form.blankTaskCanSave=()=>{if(!same())return false;if(invalid||creationOwner()!==owner){blocked();return false;}return true;};
  const guard=event=>{if(!same()){dispose();return;}if(form.blankTaskCanSave())return;const control=event.target.closest('button,input,select,textarea,a,summary');if(!control||!allowed(control)){event.preventDefault();event.stopImmediatePropagation();}};
  node.addEventListener('click',guard,true);node.addEventListener('input',guard,true);node.addEventListener('change',guard,true);node.addEventListener('close',dispose);
 }
 function beginBlankTaskRead(form,node){
  const owner=creationOwner(),id=active.id,ticket=taskOpenSequence,disabled=new Map();
  form.blankTaskOwner=owner;form.dataset.readReady='false';
  const status=document.createElement('p');status.className='work-hint';status.dataset.blankTaskRead='';status.setAttribute('role','status');
  const message=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='重新讀取同仁名單';retry.hidden=true;retry.dataset.blankTaskRetry='';status.append(message,' ',retry);form.querySelector('.dialog-body').prepend(status);
  const sameForm=()=>form.isConnected&&node.open&&node.querySelector('#taskEditForm')===form&&active?.id===id&&taskOpenSequence===ticket;
  const current=()=>sameForm()&&!ownerInvalid&&creationOwner()===owner;
  form.blankTaskCanSave=()=>{if(current()&&form.dataset.readReady==='true')return true;if(sameForm()&&(ownerInvalid||creationOwner()!==owner))abandon();return false;};
  const allowed=control=>control===form.elements.title||control===form.elements.description||control===retry||control.matches('[data-card-close],[data-card-close-foot],[data-edit-cancel],[data-close-continue],[data-close-discard]');
  let stopped=false,loading=false,ownerInvalid=false;
  const cleanup=()=>{stopped=true;observer.disconnect();};
  const dispose=()=>{cleanup();node.removeEventListener('click',block,true);node.removeEventListener('input',guardDraft,true);node.removeEventListener('change',guardDraft,true);node.removeEventListener('close',dispose);};
  const lockControls=()=>{for(const control of node.querySelectorAll('button,input,select,textarea'))if(!allowed(control)){if(!disabled.has(control))disabled.set(control,control.disabled);control.disabled=true;}};
  const abandon=()=>{if(sameForm()&&(ownerInvalid||creationOwner()!==owner)){ownerInvalid=true;form.dataset.readReady='false';message.textContent='登入帳號已變更，請用原帳號重新開啟；目前輸入仍保留。';retry.hidden=true;if(!status.isConnected)form.querySelector('.dialog-body').prepend(status);lockControls();observer.observe(node,{childList:true,subtree:true});}else dispose();};
  const guardDraft=event=>{if((form.contains(event.target)||event.target.form===form)&&(ownerInvalid||creationOwner()!==owner)){event.stopImmediatePropagation();abandon();}else if(!stopped)queueMicrotask(lock);};
  const block=event=>{if(!sameForm()){dispose();return;}if(ownerInvalid||creationOwner()!==owner)abandon();else if(stopped)return;const control=event.target.closest('button,input,select,textarea,a,summary');if(control&&!allowed(control)){event.preventDefault();event.stopImmediatePropagation();}};
  const lock=()=>{if(ownerInvalid){if(sameForm())lockControls();else dispose();return;}if(stopped)return;if(!current()){abandon();return;}lockControls();};
  const observer=new MutationObserver(lock);observer.observe(node,{childList:true,subtree:true});node.addEventListener('click',block,true);node.addEventListener('input',guardDraft,true);node.addEventListener('change',guardDraft,true);node.addEventListener('close',dispose);lock();
  const load=async()=>{
   if(loading||!current())return;loading=true;retry.hidden=true;message.textContent='人員資料讀取中，可先填寫內容。';
   try{
    // Keep the original directory freshness rule, but defer its side effects until
    // this exact form and identity are still current. A closed form owns no result.
    const packet=directory.length&&Date.now()-directoryAt<60000?{people:directory}:await dailylogRequest('/api/tasks/people');
    if(!current()){abandon();return;}
    if(!Array.isArray(packet.people)||!packet.people.some(person=>person.account===me()))throw Error('名單尚未確認本人，請重新讀取。');
    rememberPeople(packet);
    for(const [control,value]of disabled)if(control.isConnected)control.disabled=value;
    form.refreshPeople(packet.people,null);
    // Preserve the original authoritative order as well as the selected self.
    for(const name of ['leadAccount','requesterAccount']){const select=form.elements[name];for(const person of packet.people)select.append([...select.options].find(option=>option.value===person.account));select.value=me();}
    const teams=form.elements.departmentOverride;for(const option of [...teams.options].filter(option=>option.value).sort((a,b)=>a.value<b.value?-1:a.value>b.value?1:0))teams.append(option);
    const collaborators=form.querySelector('.collaborator-options');for(const person of packet.people){const box=[...collaborators.querySelectorAll('[name="collaborator"]')].find(input=>input.value===person.account);if(box)collaborators.append(box.closest('label'));}
    form.taskSharingRefreshDirectory?.();form.taskSharingSync?.();form.syncReadBaseline();
    cleanup();status.remove();cardReadState(form,true);form.dispatchEvent(new Event('change',{bubbles:true}));
   }catch(e){
    if(!current()){abandon();return;}lock();message.textContent='同仁名單尚未取得，輸入已保留。'+(e.message||'請重新讀取。');retry.hidden=false;
   }finally{loading=false;}
  };
  retry.onclick=()=>void load();void load();
 }
`;

function once(source,from,to,label){
 if(source.split(from).length!==2)throw Error('Task form open anchor changed: '+label);
 return source.replace(from,to);
}

function section(source,start,end,change){
 if(source.split(start).length!==2||source.split(end).length!==2)throw Error('Blank creation section changed');
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 if(b<a)throw Error('Blank creation section order changed');
 return source.slice(0,a)+change(source.slice(a,b))+source.slice(b);
}

export function patchBlankCreation(source){
 source=section(source,' function paintCreations(){',' async function readCreations()',body=>{
  body=once(body,'tray.hidden=!creationJobs.size;',"const visibleJobs=[...creationJobs].filter(([,job])=>!job.blankFormOwnerGuard||job.owner===creationOwner());tray.hidden=!visibleJobs.length;",'creation visibility');
  if(body.split('[...creationJobs].map').length!==3)throw Error('Creation list anchor changed');
  return body.replaceAll('[...creationJobs].map','visibleJobs.map');
 });
 source=section(source,' async function sendCreation(id){',' function creationFields(form)',body=>{
  body=once(body,'if(!job||job.busy)return;','if(!job||job.busy)return;if(job.blankFormOwnerGuard&&job.owner!==creationOwner()){paintCreations();return;}','creation sender entry');
  const split=body.indexOf('}catch(e){job.state=');if(split<0)throw Error('Creation sender catch changed');
  let work=body.slice(0,split),failure=body.slice(split);
  work=work.replaceAll('dailylogRequest(','requestForCreation(').replaceAll('fetch(','fetchForCreation(').replaceAll('await writeCreation(','await persistForCreation(');
  work=once(work,"job.busy=true;job.state='saving';",`const assertCreationOwner=()=>{if(job.blankFormOwnerGuard&&job.owner!==creationOwner())throw Object.assign(Error('登入帳號已變更，請回原帳號重試。'),{status:401});};
   const requestForCreation=async(...args)=>{assertCreationOwner();const value=await dailylogRequest(...args);assertCreationOwner();return value;};
   const fetchForCreation=async(...args)=>{assertCreationOwner();const value=await fetch(...args);assertCreationOwner();return value;};
   const persistForCreation=async(...args)=>{assertCreationOwner();await writeCreation(...args);assertCreationOwner();};
   job.busy=true;job.state='saving';`,'creation sender guards');
  failure=once(failure,'job.conflict=[401,403,404,409].includes(e.status);','job.conflict=[401,403,404,409].includes(e.status)&&!(job.blankFormOwnerGuard&&job.owner!==creationOwner());','recoverable owner change');
  failure=once(failure,"paintCreations();toast('！儲存未完成，內容已保留。');","paintCreations();if(!job.blankFormOwnerGuard||job.owner===creationOwner())toast('！儲存未完成，內容已保留。');",'creation error visibility');
  return work+failure;
 });
 source=section(source,' async function saveCreation(packet,form,',' async function restoreCreation(id)',body=>{
  body=once(body,"  if(form.dataset.creationSaving==='true'||creationJobs.get(packet.id)?.busy)return false;","  if(form.blankTaskCanSave&&!form.blankTaskCanSave())return false;const retainedCreation=creationJobs.get(packet.id);if(retainedCreation?.blankFormOwnerGuard&&retainedCreation.owner!==creationOwner())return false;\n  if(form.dataset.creationSaving==='true'||creationJobs.get(packet.id)?.busy)return false;",'retained owner before new key');
  body=once(body,'  // Never change an unconfirmed creation command;',"  const guardedBlank=!!form.blankTaskCanSave||!!old?.blankFormOwnerGuard;if(guardedBlank)job.blankFormOwnerGuard=true;\n  const originalForm=()=>form.isConnected&&dialog().open&&dialog().querySelector('#taskEditForm')===form;\n  // Never change an unconfirmed creation command;",'creation marker');
  body=once(body,'try{await writeCreation(job);creationJobs.set(packet.id,job);clearDraft();',"try{await writeCreation(job);creationJobs.set(packet.id,job);if(guardedBlank){if(job.owner!==creationOwner()){job.state='failed';job.message='登入帳號已變更，請回原帳號重試。';job.conflict=false;await writeCreation(job);form.blankTaskCanSave?.();paintCreations();return false;}if(originalForm()){clearDraft();dialog().close();}paintCreations();void sendCreation(packet.id);return true;}clearDraft();",'persisted command boundary');
  return once(body,"catch(e){error('裝置無法保留內容與附件，畫面已保留，請重試。');return false;}","catch(e){if(!guardedBlank||originalForm()&&job.owner===creationOwner())error('裝置無法保留內容與附件，畫面已保留，請重試。');return false;}",'creation error form');
 });
 source=section(source,' async function restoreCreation(id){'," document.addEventListener('click',event=>{const retry=event.target.closest('[data-create-retry]')",body=>{
  body=once(body,'if(!job||job.busy)return;','if(!job||job.busy||job.blankFormOwnerGuard&&job.owner!==creationOwner())return;','restore owner');
  body=once(body,"  if(job.result){", "  const restoreBlankTicket=taskOpenSequence,restoreBlankCurrent=()=>!job.blankFormOwnerGuard||job.owner===creationOwner()&&!dialog().open&&taskOpenSequence===restoreBlankTicket;\n  if(job.result){",'restore sequence');
  body=once(body,"try{const r=await dailylogRequest('/api/tasks/'+id);if(r.task){","try{const r=await dailylogRequest('/api/tasks/'+id);if(job.blankFormOwnerGuard&&job.owner!==creationOwner())return;if(r.task){",'restore read');
  body=once(body,'await writeCreation(job);accept(r.task);','await writeCreation(job);if(job.blankFormOwnerGuard&&job.owner!==creationOwner())return;accept(r.task);','restore persistence');
  body=once(body,'await writeCreation(job,true);creationJobs.delete(id);','await writeCreation(job,true);if(job.blankFormOwnerGuard&&job.owner!==creationOwner())return;creationJobs.delete(id);','restore completion');
  body=once(body,"catch(e){if(e.status!==404){toast(e.message);return;}}","catch(e){if(job.blankFormOwnerGuard&&job.owner!==creationOwner())return;if(e.status!==404){toast(e.message);return;}}",'restore failure');
  body=once(body,"  await editForm(null,job.packet.sourceTodoId", "  if(!restoreBlankCurrent())return;await editForm(null,job.packet.sourceTodoId",'restore editor');
  body=once(body,'creationJob:job});','creationJob:job,...job.blankFormOwnerGuard?{blankRestoreTicket:restoreBlankTicket}:{}});','restore editor ticket');
  body=body.replaceAll('if(job.blankFormOwnerGuard&&job.owner!==creationOwner())return;','if(!restoreBlankCurrent())return;');
  return once(body,"  const form=dialog().querySelector('#taskEditForm');if(form)error(","  const form=dialog().querySelector('#taskEditForm');if(job.blankFormOwnerGuard&&!form?.blankTaskCanSave?.())return;if(form)error(",'restore editor result');
 });
 return source;
}

export function patchProjectIdentity(source){
 source=once(source," function createId(context)"," function blankCreateAvailable(context){try{return sessionStorage.getItem(key(context))===null;}catch{return false;}}\n function createId(context)",'draft lookup');
 source=once(source,'return {createId,remember,check,offer,quick,mount};','return {createId,remember,check,offer,quick,mount,blankCreateAvailable};','draft export');
 source=once(source,'confirm.onclick=async()=>{if(busy||!description.value.trim())return;','confirm.onclick=async()=>{if(form.blankTaskCanSave&&!form.blankTaskCanSave())return;if(busy||!description.value.trim())return;','quick project entry');
 source=once(source,'if(controller&&!await controller.ensure())return;if(!input.value.trim())return;','if(controller&&!await controller.ensure())return;if(form.blankTaskCanSave&&!form.blankTaskCanSave())return;if(!input.value.trim())return;','quick project naming');
 source=once(source,'existing=await check({level:2,title,leadAccount:account});let task;','existing=await check({level:2,title,leadAccount:account});if(form.blankTaskCanSave&&!form.blankTaskCanSave())return;let task;','quick project lookup');
 return once(source,'\n accept(task);if(![...form.elements.primaryParentId.options]','\n if(form.blankTaskCanSave&&!form.blankTaskCanSave())return;accept(task);if(![...form.elements.primaryParentId.options]','quick project result');
}

export function patchTasks(source){
 source=once(source,' async function editForm(task=null,todoId=null,preferredLead=null,context={}){',client+'\n async function editForm(task=null,todoId=null,preferredLead=null,context={}){\n  const restoreBlankValid=()=>!context.creationJob?.blankFormOwnerGuard||context.creationJob.owner===creationOwner()&&(context.blankRestoreTicket===undefined||taskOpenSequence===context.blankRestoreTicket&&!dialog().open);if(!restoreBlankValid())return;','editor');
 source=once(source,"  let available;try{available=[...(context.people||await people())];}catch(e){error('無法取得同仁名單：'+e.message);return;}","  const blankTaskRead=!task&&!todoId&&!preferredLead&&Object.keys(context).length===0&&window.dailylogProjects.blankCreateAvailable?.(context)===true;\n  let available;if(blankTaskRead)available=[self()];else try{if(context.creationJob?.blankFormOwnerGuard){const packet=directory.length&&Date.now()-directoryAt<60000?{people:directory}:await dailylogRequest('/api/tasks/people');if(!restoreBlankValid())return;rememberPeople(packet);available=[...packet.people];}else available=[...(context.people||await people())];}catch(e){if(!restoreBlankValid())return;error('無法取得同仁名單：'+e.message);return;}",'people wait');
 source=once(source,"const form=node.querySelector('#taskEditForm'),select=form.elements.leadAccount,levelSelect=node.querySelector('[name=\"workLevel\"]');cardBaselines.set(form,cardState(form));","const form=node.querySelector('#taskEditForm'),select=form.elements.leadAccount,levelSelect=node.querySelector('[name=\"workLevel\"]');if(blankTaskRead)form.dataset.readReady='false';cardBaselines.set(form,cardState(form));",'initial save gate');
 source=once(source,'for(const p of participants(latest))if(!next.some(q=>q.account===p.account))next.push(p);available.splice','for(const p of latest?participants(latest):[])if(!next.some(q=>q.account===p.account))next.push(p);available.splice','nullable new task');
 source=once(source,"const saveEditor=async event=>{event.preventDefault();if(form.dataset.readReady==='false')","const saveEditor=async event=>{event.preventDefault();if(form.blankTaskCanSave&&!form.blankTaskCanSave())return false;if(form.dataset.readReady==='false')",'identity save gate');
 source=once(source,'if(form.aiTitle&&!await form.aiTitle.ensure())return;const projectFields={};','if(form.aiTitle&&!await form.aiTitle.ensure())return;if(form.blankTaskCanSave&&!form.blankTaskCanSave())return false;const projectFields={};','naming continuation');
 source=once(source,'const existing=await window.dailylogProjects.check(values);if(existing){','const existing=await window.dailylogProjects.check(values);if(form.blankTaskCanSave&&!form.blankTaskCanSave())return false;if(existing){','project continuation');
 source=once(source,'catch(e){error(e.message);return false;}}return saveCreation({...values,id:active.id,sourceTodoId:todoId||null}', 'catch(e){if(form.blankTaskCanSave&&!form.blankTaskCanSave())return false;error(e.message);return false;}}if(form.blankTaskCanSave&&!form.blankTaskCanSave())return false;return saveCreation({...values,id:active.id,sourceTodoId:todoId||null}', 'creation boundary');
 source=once(source,'\n \n }\n\n let taskOpenSequence=0;','\n  if(blankTaskRead)beginBlankTaskRead(form,node);else if(context.creationJob?.blankFormOwnerGuard)guardRestoredBlankTask(form,node,context.creationJob);\n }\n\n let taskOpenSequence=0;','begin after original initialization');
 return source;
}

export async function taskFormOpenResponse(request,response){
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'||response.status!==200||!['/tasks.js','/project-identity.js'].includes(path))return response;
 const source=await response.text(),body=path==='/tasks.js'?patchBlankCreation(patchTasks(source)):patchProjectIdentity(source);
 const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
 headers.set('Cache-Control','private, no-store');
 return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

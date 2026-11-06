 // Retain the command and File bytes before closing. Network work never owns the editor.
 let editFilesDb;
 const editOwner=()=>window.DAILYLOG_AUTH.user.id+':'+me();
 const editFileKey=job=>job.fileKey||editOwner()+':'+job.packet.operationId;
 function openEditFiles(){return editFilesDb??=new Promise((resolve,reject)=>{const r=indexedDB.open('dailylog-task-edit-files-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('jobs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>{editFilesDb=null;reject(r.error);};});}
 async function editFiles(job,files){
  if(files===undefined&&!job.fileIds?.length)return [];
  if(files!==undefined&&!files.length)return [];
  const db=await openEditFiles();return new Promise((resolve,reject)=>{const tx=db.transaction('jobs',files===undefined?'readonly':'readwrite'),store=tx.objectStore('jobs');let result;
   if(files===undefined){const r=store.get(editFileKey(job));r.onsuccess=()=>{result=r.result;};}else store.put(files,editFileKey(job));
   tx.oncomplete=()=>{if(files===undefined&&(!result||job.fileIds.some(id=>!result.some(f=>f.id===id))))reject(Error('裝置未能讀回附件，內容仍保留，請恢復編輯。'));else resolve(result||files);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('裝置無法保留附件。'));
  });
 }
 async function restoreEditFiles(job){try{const files=await editFiles(job);dialog().querySelector('[data-attachments]')?.attachmentControl?.restoreQueue?.(files);}catch(e){error(e.message);}}
 function editConflict(){return Object.assign(Error('任務另有修改，內容與附件已保留，請恢復編輯確認最新版本。'),{status:409});}
 function onlyOwnAttachmentUpdates(job,latest,attachments){
  const previous=job.task,old=previous.history||[],history=latest.history||[],delta=latest.version-previous.version;
  if(delta===0)return true;
  // Lists retain the last 12 events without large detail fields. Match that tail
  // against the same version in the complete history, not against its first row.
  const end=history.length-delta,offset=end-old.length;
  if(!Number.isSafeInteger(delta)||delta<1||!old.length||offset<0)return false;
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  const sameEvent=(a,b)=>{
   if(!a?.id||a.id!==b?.id)return false;
   const left={...a},right={...b};
   // These fields are omitted by the public summary or a detail read path.
   // When both copies contain a detail field, changes must still be rejected.
   for(const key of ['before','after','snapshot','signature','workSignature'])if(!(key in left)||!(key in right)){delete left[key];delete right[key];}
   return JSON.stringify(stable(left))===JSON.stringify(stable(right));
  };
  if(old.some((h,i)=>!sameEvent(h,history[offset+i])))return false;
  const extra=history.slice(end);
  const ids=new Set(job.attachmentIds||[]),files=new Map(attachments.filter(f=>!f.removedAt&&f.actor===me()).map(f=>['op-'+f.id.slice(4),f]));
  return extra.every(h=>{const f=files.get(h.id);return f&&ids.has(f.id)&&h.kind==='comment'&&h.actor?.account===me()&&h.text==='上傳附件：'+f.name;});
 }
 async function restoreOwnAttachmentVersion(job,latest){
  // Reopening a retained failed draft may safely adopt only its proven uploads.
  // This does not send the edit; the user still reviews and presses Save.
  try{
   if(job.owner!==editOwner())return false;
   const list=(await editAttachmentRequest('/api/attachments/normal/'+latest.id,undefined,job)).attachments;
   if(!onlyOwnAttachmentUpdates(job,latest,list))return false;
   const before={task:job.task,packet:job.packet,conflict:job.conflict,message:job.message};
   Object.assign(job,{task:structuredClone(latest),packet:{...job.packet,version:latest.version},conflict:false,message:'附件已保存，原輸入已保留，請確認後儲存。'});
   try{storeBackground();}catch(e){Object.assign(job,before);return false;}
   active.task=latest;error(job.message);return true;
  }catch{return false;}
 }
 function ensureEditOwner(job){if(job.owner!==editOwner())throw Error('登入身分已變更，請回原帳號重試。');}
 async function editTaskRequest(job,id,packet){ensureEditOwner(job);const result=await dailylogRequest('/api/tasks/'+id,packet);ensureEditOwner(job);return result;}
 async function editAttachmentRequest(route,body,job){ensureEditOwner(job);const r=await fetch(route,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000),headers:body?{'X-DailyLog-CSRF':window.DAILYLOG_AUTH.csrfToken}:{},...(body?{body}:{})}),value=await r.json();ensureEditOwner(job);if(!r.ok)throw Object.assign(Error(value.error||'附件保存尚未確認，請重試。'),{status:r.status});return value;}
 async function queueAttachmentEdit(values,form){
  const card=active,task=card.task,id=task.id,old=backgroundEdits.get(id);if(form.dataset.editRetaining==='true'||old?.state==='saving')return false;
  const controller=dialog().querySelector('[data-attachments]')?.attachmentControl,snapshot=controller?.snapshot?.()||{queue:[],uploadedIds:[]};
  const same=old&&JSON.stringify({...old.packet,version:undefined,operationId:undefined})===JSON.stringify(values)&&old.packet.version===task.version;
  const packet=same?old.packet:{...values,version:task.version,operationId:'op-'+crypto.randomUUID()};
  const fields=[...dialog().querySelectorAll('input[name]:not([type=file]),textarea[name],select[name]')].filter(n=>n.form===form).map(n=>({name:n.name,value:n.value,checked:n.checked}));
  const job={task:structuredClone(task),packet,fields,state:'saving',owner:editOwner(),fileKey:editOwner()+':'+packet.operationId,fileIds:snapshot.queue.map(f=>f.id),attachmentIds:[...new Set([...snapshot.uploadedIds,...snapshot.queue.map(f=>f.id),...(old?.attachmentIds||[])])],personalReportAccount:form.dataset.personalReportAccount||old?.personalReportAccount||null,controller};
  const controls=[...dialog().querySelectorAll('button,input,textarea,select')].map(node=>({node,disabled:node.disabled}));form.dataset.editRetaining='true';controls.forEach(({node})=>node.disabled=true);
  try{
   await editFiles(job,snapshot.queue);ensureEditOwner(job);if(active!==card||!dialog().open)throw Error('卡片已改變，請重新確認後儲存。');
   backgroundEdits.set(id,job);try{storeBackground();}catch(e){if(old)backgroundEdits.set(id,old);else backgroundEdits.delete(id);throw e;}
   delete form.dataset.personalReportAccount;dialog().close();render();paintBackground();void sendBackground(id);return true;
  }catch(e){error('裝置無法保留待儲存內容與附件，畫面已保留，請重試。');return false;}
  finally{delete form.dataset.editRetaining;controls.forEach(({node,disabled})=>node.disabled=disabled);}
 }
 async function sendAttachmentEdit(id){
  const job=backgroundEdits.get(id);if(!job||job.busy)return false;job.busy=true;job.state='saving';job.message='';
  try{
   job.owner||=editOwner();ensureEditOwner(job);storeBackground();paintBackground();render();
   const files=await editFiles(job);await job.controller?.settle?.();
   const route='/api/attachments/normal/'+id;let latest=(await editTaskRequest(job,id)).task;
   const confirmed=task=>task?.history?.some(h=>h.id===job.packet.operationId&&h.kind==='edit');
   if(!confirmed(latest)){
    if(!canEditTask(latest))throw Object.assign(Error('目前沒有編輯權限，內容已保留。'),{status:403});
    let list=(await editAttachmentRequest(route,undefined,job)).attachments;
    // Legacy failed commands also retain their original history and can recognize their own uploads.
    if(!job.attachmentIds)job.attachmentIds=list.filter(f=>f.actor===me()).map(f=>f.id);
    if(!onlyOwnAttachmentUpdates(job,latest,list))throw editConflict();
    for(const item of files){const body=new FormData();body.append('id',item.id);body.append('file',item.file);await editAttachmentRequest(route,body,job);}
    latest=(await editTaskRequest(job,id)).task;list=(await editAttachmentRequest(route,undefined,job)).attachments;
    if(!onlyOwnAttachmentUpdates(job,latest,list))throw editConflict();
    job.packet={...job.packet,version:latest.version};storeBackground();
    const result=await editTaskRequest(job,id,job.packet);if(!confirmed(result.task))throw Error('尚未收到儲存確認，內容與附件已保留，請重試。');latest=result.task;
   }
   backgroundEdits.delete(id);try{storeBackground();}catch(e){backgroundEdits.set(id,job);throw e;}
   if((taskFor(id)?.version||0)<=latest.version)accept(latest);else void reload();
   if(job.fileIds?.length)void openEditFiles().then(db=>{db.transaction('jobs','readwrite').objectStore('jobs').delete(editFileKey(job));}).catch(()=>{});
   toast('任務資料與附件已儲存。');if(job.personalReportAccount)personalReportSaved(id,latest,job.personalReportAccount);return true;
  }catch(e){job.state='failed';job.message=e.message;job.conflict=[401,403,404,409].includes(e.status);if(job.owner===editOwner()){try{storeBackground();}catch{}render();toast('！儲存尚未完成，內容與附件已保留，可在上方重試。');}return false;}
  finally{job.busy=false;if(job.owner!==editOwner()&&backgroundEdits.get(id)===job)backgroundEdits.delete(id);paintBackground();}
 }

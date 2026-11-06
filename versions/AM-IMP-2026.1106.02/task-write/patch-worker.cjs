const assert=require('node:assert/strict');
function patchClients(source){
 let worker=source;
const literal=prefix=>{const at=source.indexOf(prefix);assert(at>=0,prefix);const raw=source.slice(at+prefix.length).match(/^"(?:\\.|[^"\\])*"/);assert(raw,prefix);return {raw:raw[0],value:JSON.parse(raw[0]),at:at+prefix.length};};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Changed anchor: '+a.slice(0,90));return s.replace(a,b);};
const edit=literal('taskSaveAttachmentsResponse(request,await google_renewal_worker.fetch(request,env,ctx),');
let e=edit.value;
e=once(e,"personalReportAccount:form.dataset.personalReportAccount||old?.personalReportAccount||null,controller}","personalReportAccount:form.dataset.personalReportAccount||old?.personalReportAccount||null,controller,directWrite:true}");
e=once(e,"const route='/api/attachments/normal/'+id;let latest=(await editTaskRequest(job,id)).task;\n   const confirmed=task=>task?.history?.some(h=>h.id===job.packet.operationId&&h.kind==='edit');",`const route='/api/attachments/normal/'+id;
   const confirmed=task=>task?.history?.some(h=>h.id===job.packet.operationId&&h.kind==='edit');
   let latest;
   // The protected mutation already checks current permission, revision and operation ID.
   // Use it once for a new edit without uploads; uncertain retries retain the read-first recovery.
   if(job.directWrite===true&&!job.attempted&&!files.length&&Array.isArray(job.attachmentIds)&&!(typeof isIssueTask==='function'&&isIssueTask(job.task))){
    job.attempted=true;storeBackground();
    try{latest=(await editTaskRequest(job,id,job.packet)).task;}
    catch(error){if(error.status!==409||!job.attachmentIds.length)throw error;}
    if(latest&&!confirmed(latest))throw Error('尚未收到儲存確認，內容與附件已保留，請重試。');
   }
   if(!latest){
   let initialList;[latest,initialList]=await Promise.all([editTaskRequest(job,id).then(r=>r.task),editAttachmentRequest(route,undefined,job).then(r=>r.attachments)]);`);
e=once(e,"let list=(await editAttachmentRequest(route,undefined,job)).attachments;","let list=initialList;");
e=once(e,"latest=(await editTaskRequest(job,id)).task;list=(await editAttachmentRequest(route,undefined,job)).attachments;","if(files.length)[latest,list]=await Promise.all([editTaskRequest(job,id).then(r=>r.task),editAttachmentRequest(route,undefined,job).then(r=>r.attachments)]);");
e=once(e,"   backgroundEdits.delete(id);try{storeBackground();}","   }\n   backgroundEdits.delete(id);try{storeBackground();}");
const comment=literal('const quickCommentClient=');let c=comment.value;
c=once(c,"state:'pending',createdAt:Date.now()","state:'pending',createdAt:Date.now(),directWrite:true");
c=once(c,"let latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task;checkOwner();\n   if(!(latest.history||[]).some(h=>h.id===job.id)){",`// New plain text comments can use the existing atomic write immediately.
   // Retried/legacy jobs and photos still check the recorded result before any upload.
   const readFirst=job.directWrite!==true||job.attempted||job.files.length;
   let latest=readFirst?(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task:null;checkOwner();
   if(!(latest?.history||[]).some(h=>h.id===job.id)){`);
c=once(c,"    latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task;checkOwner();\n    job.packet.version=latest.version;await storeQuickComment(job);checkOwner();","    if(job.files.length)latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task;checkOwner();\n    if(latest)job.packet.version=latest.version;job.attempted=true;await storeQuickComment(job);checkOwner();");
// Replace from the end so offsets from the unchanged baseline remain exact.
for(const item of [{...edit,value:e},{...comment,value:c}].sort((a,b)=>b.at-a.at))worker=worker.slice(0,item.at)+JSON.stringify(item.value)+worker.slice(item.at+item.raw.length);

 return {worker,editClient:e,commentClient:c};
}
function patchWorker(source){return patchClients(source).worker;}
module.exports={patchWorker,patchClients};

// Portable orchestration checks using synthetic network replies. These are not
// substitutes for the separately recorded complete Worker/D1 and browser tests.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {patchClients,patchWorker}=require('./patch-worker.cjs');
const edit=fs.readFileSync(path.join(__dirname,'fixtures/edit-client.js'),'utf8'),comment=fs.readFileSync(path.join(__dirname,'fixtures/comment-client.js'),'utf8');
const source='/* preserve-before */\nconst quickCommentClient='+JSON.stringify(comment)+';\nfunction fixture(request,env,ctx){return taskSaveAttachmentsResponse(request,await google_renewal_worker.fetch(request,env,ctx),'+JSON.stringify(edit)+');}\n/* preserve-after */';
const patched=patchClients(source);
function functionSource(s,start,end){const a=s.indexOf(start),b=end?s.indexOf(end,a):s.length;assert(a>=0&&b>a);return s.slice(a,b);}
const editFn=s=>functionSource(s,' async function sendAttachmentEdit(id){',null);
const commentFn=s=>functionSource(s,' async function runQuickComment(job){',' async function sendQuickComment(id){');
const fail=status=>Object.assign(Error('synthetic '+status),{status});
function harness(kind,{original=false,existingFiles=false,attempted=false,version=1,deny=0,lost=false,persistFails=false,ownedAdvance=false}={}){
 const calls=[],owner='synthetic-user:alice',job={id:'op-comment',taskId:'work-synthetic',title:'Synthetic task',owner,text:'Synthetic reply',files:[],fileIds:[],attachmentIds:existingFiles?['att-existing']:[],task:{id:'work-synthetic',version:1,history:[{id:'created',kind:'created'}]},packet:{kind:kind==='edit'?'edit':'comment',version:1,operationId:kind==='edit'?'op-edit':'op-comment',text:'Synthetic reply'},directWrite:true,attempted,state:'pending'};
 let current={id:job.taskId,version,history:structuredClone(job.task.history)},lostOnce=lost,quota=persistFails;
 const request=async(route,packet)=>{calls.push(packet?'POST':'GET');if(deny)throw fail(deny);if(!packet)return {task:structuredClone(current)};if(current.history.some(h=>h.id===packet.operationId))return {task:structuredClone(current)};if(packet.version!==current.version)throw fail(409);current={...current,version:current.version+1,history:[...current.history,{id:packet.operationId,kind:packet.kind,text:packet.text}]};if(lostOnce){lostOnce=false;throw fail(503);}return {task:structuredClone(current)};};
 const retain=()=>{if(quota){quota=false;throw Error('synthetic persistence failure');}},jobs=new Map([[kind==='edit'?job.task.id:job.id,job]]);
 const context=vm.createContext({Error,Map,Set,JSON,Object,Promise,Array,Number,encodeURIComponent,structuredClone,backgroundEdits:jobs,quickCommentJobs:jobs,editOwner:()=>owner,quickCommentOwner:()=>owner,ensureEditOwner:j=>{if(j.owner!==owner)throw fail(403);},storeBackground:retain,storeQuickComment:async()=>retain(),paintBackground(){},paintQuickComments(){},render(){},toast(){},editFiles:async()=>[],canEditTask:()=>true,onlyOwnAttachmentUpdates:(j,t)=>ownedAdvance||j.task.version===t.version,editConflict:()=>fail(409),editTaskRequest:(j,id,p)=>request(id,p),dailylogRequest:request,editAttachmentRequest:async()=>{calls.push('ATTACHMENTS');return {attachments:existingFiles?[{id:'att-existing',actor:'alice'}]:[]};},me:()=> 'alice',taskFor:()=>null,accept(){},reload(){},personalReportSaved(){}});
 const code=kind==='edit'?editFn(original?edit:patched.editClient):commentFn(original?comment:patched.commentClient);vm.runInContext(code+'\nglobalThis.run='+ (kind==='edit'?'sendAttachmentEdit':'runQuickComment')+';',context);
 return {calls,job,jobs,current:()=>current,run:()=>context.run(kind==='edit'?job.task.id:job)};
}
test('portable patch preserves surrounding code and rejects unknown/already patched clients',()=>{
 assert(patched.worker.startsWith('/* preserve-before */'));assert(patched.worker.endsWith('/* preserve-after */'));assert.equal(patchWorker(source),patched.worker);assert.throws(()=>patchWorker('unrecognized source'));assert.throws(()=>patchWorker(patched.worker));
 new vm.Script(patched.editClient);new vm.Script(patched.commentClient);
});
test('new edits reduce five synthetic request boundaries to one without new attachments',async()=>{
 for(const existingFiles of [false,true]){const before=harness('edit',{original:true,existingFiles}),after=harness('edit',{existingFiles});assert.equal(await before.run(),true);assert.equal(await after.run(),true);assert.deepEqual(before.calls,['GET','ATTACHMENTS','GET','ATTACHMENTS','POST']);assert.deepEqual(after.calls,['POST']);assert.equal(after.current().history.filter(h=>h.id==='op-edit').length,1);assert.equal(after.jobs.size,0);}
});
test('plain text comments reduce three synthetic request boundaries to one',async()=>{
 const before=harness('comment',{original:true}),after=harness('comment');await before.run();await after.run();assert.deepEqual(before.calls,['GET','GET','POST']);assert.deepEqual(after.calls,['POST']);assert.equal(after.jobs.size,0);
});
test('a true edit version conflict retains the draft and never rebases silently',async()=>{
 const h=harness('edit',{version:2});assert.equal(await h.run(),false);assert.deepEqual(h.calls,['POST']);assert.equal(h.job.conflict,true);assert.equal(h.job.packet.version,1);assert.equal(h.jobs.size,1);assert.equal(h.current().history.length,1);
});
test('proven own attachment advance still uses original explicit reconciliation',async()=>{
 const h=harness('edit',{existingFiles:true,version:2,ownedAdvance:true});assert.equal(await h.run(),true);assert.deepEqual(h.calls,['POST','GET','ATTACHMENTS','POST']);assert.equal(h.job.packet.version,2);assert.equal(h.current().history.filter(x=>x.id==='op-edit').length,1);
});
test('comments preserve bounded conflict retry and record the fresh version',async()=>{
 const h=harness('comment',{version:2});await h.run();assert.deepEqual(h.calls,['POST','GET','POST']);assert.equal(h.job.packet.version,2);assert.equal(h.jobs.size,0);
});
test('lost comment reply is read back on retry and never resent',async()=>{
 const h=harness('comment',{lost:true});await h.run();assert.equal(h.job.state,'failed');assert.equal(h.job.attempted,true);assert.equal(h.jobs.size,1);await h.run();assert.deepEqual(h.calls,['POST','GET']);assert.equal(h.current().history.filter(x=>x.id==='op-comment').length,1);assert.equal(h.jobs.size,0);
});
test('lost edit reply is read back on retry with the original operation',async()=>{
 const h=harness('edit',{lost:true});assert.equal(await h.run(),false);assert.equal(h.job.attempted,true);assert.equal(await h.run(),true);assert.deepEqual(h.calls,['POST','GET','ATTACHMENTS']);assert.equal(h.current().history.filter(x=>x.id==='op-edit').length,1);
});
test('authorization rejection retains either command and causes no local success',async()=>{
 for(const kind of ['edit','comment']){const h=harness(kind,{deny:403});await h.run();assert.equal(h.job.state,'failed');assert.equal(h.jobs.size,1);assert.equal(h.current().history.length,1);assert.deepEqual(h.calls,['POST']);}
});
test('device persistence failure sends no network request',async()=>{
 for(const kind of ['edit','comment']){const h=harness(kind,{persistFails:true});await h.run();assert.deepEqual(h.calls,[]);assert.equal(h.jobs.size,1);}
});
test('legacy commands retain their read-first handling',async()=>{
 const e=harness('edit'),c=harness('comment');delete e.job.directWrite;delete c.job.directWrite;await e.run();await c.run();assert.deepEqual(e.calls,['GET','ATTACHMENTS','POST']);assert.deepEqual(c.calls,['GET','POST']);
});

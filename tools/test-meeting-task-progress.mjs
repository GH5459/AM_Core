import test from 'node:test';
import assert from 'node:assert/strict';
import {meetingTaskProgress,TASK_PROGRESS_CONTRACT} from '../modules/meetings/task-progress.js';
import {readMeetingProgress} from '../modules/meetings/dailylog-progress.mjs';
import {Readable} from 'node:stream';
const id='a'.repeat(64),todo='todo:11111111-1111-4111-8111-111111111111',other='todo:22222222-2222-4222-8222-222222222222';
const fields={[todo]:{content:'合成待辦',ownerId:'owner',due:'2026-10-19'},[other]:{content:'待分派',ownerId:'',due:''}};
const r={id,state:'published',fields,receipt:{}},actor={id:'viewer'},now=()=>Date.parse('2026-10-20T01:30:00Z');
test('summary follows original task state, due date, evidence, reopening and reassignment without writes',async()=>{
 let calls=0,status='done',due='2026-10-21',fail=false;
 const q={task_tenant:'fixture',applied_fields:structuredClone(fields)};
 const read=meetingTaskProgress({now,pool:{query:async sql=>{assert(sql.startsWith('SELECT'));return {rows:[q]};}},platform:{readMeetingTaskProgress:async v=>{calls++;assert.deepEqual(v.todoIds,[todo]);if(fail)throw Error('offline');return {contract:TASK_PROGRESS_CONTRACT,items:[{todoId:todo,status,due,result:'成果與附件已存於原任務',url:'https://fixture.example/?task=original',hasEvidence:true}]};}}});
 assert.equal(await read({...r,state:'review'},actor),null);assert.equal(calls,0);
 let p=await read(r,actor);assert.equal(p.counts.done,1);assert.equal(p.counts.unassigned,1);assert.equal(p.counts.overdue,0);assert.equal(p.items[0].result,'成果與附件已存於原任務');
 status='in_progress';due='2026-10-19';p=await read(r,actor);assert.equal(p.counts.done,0);assert.equal(p.counts.in_progress,1);assert.equal(p.counts.overdue,1);
 due='';p=await read(r,actor);assert.equal(p.items[0].due,'');assert.equal(p.counts.overdue,0);
 fail=true;p=await read(r,actor);assert.equal(p.available,false);assert.equal(p.counts.unknown,1);assert(!p.items[0].result);assert(!p.checkedAt);
 q.applied_fields[todo].ownerId='previous-owner';p=await read(r,actor);assert.equal(p.counts.pending_delivery,1);assert.equal(p.counts.done,0);assert.equal(calls,4);
});
test('machine read validates tenant/source, minimizes private evidence, missing evidence stays pending confirmation',async()=>{
 const task={status:'done',dueDate:'2026-10-21',finalResult:'報價附件已保留',updatedAt:'2026-10-20',meetingSource:{workspaceId:id,todoId:todo},requester:{account:'host'}};
 const input={contract:TASK_PROGRESS_CONTRACT,tenantKey:'fixture',id,host:{account:'host',bindingId:'bound'},viewer:{account:'owner'},todoIds:[todo]};
 let allowed=true,reads=0;
 const env={LEAF_TASK_TENANT:'fixture',PUBLIC_ORIGIN:'https://fixture.example/',DB:{prepare:sql=>{assert(sql.startsWith('SELECT'));return {bind:key=>({first:async()=>{assert(key.startsWith('work-'));reads++;return {value:JSON.stringify(task)};}})};}}};
 const options={directory:async()=>({people:[{account:'host'},{account:'owner'}],assertCurrent:async()=>{}}),permission:()=>true,core:{createTaskService:()=>({get:async()=>{if(!allowed)throw Object.assign(Error('denied'),{status:404});}})}};
 let p=await readMeetingProgress(input,env,options);assert.equal(p.items[0].status,'done');assert.equal(p.items[0].result,task.finalResult);assert(p.items[0].url.includes('?task=work-'));
 allowed=false;p=await readMeetingProgress(input,env,options);assert.equal(p.items[0].result,'');assert(p.items[0].evidenceRestricted);assert.equal(p.items[0].status,'done');
 task.finalResult='';p=await readMeetingProgress(input,env,options);assert.equal(p.items[0].status,'pending_confirmation');
 task.status='in_progress';p=await readMeetingProgress(input,env,options);assert.equal(p.items[0].status,'in_progress');
 await assert.rejects(()=>readMeetingProgress({...input,tenantKey:'other'},env,options),/INVALID_MEETING_PROGRESS/);
 task.meetingSource.workspaceId='b'.repeat(64);await assert.rejects(()=>readMeetingProgress(input,env,options),/MEETING_TASK_SOURCE_MISMATCH/);
 assert.equal(reads,5);
});
test('authenticated meeting route refreshes without changing meeting revision or sending LINE; public and outsiders stay isolated',async()=>{
 process.env.MEETING_WORKSPACE_PREVIEW='1';
 const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
 try{
  const row=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0],key=Object.keys(row.fields).find(k=>k.startsWith('todo:')),sent=f.pushes.length;
  let current='done';f.platform.readMeetingTaskProgress=async()=>({contract:TASK_PROGRESS_CONTRACT,items:[{todoId:key,status:current,due:'2026-10-22',result:current==='done'?'來源附件已存原任務':'',url:'https://fixture.example/?task=original',hasEvidence:current==='done'}]});
  async function api(token='host'){
   let code=200,body='';const req=Readable.from([JSON.stringify({action:'read'})]);req.method='POST';req.headers={origin:f.platform.publicBaseUrl,...token?{authorization:'Bearer '+token}:{}};
   const res={headersSent:false,setHeader(){},writeHead(s){code=s;},set statusCode(s){code=s;},get statusCode(){return code;},end(v){body=v;}};
   await f.service.handle(req,res,new URL(f.platform.publicBaseUrl+'/meetings/review/work/'+row.id+'/api'));return {code,value:JSON.parse(body)};
  }
  let a=await api();assert.equal(a.code,200);assert.equal(a.value.taskProgress.counts.done,1);assert.equal(a.value.taskProgress.items[0].result,'來源附件已存原任務');
  current='in_progress';a=await api('member');assert.equal(a.value.taskProgress.counts.done,0);assert.equal(a.value.taskProgress.counts.in_progress,1);assert.equal(a.value.workspace.revision,Number(row.revision));
  assert.equal((await api('outside')).code,403);
  await f.pg.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=true WHERE id=$1',[row.id]);a=await api('');assert.equal(a.value.access,'public');assert(!a.value.taskProgress);assert(!JSON.stringify(a.value).includes('fixture.example/?task'));
  assert.equal(f.pushes.length,sent);assert.equal((await f.service.store.get(row.id)).revision,row.revision);
 }finally{await f.pg.close();}
});

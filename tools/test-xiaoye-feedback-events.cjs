const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
process.env.DAILYLOG_XIAOYE_FIXTURE=path.join(process.env.DAILYLOG_XIAOYE_PACKAGE,'event-fixture.cjs');
const {setup,proposal,owner}=require('./test-xiaoye-worker.cjs'),op=()=>crypto.randomUUID(),wait=ms=>new Promise(r=>setTimeout(r,ms));
test('owner feedback creates one native revision event, fences execution and needs fresh approval after event-generated version two',async()=>{const a=await setup();try{
 const taskId=(await a.ok(await a.intake({text:'完整原文：只驗證資料保存'}))).taskId;let task=await a.get(taskId);const original=task.description;
 const events=async()=>(await a.db.prepare('SELECT * FROM xiaoye_event_outbox ORDER BY created_at').all()).results;
 const acquire=async e=>{await wait(e.kind==='analyze'?5200:1200);return a.ok(await a.machine('runner/event-acquire',{id:e.id,operationId:op()},true));};
 const complete=job=>a.ok(a.machine('runner/event-complete',{id:job.id,lease:job.lease,operationId:op()},true));
 let acquired=await acquire((await events())[0]),job=acquired.job;
 task=(await a.ok(await a.machine('runner/propose',{id:task.id,version:task.version,operationId:op(),projectId:a.projects[1].id,category:'help',proposal,eventId:job.id,eventLease:job.lease},true))).task;
 await a.ok(await a.machine('runner/event-complete',{id:job.id,lease:job.lease,operationId:op()},true));task=(await a.approve(task)).task;acquired=await acquire((await events()).at(-1));job=acquired.job;
 const claim=await a.ok(await a.machine('runner/claim',{id:task.id,operationId:op(),eventId:job.id,eventLease:job.lease},true));task=claim.task;
 const feedback={operationId:op(),version:task.version,proposalHash:task.secretary.proposal.hash,detail:'請先比對原文，不要修改程式。'};
 task=(await a.ok(await a.send(owner,'/api/xiaoye/issues/'+task.id+'/feedback',feedback))).task;await a.ok(await a.send(owner,'/api/xiaoye/issues/'+task.id+'/feedback',feedback));const all=await events();assert.equal(all.length,3);assert.equal(all.at(-1).kind,'analyze');assert.equal(all.at(-1).task_id,task.id);assert.equal(all.at(-1).version,task.version);
 assert.equal((await a.machine('runner/check',{id:task.id,lease:claim.lease},true)).status,403);assert.equal((await a.machine('runner/event-check',{id:job.id,lease:job.lease},true)).status,409);
 acquired=await acquire(all.at(-1));assert.equal(acquired.task.secretary.ownerFeedback[0].text,feedback.detail);job=acquired.job;task=(await a.ok(await a.machine('runner/propose',{id:task.id,version:task.version,operationId:op(),projectId:a.projects[1].id,category:'help',proposal:{...proposal,summary:'依主管建議只比對原文，不修改程式。'},eventId:job.id,eventLease:job.lease},true))).task;await a.ok(await a.machine('runner/event-complete',{id:job.id,lease:job.lease,operationId:op()},true));assert.equal(task.secretary.proposal.version,2);assert.equal(task.secretary.approval,null);assert.equal(task.description,original);assert.equal((await a.ok(await a.machine('runner/event-status',{},true))).alarmScheduled,false);
 }finally{await a.close();}});

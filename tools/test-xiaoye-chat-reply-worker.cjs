'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup}=require('./test-xiaoye-worker.cjs');
const {deliverReporterReply}=require('./xiaoye-chat-reply.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const type of ['question','answer'])test('original case receives '+type+' through the existing event and notification APIs',async()=>{
 const a=await setup();try{
  const created=await a.ok(await a.intake()),event=(await a.db.prepare('SELECT * FROM xiaoye_event_outbox ORDER BY created_at').all()).results[0];
  await wait(5200);const acquired=await a.ok(await a.machine('runner/event-acquire',{id:event.id,operationId:'fixture-acquire-'+crypto.randomUUID()},true));const job=acquired.job;
  const reply=type==='question'?{type,text:'請問發生在哪個畫面？'}:{type,text:'請先重新開啟畫面。',explanation:{cause:'畫面未更新。',handling:'提供重新開啟方式。',outcome:'請確認畫面。'},evidence:['隔離示例畫面']};
  if(type==='answer'){const t=await a.get(created.taskId);const tooLong=await a.machine('runner/answer',{id:t.id,version:t.version,operationId:crypto.randomUUID(),eventId:job.id,eventLease:job.lease,projectId:a.projects[0].id,result:'x'.repeat(2001),explanation:reply.explanation,evidence:reply.evidence,conversationReply:true},true);assert.equal(tooLong.status,400);}
  let lost=true;const args={reply,job,check:async()=>a.ok(await a.machine('runner/event-check',{id:job.id,lease:job.lease},true)),call:async(action,input)=>{const result=await a.ok(await a.machine('runner/'+action,input,true));if(lost){lost=false;throw Error('simulated lost response');}return result;}};
  assert.equal(await deliverReporterReply(args),true);assert.equal(await deliverReporterReply(args),false);
  const task=await a.get(created.taskId);assert.equal(task.id,job.taskId);assert.equal(task.secretary.stage,type==='question'?'clarifying':'awaiting_confirmation');assert.equal(!!task.secretary.waitingForReporter,type==='question');
  const rows=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')=?").bind(type==='question'?'question':'result').all()).results;
  assert.equal(rows.length,1);const notice=JSON.parse(rows[0].value);assert.equal(notice.taskId,created.taskId);assert.equal(notice.account,'900003');assert.equal(notice.expectedUserId,'U'+'b'.repeat(32));
  if(type==='answer')assert(notice.message.includes(reply.text),'the complete answer must be visible to the reporter');
  assert.equal((await a.ok(await a.machine('runner/event-complete',{id:job.id,lease:job.lease,operationId:'complete-'+job.id},true))).state,'done');
 }finally{await a.close();}
});

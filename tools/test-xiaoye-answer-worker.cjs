const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup}=require('./test-xiaoye-worker.cjs');
const op=()=>crypto.randomUUID();
test('a current analysis event can send evidence-backed guidance and awaits reporter confirmation',async()=>{
 const a=await setup();try{
  const issue=await a.ok(await a.intake({text:'隔離示例：如何開啟會議？'}));
  const row=await a.db.prepare('SELECT * FROM xiaoye_event_outbox WHERE task_id=?').bind(issue.taskId).first();
  await new Promise(resolve=>setTimeout(resolve,5300));
  const acquired=await a.ok(await a.machine('runner/event-acquire',{id:row.id,operationId:'test-acquire-'+row.id},true));
  const input={id:issue.taskId,version:acquired.task.version,eventId:acquired.job.id,eventLease:acquired.job.lease,operationId:op(),projectId:a.projects[1].id,title:'隔離示例的會議入口',result:'從工作日誌選會議。',explanation:{cause:'詢問會議入口。',handling:'在工作日誌選擇會議分頁。',outcome:'請開啟後確認是否找到。'},evidence:['隔離畫面及說明']};
  assert.equal((await a.machine('runner/answer',{...input,operationId:op(),eventLease:'bad'},true)).status,403);
  assert.equal((await a.machine('runner/answer',{...input,operationId:op(),evidence:[]},true)).status,400);
  const answered=await a.ok(await a.machine('runner/answer',input,true));assert.equal(answered.task.secretary.stage,'awaiting_confirmation');assert.equal(answered.task.secretary.category,'help');assert.equal(answered.task.primaryParentId,a.projects[1].id);assert.equal(answered.task.secretary.result.deployed,false);
  assert((await a.ok(await a.machine('runner/answer',input,true))).replayed);
  const notice=await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='result'").first();assert(JSON.parse(notice.value).message.includes('工作日誌選擇會議分頁'));
  const oldResultVersion=answered.task.version;
  const linked=await a.ok(await a.machine('runner/bind-chat',{id:issue.taskId,version:oldResultVersion,eventId:acquired.job.id,eventLease:acquired.job.lease,operationId:op(),threadId:op(),projectId:op(),hostId:'local'},true));
  assert.equal(linked.task.version,oldResultVersion+1);
  assert.equal((await a.ok(await a.machine('runner/event-complete',{id:acquired.job.id,lease:acquired.job.lease,operationId:op()},true))).state,'done');
  const bot='U'+'a'.repeat(32),user='U'+'b'.repeat(32);a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const confirm={sender:{account:'900003',userId:user,botUserId:bot},source:{eventType:'postback',type:'user',botUserId:bot,userId:user,conversationId:user,eventId:op(),timestamp:Date.now(),postbackData:'xiaoye:result:confirm:'+issue.taskId+':'+oldResultVersion}};
  assert((await a.ok(await a.machine('reporter',confirm))).confirmed);assert.equal((await a.get(issue.taskId)).secretary.stage,'closed');
 }finally{await a.close();}
});

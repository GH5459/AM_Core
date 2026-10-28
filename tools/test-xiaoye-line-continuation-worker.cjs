const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup}=require('./test-xiaoye-worker.cjs');
const bot='U'+'a'.repeat(32),user='U'+'b'.repeat(32),op=()=>crypto.randomUUID();
test('reporter selects still unresolved and supplements the same card directly in LINE',async()=>{
 const a=await setup();try{
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  let task=await a.get((await a.ok(await a.intake())).taskId);task=(await a.propose(task)).task;task=(await a.approve(task)).task;
  const claimed=await a.ok(await a.machine('runner/claim',{id:task.id,operationId:op()},true));
  await a.ok(await a.machine('runner/finish',{id:task.id,lease:claimed.lease,result:'隔離完成，請再試。',explanation:{cause:'隔離示例原因。',handling:'已處理隔離示例。',outcome:'隔離測試通過，請確認。'},deployed:false,evidence:['隔離證據'],operationId:op()},true));
  task=await a.get(task.id);const before=task.version,priorProposal=task.secretary.proposal.hash;
  const {createXiaoyeSecretary}=await import('../core/xiaoye-secretary.js'),replies=[];
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6yVQAAAAASUVORK5CYII=';
  const adapter=createXiaoyeSecretary({env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tasks:{meetingShareIdentity:async()=>({account:'900003',tenantKey:'fixture'}),secretaryCall:async(route,input)=>a.ok(await a.machine(route,input))},line:{replyLineMessage:async(_,value)=>replies.push(value),downloadLineContent:async()=>({buffer:Buffer.from(png,'base64')})}});
  const choice={type:'postback',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),postback:{data:'xiaoye:result:reopen:'+task.id+':'+task.version}};
  await adapter.capture([choice]);assert.match(replies.at(-1),/直接在這裡傳文字或照片/);assert.equal((await a.get(task.id)).version,before);
  const message={type:'message',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),message:{type:'text',id:op(),text:'手機仍然沒有反應'}};
  await adapter.capture([message]);const updated=await a.get(task.id);
  assert.equal(updated.id,task.id);assert.equal(updated.secretary.stage,'clarifying');assert(updated.description.includes('手機仍然沒有反應'));
  assert.equal(updated.secretary.proposalHistory.at(-1).hash,priorProposal);
  assert.equal(updated.secretary.resultHistory.at(-1).text,'隔離完成，請再試。');
  await adapter.capture([{type:'message',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),message:{type:'image',id:op()}}]);
  const files=await a.ok(await a.machine('runner/attachments',{id:task.id},true));assert.equal(files.attachments.length,1);
  const image=await a.machine('runner/attachment/'+files.attachments[0].id,{id:task.id},true);assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),png);
  assert.equal((await a.machine('reporter',{sender:{account:'900003',userId:user,botUserId:bot},source:{eventType:'postback',type:'user',botUserId:bot,userId:user,conversationId:user,eventId:op(),timestamp:Date.now(),postbackData:choice.postback.data}})).status,409);
 }finally{await a.close();}
});

test('a clarification notification selects the exact case for direct LINE reply',async()=>{
 const a=await setup();try{
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  let task=await a.get((await a.ok(await a.intake())).taskId);
  task=(await a.ok(await a.machine('runner/clarify',{id:task.id,version:task.version,operationId:op(),question:'使用哪個畫面時發生？'},true))).task;
  const rows=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question'").all()).results;
  assert.equal(rows.length,1);const notice=JSON.parse(rows[0].value),data=notice.lineMessage.contents.footer.contents[0].action.data;
  assert.equal(data,'xiaoye:result:followup:'+task.id+':'+task.version);
  const {createXiaoyeSecretary}=await import('../core/xiaoye-secretary.js'),replies=[];
  const adapter=createXiaoyeSecretary({env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tasks:{meetingShareIdentity:async()=>({account:'900003',tenantKey:'fixture'}),secretaryCall:async(route,input)=>a.ok(await a.machine(route,input))},line:{replyLineMessage:async(_,value)=>replies.push(value)}});
  await adapter.capture([{type:'postback',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),postback:{data}}]);
  assert.match(replies.at(-1),/直接在這裡/);
  await adapter.capture([{type:'message',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),message:{type:'text',id:op(),text:'工作日誌畫面'}}]);
  const updated=await a.get(task.id);assert.equal(updated.id,task.id);assert.equal(updated.secretary.waitingForReporter,false);assert(updated.description.includes('工作日誌畫面'));
 }finally{await a.close();}
});

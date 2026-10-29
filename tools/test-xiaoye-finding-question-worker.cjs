const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup,proposal}=require('./test-xiaoye-worker.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventBridge}=require('./xiaoye-event-bridge.cjs');
const op=()=>crypto.randomUUID(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const bot='U'+'a'.repeat(32),user='U'+'b'.repeat(32),group='C'+'c'.repeat(32),digest='d'.repeat(64);
async function prepared(kind='user',extraBindings={}){
 const a=await setup(extraBindings);a.config.autoResolutionEnabled=true;a.config.autoResolutionEpoch=op();a.config.oaBotUserId=bot;
 await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
 const source={botUserId:bot,type:kind,conversationId:kind==='group'?group:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()};
 let t=await a.get((await a.ok(await a.intake({source,text:'隔離報告'}))).taskId);
 const analysis=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='analyze'").bind(t.id).first();await wait(5300);
 const first=(await a.ok(await a.machine('runner/event-acquire',{id:analysis.id,operationId:'acquire-'+analysis.id},true))).job;
 t=(await a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),eventId:first.id,eventLease:first.lease,projectId:a.projects[3].id,category:'bug',proposal},true))).task;
 const execution=await a.db.prepare("SELECT * FROM xiaoye_event_outbox WHERE task_id=? AND kind='execute'").bind(t.id).first();
 await a.ok(await a.machine('runner/event-complete',{id:first.id,lease:first.lease,operationId:op()},true));await wait(1200);
 const job=(await a.ok(await a.machine('runner/event-acquire',{id:execution.id,operationId:'acquire-'+execution.id},true))).job;
 const claim=await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),eventId:job.id,eventLease:job.lease},true));t=claim.task;
 const finding={id:'finding-'+op(),sourceVersion:t.secretary.sourceVersion,evidenceDigest:digest,at:new Date().toISOString(),cause:'不可向 LINE 透露的隔離內容',nextStep:'向回報同仁確認更新後是否仍有問題。'};
 t.secretary.findings=[finding];await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();
 await a.db.prepare("INSERT INTO documents(namespace,key,value) VALUES('xiaoye-case-evidence',?,?)").bind(digest,JSON.stringify({caseId:t.id,caseVersion:t.version,sourceVersion:t.secretary.sourceVersion,eventId:job.id,ownerInspectionGrant:null,evidence:{available:true,readOnly:true,digest}})).run();
 await a.ok(await a.machine('runner/event-fail',{id:job.id,lease:job.lease,operationId:op(),reason:'隔離事件中斷',nextStep:'保留原動作'},true));t=await a.get(t.id);
 return {a,t,job,finding,input:{id:t.id,version:t.version,eventId:job.id,findingId:finding.id,operationId:'finding-question-'+job.id}};
}
async function replace(a,t){await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();}
test('failed same-event finding asks once without a new execution and preserves source identity',async()=>{
 const {a,t,job,input}=await prepared();try{
  const before=(await a.db.prepare('SELECT COUNT(*) n FROM xiaoye_event_outbox WHERE task_id=?').bind(t.id).first()).n;
  for(const mutate of [s=>s.secretary.stage='paused',s=>s.secretary.sourceWithdrawn=true,s=>s.secretary.waitingForReporter=true,s=>s.secretary.findings[0].at='2000-01-01T00:00:00.000Z',s=>s.secretary.findings[0].nextStep='繼續修正程式',s=>s.secretary.executionEvent.id='f'.repeat(64)]){
   const v=structuredClone(t);mutate(v);await replace(a,v);assert.notEqual((await a.machine('runner/finding-question',input,true)).status,200);await replace(a,t);
  }
  assert.notEqual((await a.machine('runner/finding-question',{...input,version:t.version-1},true)).status,200);
  for(const invalidBot of [null,'U'+'f'.repeat(32)]){a.config.oaBotUserId=invalidBot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();assert.notEqual((await a.machine('runner/finding-question',input,true)).status,200);}
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const unknown=structuredClone(t);unknown.secretary.recovery.capability={outcome:'unknown'};unknown.secretary.pendingUnknownExecution={state:'pending',eventId:job.id,sourceVersion:t.secretary.sourceVersion,prior:'retained'};
  const mismatched=structuredClone(unknown);mismatched.secretary.pendingUnknownExecution.eventId='e'.repeat(64);await replace(a,mismatched);assert.notEqual((await a.machine('runner/finding-question',input,true)).status,200);await replace(a,unknown);
  const [q,q2]=await Promise.all([a.machine('runner/finding-question',input,true),a.machine('runner/finding-question',input,true)]);assert.equal(q.status,200);assert.equal(q2.status,200);assert.equal((await q.json()).stage,'clarifying');assert.equal((await a.ok(await a.machine('runner/finding-question',input,true))).replayed,true);
  let after=await a.get(t.id);assert(after.secretary.waitingForReporter);assert.equal(after.secretary.findingQuestion.eventId,job.id);assert.equal(after.secretary.pendingUnknownExecution.state,'pending');assert.equal(after.secretary.pendingUnknownExecution.prior,'retained');assert.equal(after.secretary.pendingUnknownExecution.originalRecovery.capability.outcome,'unknown');
  const n=JSON.parse((await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question' AND json_extract(value,'$.context.findingQuestion')=1 AND json_extract(value,'$.taskId')=?").bind(t.id).first()).value);
  assert.equal(n.account,'900003');assert.equal(n.expectedUserId,user);assert(!n.message.includes('不可向 LINE 透露'));assert(!JSON.stringify(n).includes('不可向 LINE 透露'));
  assert.equal(n.lineMessage.type,'flex');assert.equal(n.lineMessage.contents.footer.contents[0].action.type,'postback');
  assert.equal((await a.db.prepare("SELECT COUNT(*) n FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question' AND json_extract(value,'$.context.findingQuestion')=1 AND json_extract(value,'$.taskId')=?").bind(t.id).first()).n,1);
  const {notificationCurrent}=await import('../core/xiaoye-secretary-dailylog.mjs');assert(notificationCurrent(n,after,a.config));assert(!notificationCurrent(n,after,{}));assert(!notificationCurrent(n,after,{oaBotUserId:'U'+'f'.repeat(32)}));
  for(const mutate of [s=>s.secretary.stage='paused',s=>s.secretary.sourceWithdrawn=true,s=>s.secretary.sourceVersion++,s=>s.secretary.reporters[0].source.botUserId='U'+'1'.repeat(32),s=>s.secretary.reporters[0].source.userId='U'+'2'.repeat(32),s=>s.secretary.findingQuestion.expiresAt=Date.now()-1]){const stale=structuredClone(after);mutate(stale);assert(!notificationCurrent(n,stale,a.config));}
  assert.equal((await a.db.prepare('SELECT COUNT(*) n FROM xiaoye_event_outbox WHERE task_id=?').bind(t.id).first()).n,before);
  const reply=await a.ok(await a.intake({start:false,text:'隔離回覆：仍有錯誤',source:{botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()}}));assert.equal(reply.taskId,t.id);
  after=await a.get(t.id);assert.equal(after.secretary.sourceVersion,t.secretary.sourceVersion+1);assert.equal(after.secretary.pendingUnknownExecution.eventId,job.id);
  assert.equal((await a.db.prepare('SELECT COUNT(*) n FROM xiaoye_event_outbox WHERE task_id=?').bind(t.id).first()).n,before);
 }finally{await a.close();}
});
test('group reporter may answer privately but an ambiguous reply is never attached to a guessed case',async()=>{
 const {a,t,input}=await prepared('group');try{
  await a.ok(await a.machine('runner/finding-question',input,true));const after=await a.get(t.id);
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const wrongUser='U'+'d'.repeat(32),wrongBot='U'+'e'.repeat(32),post=(u,b)=>({source:{botUserId:b,userId:u,type:'user',conversationId:u,eventType:'postback',eventId:op(),timestamp:Date.now(),postbackData:'xiaoye:result:followup:'+t.id+':'+after.version},sender:{account:'900003',userId:u,botUserId:b}});
  assert.notEqual((await a.machine('reporter',post(wrongUser,bot))).status,200);assert.notEqual((await a.machine('reporter',post(user,wrongBot))).status,200);
  const id='work-'+op(),copy=structuredClone(after);copy.id=id;copy.title='另一個隔離問題';
  await a.db.prepare('INSERT INTO work_items(id,level,parent_id,department,department_id,value,revision) SELECT ?,level,parent_id,department,department_id,?,revision FROM work_items WHERE id=?').bind(id,JSON.stringify(copy),t.id).run();
  const source={botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()};
  const ambiguous=await a.ok(await a.intake({start:false,text:'隔離文字',source}));assert(ambiguous.needsCaseSelection);assert.equal((await a.get(t.id)).secretary.sourceVersion,t.secretary.sourceVersion);assert.equal((await a.get(id)).secretary.sourceVersion,t.secretary.sourceVersion);
  const selected=await a.ok(await a.machine('reporter',post(user,bot)));assert.equal(selected.taskId,t.id);source.eventId=op();source.messageId=op();
  const reply=await a.ok(await a.intake({start:false,text:'隔離回覆',source}));assert.equal(reply.taskId,t.id);assert.equal((await a.get(t.id)).secretary.sourceVersion,t.secretary.sourceVersion+1);assert.equal((await a.get(id)).secretary.sourceVersion,t.secretary.sourceVersion);
 }finally{await a.close();}
});
test('isolated bridge asks and LINE recovers preflight without spending send retries or replaying unknown delivery',async()=>{
 const {a,t,job}=await prepared('group'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-finding-e2e-'));let bridge;try{
  await a.db.prepare("UPDATE documents SET value=json_set(value,'$.state','sent') WHERE namespace='xiaoye-notifications'").run();
  fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key:'fixture-xiaoye-runner-key-000000000001'}));fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'http://example.test',LEAF_TASK_TENANT:'fixture'}}));
  const eventDir=path.join(dir,'event-runs',job.id);fs.mkdirSync(eventDir,{recursive:true});fs.writeFileSync(path.join(eventDir,'acquire.response.private.json'),JSON.stringify({job}));fs.writeFileSync(path.join(eventDir,'completion.private.json'),JSON.stringify({state:'failed'}));
  let executorCalls=0;bridge=new EventBridge({operatorDirectory:dir,workRoot:dir},{WebSocket:class{},fetcher:(url,init)=>a.mf.dispatchFetch(url,init),verifyCaseExecutor:async()=>{executorCalls++;return false;}});
  const before=(await a.db.prepare('SELECT COUNT(*) n FROM xiaoye_event_outbox WHERE task_id=?').bind(t.id).first()).n;
  await bridge.recoverFailedEvents();let current=await a.get(t.id);assert.equal(current.secretary.waitingForReporter,true);assert.equal(executorCalls,0);
  await bridge.recoverFailedEvents();assert.equal(executorCalls,0);
  const row=await a.db.prepare("SELECT key FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.context.findingQuestion')=1 AND json_extract(value,'$.taskId')=?").bind(t.id).first();assert(row);
  const read=async()=>JSON.parse((await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND key=?").bind(row.key).first()).value);
  const due=async()=>a.db.prepare("UPDATE documents SET value=json_set(value,'$.nextAttempt',0) WHERE namespace='xiaoye-notifications' AND key=?").bind(row.key).run();
  let botAvailable=false,deliveryUnknown=true,rateLimited=false;const keys=[];
  const {createXiaoyeSecretary}=await import('../core/xiaoye-secretary.js');
  const dependencies={env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tasks:{secretaryCall:async(route,v)=>a.ok(await a.machine(route,v)),groupServices:async()=>[{key:'fixture'}],meetingShareRecipient:async()=>({account:'900003',userId:user,tenantKey:'fixture'}),meetingShareIdentity:async()=>({account:'900003',tenantKey:'fixture'})},line:{lineGet:async()=>{if(!botAvailable)throw Error('isolated offline');return {userId:bot};},pushLineMessage:async(_u,_m,_v,options)=>{keys.push(options.retryKey);if(rateLimited)throw Object.assign(Error('rate limited'),{lineStatus:429});if(deliveryUnknown)throw Object.assign(Error('isolated response lost'),{lineStatus:500});return {requestId:'accepted-fixture'};},replyLineMessage:async()=>{}},logger:{warn(){}}};
  const adapter=createXiaoyeSecretary(dependencies),parallelAdapter=createXiaoyeSecretary(dependencies);
  for(let i=0;i<7;i++){await adapter.drain();const n=await read();assert.equal(n.state,'pending');assert.equal(n.attempts,0);assert(!n.firstAttemptAt);assert(n.nextAttempt>Date.now());await due();}assert.equal(keys.length,0);
  for(const configured of [null,'U'+'f'.repeat(32)]){a.config.oaBotUserId=configured;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();await adapter.drain();const n=await read();assert.equal(n.state,'pending');assert.equal(n.attempts,0);assert(n.nextAttempt>Date.now());await due();}
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  const originalIdentity=await a.db.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND key=?").bind('account:'+bot+':900003').first();const badIdentity=JSON.parse(originalIdentity.value);badIdentity.lineUserId='U'+'e'.repeat(32);await a.db.prepare("UPDATE documents SET value=? WHERE namespace='line-work-identities' AND key=?").bind(JSON.stringify(badIdentity),'account:'+bot+':900003').run();const beforeIdentity=await read();await adapter.drain();assert.equal((await read()).state,'cancelled');await a.db.prepare("UPDATE documents SET value=? WHERE namespace='line-work-identities' AND key=?").bind(originalIdentity.value,'account:'+bot+':900003').run();await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(beforeIdentity),row.key).run();
  current=await a.get(t.id);const oldCard=(await read()).lineMessage,claimed=(await a.ok(await a.machine('notifications/claim'))).notification;assert(claimed);
  current.version++;await a.db.prepare('UPDATE work_items SET value=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(current),t.id).run();assert.notEqual((await a.machine('notifications/validate',{id:claimed.id,lease:claimed.lease})).status,200);await a.ok(await a.machine('notifications/defer',{id:claimed.id,lease:claimed.lease,reason:'not-sent-preflight'}));await due();await adapter.drain();let updated=await read();assert.equal(updated.payloadVersion,current.version);assert.notDeepEqual(updated.lineMessage,oldCard);assert.equal(keys.length,0);
  const beforeCrash=await read(),lostLease={...beforeCrash,state:'sending',attempts:1,leaseUntil:Date.now()-1,firstAttemptAt:Date.now()-1000,nextAttempt:0};await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(lostLease),row.key).run();await adapter.drain();const recoveredLease=await read();assert.equal(recoveredLease.state,'unknown');assert.equal(recoveredLease.attempts,1);assert.equal(recoveredLease.firstAttemptAt,lostLease.firstAttemptAt);assert.equal(keys.length,0);beforeCrash.nextAttempt=0;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(beforeCrash),row.key).run();
  current=await a.get(t.id);const previousVersion=current.version;current.secretary.findingQuestion.expiresAt=Date.now()-1;const unsent=await read();unsent.nextAttempt=0;
  for(const change of [s=>s.secretary.stage='paused',s=>s.secretary.sourceWithdrawn=true,s=>s.secretary.sourceVersion++,s=>s.secretary.reporters[0].account='wrong',s=>s.secretary.findingQuestion.eventId='f'.repeat(64)]){
   const changed=structuredClone(current);change(changed);await replace(a,changed);await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(unsent),row.key).run();await adapter.drain();assert.equal((await read()).state,'cancelled');assert.equal((await a.get(t.id)).version,previousVersion);assert.equal(keys.length,0);
  }
  await replace(a,current);await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(unsent),row.key).run();await Promise.all([adapter.drain(),parallelAdapter.drain()]);
  current=await a.get(t.id);let refreshed=await read();assert(current.secretary.findingQuestion.expiresAt>Date.now());assert.equal(current.version,previousVersion+1);assert.equal(refreshed.id,row.key);assert.equal(refreshed.state,'pending');assert.equal(refreshed.attempts,0);assert(!refreshed.firstAttemptAt);assert.equal(keys.length,0);
  assert.equal((await a.db.prepare("SELECT COUNT(*) n FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.context.findingQuestion')=1 AND json_extract(value,'$.taskId')=?").bind(t.id).first()).n,1);
  await due();botAvailable=true;rateLimited=true;await adapter.drain();let first429=await read();assert.equal(first429.state,'pending');assert.equal(first429.attempts,1);assert(first429.firstAttemptAt);assert(first429.payloadFrozen);const card429=structuredClone(first429.lineMessage),key429=keys[0];
  current=await a.get(t.id);current.version++;await a.db.prepare('UPDATE work_items SET value=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(current),t.id).run();await due();
  for(let i=1;i<7;i++){await adapter.drain();const n=await read();assert.equal(n.state,'pending');assert.equal(n.attempts,i+1);assert.deepEqual(n.lineMessage,card429);assert.equal(keys[i],key429);await due();}assert.equal(keys.length,7);
  current=await a.get(t.id);current.secretary.findingQuestion.expiresAt=Date.now()-1;await replace(a,current);await adapter.drain();let renewed429=await read();assert.equal(renewed429.state,'pending');assert.equal(renewed429.attempts,7);assert.deepEqual(renewed429.lineMessage,card429);assert((await a.get(t.id)).secretary.findingQuestion.expiresAt>Date.now());assert.equal(keys.length,7);rateLimited=false;keys.length=0;
  for(let i=0;i<7;i++){await adapter.drain();const n=await read();assert.equal(n.state,'unknown');assert.equal(n.attempts,i+8);assert(n.firstUncertainAt);await due();}let n=await read();assert.equal(keys.length,7);assert(keys.every(k=>k===key429));const frozenCard=structuredClone(n.lineMessage);
  current=await a.get(t.id);current.version++;await a.db.prepare('UPDATE work_items SET value=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(current),t.id).run();
  const initialAttempt=n.firstUncertainAt;botAvailable=false;await adapter.drain();n=await read();assert.equal(n.state,'unknown');assert.equal(n.attempts,14);assert.equal(n.firstUncertainAt,initialAttempt);assert.deepEqual(n.lineMessage,frozenCard);assert.equal(keys.length,7);
  const uncertain=structuredClone(n);n.firstUncertainAt=Date.now()-24*3600000;n.nextAttempt=0;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(n),row.key).run();await adapter.drain();n=await read();assert.equal(n.state,'unknown');assert.equal(keys.length,7);
  current=await a.get(t.id);current.secretary.findingQuestion.expiresAt=Date.now()-1;await replace(a,current);uncertain.nextAttempt=0;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(uncertain),row.key).run();await adapter.drain();n=await read();assert.equal(n.state,'unknown');assert.equal(n.attempts,5);assert.equal(keys.length,7);assert((await a.get(t.id)).secretary.findingQuestion.expiresAt<Date.now(),'uncertain delivery cannot refresh');
  current.secretary.findingQuestion.expiresAt=Date.now()+24*3600000;await replace(a,current);uncertain.nextAttempt=0;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-notifications' AND key=?").bind(JSON.stringify(uncertain),row.key).run();botAvailable=true;deliveryUnknown=false;await adapter.drain();n=await read();assert.equal(n.state,'sent');assert.equal(keys.length,8);assert.equal(keys[0],keys[7]);assert.deepEqual(n.lineMessage,frozenCard);
  current=await a.get(t.id);const follow=n.lineMessage.contents.footer.contents[0].action.data;assert.notEqual(n.payloadVersion,current.version,'frozen card keeps the original version after a 429');
  const other='U'+'e'.repeat(32),wrong={sender:{account:'900003',userId:other,botUserId:bot},source:{eventType:'postback',type:'user',botUserId:bot,userId:other,conversationId:other,eventId:op(),timestamp:Date.now(),postbackData:follow}};assert.notEqual((await a.machine('reporter',wrong)).status,200);
  await adapter.capture([{type:'postback',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),postback:{data:follow}}]);
  await adapter.capture([{type:'message',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),message:{type:'text',id:op(),text:'隔離補充：仍有錯誤'}}]);
  current=await a.get(t.id);assert.equal(current.secretary.pendingUnknownExecution.state,'pending');assert.equal(current.secretary.sourceVersion,t.secretary.sourceVersion+1);assert.equal((await a.db.prepare('SELECT COUNT(*) n FROM xiaoye_event_outbox WHERE task_id=?').bind(t.id).first()).n,before);assert.equal(executorCalls,0);
 }finally{bridge?.stop();await a.close();fs.rmSync(dir,{recursive:true,force:true});}
});

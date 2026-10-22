const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dailylog=path.resolve(process.env.DAILYLOG_ROOT||process.cwd()),folder=path.resolve(process.env.DAILYLOG_XIAOYE_PACKAGE||'.dailylog-data/xiaoye-secretary-pilot-20261022');
process.env.DAILYLOG_ROUTINE_PACKAGE=folder;
const {fixture}=require(process.env.DAILYLOG_XIAOYE_FIXTURE||path.join(dailylog,'scripts/routine-tabs.worker.test.cjs'));
const key='fixture-xiaoye-existing-service-key-0001',runnerKey='fixture-xiaoye-runner-key-000000000001',tenant='fixture',bot='U'+'a'.repeat(32),user='U'+'b'.repeat(32),owner='140901';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),op=()=>crypto.randomUUID();
const proposal={summary:'修正隔離示例顯示問題',reason:'隔離資料可重現；尚無真人影響證據。',steps:'修改示例畫面並驗證',systems:['dailylog'],deploy:false,validation:'隔離完整 Worker 與畫面驗證',rollback:'還原本次示例變更'};
async function setup(){
 const a=await fixture({extraBindings:{LEAF_TASK_SERVICE_KEY:key,LEAF_TASK_TENANT:tenant}});
 for(const sql of fs.readFileSync(path.join(__dirname,'../core/xiaoye-secretary.sql'),'utf8').split(';').filter(s=>s.trim()))await a.db.prepare(sql).run();
 const projects=[];for(let i=0;i<4;i++){const r=await a.send(owner,'/api/tasks',{id:'work-'+op(),title:['AI 助手','日誌','簽核','會議'][i],description:'隔離試行專案',leadAccount:owner,collaboratorAccounts:[],level:2,sourceDate:'2026-10-22',startDate:'2026-10-22',workSchema:2});assert.equal(r.status,201,await r.clone().text());const t=(await r.json()).task;t.collaborators.push({account:'ai-xiaoye',name:'小葉（AI）',team:'AI 秘書'});await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();projects.push({id:t.id,key:['am','dailylog','uof','meeting'][i],label:t.title});}
 const config={contract:'xiaoye-secretary-pilot-v1',enabled:true,ownerAccount:owner,account:{account:'ai-xiaoye',id:'service:xiaoye',name:'小葉（AI）',type:'ai'},runnerHash:sha('Bearer '+runnerKey),projects};
 for(const [ns,k,v]of [['xiaoye-secretary','config',config],['service-accounts','ai-xiaoye',{...config.account,active:true}],['line-work-identities','line:'+bot+':'+user,{account:'900003',botUserId:bot,lineUserId:user,identityId:'fixture-identity'}],['line-work-identities','account:'+bot+':900003',{account:'900003',botUserId:bot,lineUserId:user,identityId:'fixture-identity'}]])await a.db.prepare('INSERT INTO documents(namespace,key,value) VALUES(?,?,?)').bind(ns,k,JSON.stringify(v)).run();
 await a.send(owner,'/api/tasks/people');
 const machine=async(action,v={},runner=false)=>a.mf.dispatchFetch('http://example.test/api/integrations/leaf-snail/tasks/secretary/'+action,{method:'POST',headers:{Authorization:'Bearer '+(runner?runnerKey:key),'Content-Type':'application/json'},body:JSON.stringify({tenantKey:tenant,...v})});
 const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
 const intake=(values={})=>machine('intake',{start:true,text:'儲存後出現隔離示例錯誤',source:{botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()},sender:{account:'900003',userId:user,botUserId:bot},...values});
 const get=async id=>JSON.parse((await a.db.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first()).value);
 const propose=async t=>ok(await machine('runner/propose',{id:t.id,version:t.version,operationId:op(),projectId:projects[1].id,category:'bug',proposal},true));
 const approve=async t=>ok(await a.send(owner,'/api/xiaoye/issues/'+t.id+'/approve',{version:t.version,proposalHash:t.secretary.proposal.hash,confirm:true,operationId:op()}));
 return {...a,config,projects,machine,ok,intake,get,propose,approve};
}
module.exports={setup,proposal,owner};
if(require.main===module){
test('full flow: one issue, exact source retry, proposal approval, claim, result, original reporter confirmation and factual journal',async()=>{
 const a=await setup();try{const source={botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()},first=await a.ok(await a.intake({source}));let t=await a.get(first.taskId);assert.equal(t.secretary.stage,'clarifying');
 const duplicate=await a.ok(await a.intake({source}));assert.equal(duplicate.taskId,t.id);assert.equal((await a.get(t.id)).version,1);
 assert.equal((await a.ok(await a.machine('runner/claim',{operationId:op()},true))).task,null,'unapproved work cannot run');
 t=(await a.propose(t)).task;assert.equal(t.secretary.stage,'awaiting_approval');assert.equal((await a.send('900003','/api/xiaoye/issues/'+t.id+'/approve',{version:t.version,proposalHash:t.secretary.proposal.hash,confirm:true,operationId:op()})).status,403);
 t=(await a.approve(t)).task;const claim=await a.ok(await a.machine('runner/claim',{operationId:op()},true));assert.equal(claim.task.id,t.id);const lease=claim.lease;
 assert.equal((await a.machine('runner/finish',{id:t.id,lease,result:'完成',deployed:false,evidence:[],operationId:op()},true)).status,400);
 const completed=await a.ok(await a.machine('runner/finish',{id:t.id,lease,result:'隔離顯示已修正；待同仁再試。',deployed:false,evidence:['完整 Worker 合成流程通過'],operationId:op()},true));t=completed.task;assert.equal(t.secretary.stage,'awaiting_confirmation');assert.notEqual(t.status,'done');
 assert.equal((await a.send(owner,'/api/xiaoye/issues/'+t.id+'/confirm',{version:t.version,confirm:true,operationId:op()})).status,403);
 const done=await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/confirm',{version:t.version,confirm:true,operationId:op()}));assert.equal(done.task.status,'done');
 const overview=await a.ok(await a.send(owner,'/api/xiaoye/overview'));assert.equal(overview.tasks.length,1);assert.equal(overview.journals[0].entries.length,6);assert(!JSON.stringify(overview).includes('sessionHash'));assert(overview.journals[0].entries.every(e=>e.workId===t.id&&!('minutes'in e)));
 const reopened=await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/reopen',{version:done.task.version,detail:'仍然遇到示例錯誤',operationId:op()}));assert.equal(reopened.task.id,t.id);assert.equal(reopened.task.secretary.approval,null);
 }finally{await a.close();}
});
test('supplements and images stay on one card, revoke stale approval, preserve bytes and deny cross-account reads',async()=>{
 const a=await setup();try{let t=await a.get((await a.ok(await a.intake())).taskId);t=(await a.propose(t)).task;t=(await a.approve(t)).task;
 const source={botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()},image={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6yVQAAAAASUVORK5CYII='};
 const r=await a.ok(await a.intake({start:false,source,text:'這是補充截圖',image}));assert.equal(r.taskId,t.id);t=await a.get(t.id);assert.equal(t.secretary.stage,'clarifying');assert.equal(t.secretary.approval,null);assert.equal(t.secretary.sourceVersion,2);
 assert.equal((await a.ok(await a.machine('runner/claim',{operationId:op()},true))).task,null);
 const files=await a.ok(await a.send('900003','/api/attachments/normal/'+t.id));assert.equal(files.attachments.length,1);const file=await a.send('900003','/api/attachments/normal/'+t.id+'/'+files.attachments[0].id);assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.from(image.base64,'base64'));
 const machineFiles=await a.ok(await a.machine('runner/attachments',{id:t.id},true));assert.equal(machineFiles.attachments.length,1);const machineImage=await a.machine('runner/attachment/'+machineFiles.attachments[0].id,{id:t.id},true);assert.equal(machineImage.status,200);assert.deepEqual(Buffer.from(await machineImage.arrayBuffer()),Buffer.from(image.base64,'base64'));assert.equal((await a.send('900003','/api/tasks/'+t.id)).status,200);
 assert.equal((await a.send('900002','/api/tasks/'+t.id)).status,404);assert.equal((await a.send('900002','/api/attachments/normal/'+t.id)).status,404);assert.equal((await a.send('900003','/api/tasks/'+t.id,{version:t.version,operationId:op(),kind:'status',status:'done'})).status,409);
 assert.equal((await a.ok(await a.send('900002','/api/xiaoye/overview'))).tasks.length,0);
 const unverified=await a.intake({sender:{account:'900002',userId:user,botUserId:bot}});assert.equal(unverified.status,403);
 await a.ok(await a.machine('withdraw',{messageId:source.messageId,source:{botUserId:bot,type:'user',conversationId:user,eventId:op()}}));t=await a.get(t.id);assert(t.secretary.sourceWithdrawn);assert.equal(t.secretary.stage,'blocked');assert.notEqual((await a.send('900003','/api/attachments/normal/'+t.id+'/'+files.attachments[0].id)).status,200);assert.equal((await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),projectId:a.projects[0].id,category:'bug',proposal},true)).status,409);
 }finally{await a.close();}
});
test('CSRF, approval version, revocation, service stop and concurrent execution gates hold',async()=>{
 const a=await setup();try{let t=await a.get((await a.ok(await a.intake())).taskId);t=(await a.propose(t)).task;const v={version:t.version,proposalHash:t.secretary.proposal.hash,confirm:true,operationId:op()};
 assert.equal((await a.send(owner,'/api/xiaoye/issues/'+t.id+'/approve',v,'https://elsewhere.test')).status,403);assert.equal((await a.send(owner,'/api/xiaoye/issues/'+t.id+'/approve',{...v,proposalHash:'old'})).status,409);
 await a.approve(t);let second=await a.get((await a.ok(await a.intake())).taskId);second=(await a.propose(second)).task;await a.approve(second);
 const claims=await Promise.all([a.machine('runner/claim',{operationId:op()},true),a.machine('runner/claim',{operationId:op()},true)]);assert.equal(claims.filter(r=>r.status===200).length,1);assert.equal(claims.filter(r=>r.status===409).length,1);
 const claim=await claims.find(r=>r.status===200).json();const tokenHash=sha(sha('fixture-session-'+owner));await a.db.prepare('UPDATE sessions SET expires_at=0 WHERE token_hash=?').bind(tokenHash).run();assert.equal((await a.machine('runner/check',{id:claim.task.id,lease:claim.lease},true)).status,401);
 await a.db.prepare("UPDATE documents SET value=json_set(value,'$.active',0) WHERE namespace='service-accounts' AND key='ai-xiaoye'").run();assert.equal((await a.machine('runner/queue',{},true)).status,503);
 }finally{await a.close();}
});
test('notification leases, stable retry identities and current version validation; no native AI bypass',async()=>{
 const a=await setup();try{let t=await a.get((await a.ok(await a.intake())).taskId);let n=(await a.ok(await a.machine('notifications/claim'))).notification;assert.equal(n.kind,'receipt');await a.ok(await a.machine('notifications/receipt',{id:n.id,lease:n.lease,state:'sent',requestId:'fixture'}));
 t=(await a.propose(t)).task;n=(await a.ok(await a.machine('notifications/claim'))).notification;assert.equal(n.account,owner);assert.equal(n.kind,'approval');await a.approve(t);assert.equal((await a.machine('notifications/validate',{id:n.id,lease:n.lease})).status,409);
 const r=await a.send(owner,'/api/tasks',{id:'work-'+op(),title:'不可繞過核准',leadAccount:'ai-xiaoye',collaboratorAccounts:[]});assert.equal(r.status,409);
 assert.equal((await a.send(owner,'/xiaoye')).status,200);const html=await(await a.send(owner,'/')).text();assert(html.includes('/xiaoye'));const people=await a.ok(await a.send(owner,'/api/tasks/people'));assert(people.people.some(p=>p.account==='ai-xiaoye'));
 const login=await a.mf.dispatchFetch('http://example.test/xiaoye?issue='+t.id,{redirect:'manual'});assert.equal(login.status,303);assert.equal(new URL(login.headers.get('Location')).searchParams.get('returnTo'),'/xiaoye?issue='+t.id);
 }finally{await a.close();}
});
test('lost replies reuse proposal, approval, claim and result operations without duplicate journal entries',async()=>{
 const a=await setup();try{let t=await a.get((await a.ok(await a.intake())).taskId);const p={id:t.id,version:t.version,operationId:op(),projectId:a.projects[1].id,category:'bug',proposal};
 t=(await a.ok(await a.machine('runner/propose',p,true))).task;await a.ok(await a.machine('runner/propose',p,true));
 const approval={version:t.version,proposalHash:t.secretary.proposal.hash,confirm:true,operationId:op()};await a.ok(await a.send(owner,'/api/xiaoye/issues/'+t.id+'/approve',approval));await a.ok(await a.send(owner,'/api/xiaoye/issues/'+t.id+'/approve',approval));
 const claimOp={operationId:op()},claim=await a.ok(await a.machine('runner/claim',claimOp,true));const again=await a.ok(await a.machine('runner/claim',claimOp,true));assert.equal(again.lease,claim.lease);
 const result={id:t.id,lease:claim.lease,result:'隔離回覆遺失後原操作確認',deployed:false,evidence:['固定操作驗證通過'],operationId:op()};await a.ok(await a.machine('runner/finish',result,true));await a.ok(await a.machine('runner/finish',result,true));
 const overview=await a.ok(await a.send(owner,'/api/xiaoye/overview'));assert.equal(overview.journals[0].entries.length,5);
 }finally{await a.close();}
});
test('AI membership remains editable in the four existing projects without becoming a human login',async()=>{
 const a=await setup();try{const p=await a.get(a.projects[0].id);const r=await a.send(owner,'/api/tasks/'+p.id,{kind:'edit',version:p.version,operationId:'op-'+op(),title:p.title,description:p.description,leadAccount:owner,collaboratorAccounts:['ai-xiaoye'],sharedAccounts:[],level:2,sourceDate:p.sourceDate,startDate:p.startDate,workSchema:2});assert.equal(r.status,200,await r.clone().text());assert((await a.get(p.id)).collaborators.some(p=>p.account==='ai-xiaoye'));
 const employee=await a.db.prepare("SELECT account FROM employees WHERE account='ai-xiaoye'").first();assert.equal(employee,null,'AI service registry never fabricates an employee or login');
 }finally{await a.close();}
});
test('one-time installation atomically adds only the AI service and four original memberships, then activates separately',async()=>{
 const a=await setup();try{
 await a.db.prepare("DELETE FROM documents WHERE namespace IN ('xiaoye-secretary','service-accounts')").run();
 for(const p of a.projects){const t=await a.get(p.id);t.collaborators=[];await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(t),t.id).run();}
 await a.db.prepare("INSERT INTO documents(namespace,key,value) VALUES('xiaoye-bootstrap','install',?)").bind(JSON.stringify({hash:sha('Bearer '+runnerKey),ownerAccount:owner,projects:a.projects,runId:op()})).run();
 const install=async action=>a.mf.dispatchFetch('http://example.test/api/integrations/leaf-snail/tasks/secretary/'+action,{method:'POST',headers:{Authorization:'Bearer '+runnerKey,'Content-Type':'application/json'},body:JSON.stringify({tenantKey:tenant})});
 const first=await a.ok(await install('install'));assert.equal(first.joinedProjects,4);assert.equal(first.intakeEnabled,false);for(const p of a.projects)assert((await a.get(p.id)).collaborators.some(x=>x.account==='ai-xiaoye'));
 const again=await a.ok(await install('install'));assert(again.replayed);assert.equal((await a.machine('runner/queue',{},true)).status,503);
 await a.ok(await install('activate'));await a.ok(await install('activate'));assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).projects.length,4);
 assert.equal(await a.db.prepare("SELECT key FROM documents WHERE namespace='xiaoye-bootstrap'").first(),null);
 }finally{await a.close();}
});
test('clarification is logged once and a later web supplement continues the same card',async()=>{
 const a=await setup();try{let t=await a.get((await a.ok(await a.intake())).taskId);const question={id:t.id,version:t.version,operationId:op(),question:'請問使用手機或電腦？按哪一個儲存按鈕？'};t=(await a.ok(await a.machine('runner/clarify',question,true))).task;await a.ok(await a.machine('runner/clarify',question,true));assert(t.secretary.waitingForReporter);assert.equal((await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),projectId:a.projects[0].id,category:'bug',proposal},true)).status,409);
 const r=await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/supplement',{version:t.version,operationId:op(),detail:'手機，點卡片下方儲存。'}));assert.equal(r.task.id,t.id);assert.equal(r.task.secretary.waitingForReporter,false);assert.equal(r.task.secretary.sourceVersion,2);assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).tasks.length,1);
 await a.db.prepare("DELETE FROM documents WHERE namespace='xiaoye-intake-sessions'").run();const resumed=await a.ok(await a.intake({start:false,resumeTaskId:t.id,text:'接續補圖'}));assert.equal(resumed.taskId,t.id);assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).tasks.length,1);
 }finally{await a.close();}
});
test('guided report persists texts and original image before one explicit submission; replay and later web supplements retain one card',async()=>{
 const a=await setup();try{
  const source=()=>({botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()});
  const begin={start:false,begin:true,text:'',source:source()};let r=await a.ok(await a.intake(begin));assert(r.draft&&r.begun);assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).tasks.length,0);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=';
  const textEvent=source(),imageEvent=source();await a.ok(await a.intake({start:false,text:'工作日誌儲存後出現錯誤。原輸入還在。',source:textEvent}));await a.ok(await a.intake({start:false,text:'',image:{base64:png},source:imageEvent}));
  assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).tasks.length,0);const finish={start:false,finish:true,text:'',source:source()};r=await a.ok(await a.intake(finish));assert(r.submitted);assert.equal(r.title,'工作日誌儲存後出現錯誤');const id=r.taskId;assert.equal((await a.ok(await a.intake(finish))).taskId,id);assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).tasks.length,1);
  const attachments=await a.ok(await a.machine('runner/attachments',{id},true));assert.equal(attachments.attachments.length,1);const raw=await a.machine('runner/attachment/'+attachments.attachments[0].id,{id},true);assert(Buffer.from(await raw.arrayBuffer()).equals(Buffer.from(png,'base64')));
  let t=await a.get(id);t=(await a.propose(t)).task;await a.approve(t);t=await a.get(id);const supplemented=await a.ok(await a.send('900003','/api/xiaoye/issues/'+id+'/supplement',{version:t.version,operationId:op(),image:{base64:png}}));assert.equal(supplemented.task.secretary.stage,'clarifying');assert.equal(supplemented.task.secretary.approval,null);assert.equal((await a.ok(await a.machine('runner/attachments',{id},true))).attachments.length,2);
  assert.equal((await a.ok(await a.send('900002','/api/xiaoye/overview'))).tasks.length,0);
 }finally{await a.close();}
});
test('empty, cancelled or withdrawn guided drafts do not create tasks; service restart can restore the draft session',async()=>{
 const a=await setup();try{
  const source=()=>({botUserId:bot,type:'user',conversationId:user,userId:user,eventId:op(),messageId:op(),timestamp:Date.now()});await a.ok(await a.intake({start:false,begin:true,text:'',source:source()}));assert((await a.ok(await a.intake({start:false,finish:true,text:'',source:source()}))).needsDescription);assert.equal((await a.ok(await a.machine('sessions'))).sessions.length,1);
  const msg=source();await a.ok(await a.intake({start:false,text:'這段是稍後撤回的說明',source:msg}));await a.ok(await a.machine('withdraw',{messageId:msg.messageId,source:{botUserId:bot,type:'user',conversationId:user,eventId:op()}}));assert((await a.ok(await a.intake({start:false,finish:true,text:'',source:source()}))).needsDescription);await a.ok(await a.intake({start:false,cancel:true,text:'',source:source()}));assert.equal((await a.ok(await a.machine('sessions'))).sessions.length,0);assert.equal((await a.ok(await a.send(owner,'/api/xiaoye/overview'))).tasks.length,0);
 }finally{await a.close();}
});
test('expired execution remains fenced until owner stops it, and paused proposals can be explicitly approved again',async()=>{
 const a=await setup();try{let first=await a.get((await a.ok(await a.intake())).taskId);first=(await a.propose(first)).task;await a.approve(first);const claim=await a.ok(await a.machine('runner/claim',{operationId:op()},true));await a.db.prepare("UPDATE work_items SET value=json_set(value,'$.secretary.leaseUntil',0) WHERE id=?").bind(first.id).run();let second=await a.get((await a.ok(await a.intake())).taskId);second=(await a.propose(second)).task;await a.approve(second);assert.equal((await a.machine('runner/claim',{operationId:op()},true)).status,409);assert.equal((await a.machine('runner/check',{id:first.id,lease:claim.lease},true)).status,403);
 first=await a.get(first.id);const paused=await a.ok(await a.send(owner,'/api/xiaoye/issues/'+first.id+'/pause',{version:first.version,operationId:op()}));await a.approve(paused.task);const now=await a.ok(await a.machine('runner/claim',{operationId:op()},true));assert(now.task);
 }finally{await a.close();}
});
}

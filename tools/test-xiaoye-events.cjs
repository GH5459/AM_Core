const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),{EventEmitter}=require('node:events');
const folder=path.resolve(process.env.DAILYLOG_XIAOYE_PACKAGE);
process.env.DAILYLOG_XIAOYE_FIXTURE=path.join(folder,'event-fixture.cjs');
const {setup,proposal,owner}=require('./test-xiaoye-worker.cjs');
const {EventBridge}=require('./xiaoye-event-bridge.cjs');
const runnerKey='fixture-xiaoye-runner-key-000000000001',op=()=>crypto.randomUUID(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=15000){const end=Date.now()+timeout;for(;;){if(await fn())return;if(Date.now()>end)throw Error('Isolated event did not complete');await wait(50);}}
async function events(a){return (await a.db.prepare('SELECT * FROM xiaoye_event_outbox ORDER BY created_at').all()).results;}
async function acquire(a,e){await wait(e.kind==='analyze'?5200:1200);return a.ok(await a.machine('runner/event-acquire',{id:e.id,operationId:'fixture-acquire-'+e.id},true));}
const context=job=>({eventId:job.id,eventLease:job.lease});
async function propose(a,job){const t=await a.get(job.taskId);return a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),projectId:a.projects[1].id,category:'help',title:'隔離事件流程驗證',proposal,...context(job)},true));}
async function socket(a,key=runnerKey){const r=await a.mf.dispatchFetch('http://example.test/api/integrations/leaf-snail/tasks/secretary/runner/events/ws',{headers:{Authorization:'Bearer '+key,Upgrade:'websocket'}});return r;}
test('idle has no alarm or event; guided drafts and cancellation do not wake AI; authorization protects the socket',async()=>{
 const a=await setup();try{
  const status=await a.ok(await a.machine('runner/event-status',{},true));assert.equal(status.alarmScheduled,false);assert.equal(status.states.ready,0);
  assert.equal((await socket(a,'not-a-key')).status,401);
  await a.ok(await a.intake({start:false,begin:true,text:''}));await a.ok(await a.intake({start:false,text:'隔離草稿，不送出'}));
  assert.equal((await events(a)).length,0);await a.ok(await a.intake({start:false,cancel:true,text:''}));assert.equal((await events(a)).length,0);
  assert.equal((await a.ok(await a.machine('runner/event-status',{},true))).alarmScheduled,false);
 }finally{await a.close();}
});
test('a prepared pointer without a committed outbox row cannot create phantom work',async()=>{
 const a=await setup();try{const ns=await a.mf.getDurableObjectNamespace('XIAOYE_EVENTS','routines-fixture'),stub=ns.get(ns.idFromName('original-oa-secretary')),id='f'.repeat(64),event={id,taskId:'work-'+op(),version:1,sourceVersion:1,kind:'analyze',createdAt:Date.now()};
 const send=(route,input)=>stub.fetch('https://secretary.internal/'+route,{method:'POST',body:JSON.stringify(input)});
 assert.equal((await send('prepare',event)).status,200);await send('commit',{id});assert.equal((await (await send('acquire',{id,operationId:op()})).json()).job,null);assert.equal((await events(a)).length,0);
 }finally{await a.close();}
});
test('submission commits one durable event; duplicate source and duplicate acquire are stable; proposal ends the analysis',async()=>{
 const a=await setup();try{
  const source={botUserId:'U'+'a'.repeat(32),type:'user',conversationId:'U'+'b'.repeat(32),userId:'U'+'b'.repeat(32),eventId:op(),messageId:op(),timestamp:Date.now()};
  await a.ok(await a.intake({start:false,begin:true,text:''}));await a.ok(await a.intake({start:false,text:'隔離正式回報',source}));
  const finishSource={...source,eventId:op(),messageId:op()};const first=await a.ok(await a.intake({start:false,finish:true,text:'',source:finishSource}));
  await a.ok(await a.intake({start:false,finish:true,text:'',source:finishSource}));const rows=await events(a);assert.equal(rows.length,1);assert.equal(rows[0].task_id,first.taskId);
  const acquired=await acquire(a,rows[0]);assert.equal(acquired.job.kind,'analyze');
  const replay=await a.ok(await a.machine('runner/event-acquire',{id:rows[0].id,operationId:'fixture-acquire-'+rows[0].id},true));assert.equal(replay.job.lease,acquired.job.lease);
  assert.equal((await a.machine('runner/claim',{id:first.taskId,operationId:op(),...context(acquired.job)},true)).status,200,'unapproved work is never claimed');
  const proposed=await propose(a,acquired.job);assert.equal(proposed.task.secretary.stage,'awaiting_approval');
  const end={id:acquired.job.id,lease:acquired.job.lease,operationId:op()};assert.equal((await a.ok(await a.machine('runner/event-complete',end,true))).state,'done');
  assert.equal((await a.ok(await a.machine('runner/event-complete',end,true))).replayed,true);
  const status=await a.ok(await a.machine('runner/event-status',{},true));assert.equal(status.alarmScheduled,false);assert.equal(status.states.ready,0);
 }finally{await a.close();}
});
test('new supplements coalesce to current source and invalidate running analysis; waiting for a reporter is idle',async()=>{
 const a=await setup();try{
  const first=await a.ok(await a.intake());const e=(await events(a))[0],old=await acquire(a,e);
  let t=await a.get(first.taskId);await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/supplement',{version:t.version,operationId:op(),detail:'隔離補充一'}));
  t=await a.get(t.id);await a.ok(await a.send('900003','/api/xiaoye/issues/'+t.id+'/supplement',{version:t.version,operationId:op(),detail:'隔離補充二'}));
  assert.equal((await a.machine('runner/event-check',{id:old.job.id,lease:old.job.lease},true)).status,409);
  assert.equal((await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),projectId:a.projects[1].id,category:'help',proposal,...context(old.job)},true)).status,403);
  const rows=await events(a),latest=await acquire(a,rows.at(-1));assert.equal(latest.task.description.includes('隔離補充二'),true);
  const q=await a.ok(await a.machine('runner/clarify',{id:t.id,version:latest.task.version,operationId:op(),question:'這是隔離示例，請說明預期畫面。',...context(latest.job)},true));assert(q.task.secretary.waitingForReporter);
  await a.ok(await a.machine('runner/event-complete',{id:latest.job.id,lease:latest.job.lease,operationId:op()},true));
  const status=await a.ok(await a.machine('runner/event-status',{},true));assert.equal(status.states.running,0);assert.equal(status.states.ready,0);assert.equal(status.alarmScheduled,false);
 }finally{await a.close();}
});
test('current owner approval alone triggers exact execution; pause fences event and task leases; credentials are hidden from the page',async()=>{
 const a=await setup();try{
  const first=await a.ok(await a.intake());let job=(await acquire(a,(await events(a))[0])).job;
  let t=(await propose(a,job)).task;await a.ok(await a.machine('runner/event-complete',{id:job.id,lease:job.lease,operationId:op()},true));
  assert.equal((await a.send('900003','/api/xiaoye/issues/'+t.id+'/approve',{version:t.version,proposalHash:t.secretary.proposal.hash,confirm:true,operationId:op()})).status,403);
  t=(await a.approve(t)).task;const approvedEvent=(await events(a)).at(-1);assert.equal(approvedEvent.kind,'execute');job=(await acquire(a,approvedEvent)).job;
  assert.equal((await a.machine('runner/claim',{id:t.id,operationId:op()},true)).status,403,'event lease is required as well as owner approval');
  const claim=await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),...context(job)},true));assert.equal(claim.task.id,first.taskId);
  const page=await a.ok(await a.send(owner,'/api/xiaoye/overview'));assert(!JSON.stringify(page).includes(job.lease));assert(!JSON.stringify(page).includes('executionEvent'));
  const normalPage=await a.send(owner,'/api/tasks/'+t.id);assert.equal(normalPage.status,200);assert(!(await normalPage.text()).includes(job.lease));
  t=await a.get(t.id);await a.ok(await a.send(owner,'/api/xiaoye/issues/'+t.id+'/pause',{version:t.version,operationId:op()}));
  assert.equal((await a.machine('runner/check',{id:t.id,lease:claim.lease},true)).status,403);
  assert.equal((await a.machine('runner/event-check',{id:job.id,lease:job.lease},true)).status,409);
 }finally{await a.close();}
});
test('failed or incomplete processing sends one factual blocker notice and does not automatically rerun',async()=>{
 const a=await setup();try{
  await a.ok(await a.intake());const job=(await acquire(a,(await events(a))[0])).job;
  const input={id:job.id,lease:job.lease,operationId:op()};assert.equal((await a.ok(await a.machine('runner/event-complete',input,true))).state,'failed');
  await a.ok(await a.machine('runner/event-complete',input,true));
  const notices=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications'").all()).results.map(r=>JSON.parse(r.value));assert.equal(notices.filter(n=>n.kind==='event-blocked').length,1);
  const status=await a.ok(await a.machine('runner/event-status',{},true));assert.equal(status.states.failed,1);assert.equal(status.alarmScheduled,false);
  const journals=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-work-journal'").all()).results.map(r=>JSON.parse(r.value));assert.equal(journals.flatMap(j=>j.entries).filter(e=>e.action==='event_failed').length,1);
 }finally{await a.close();}
});
test('installation catchup is one-time and replay-safe, preserves original task version, and is not a polling mechanism',async()=>{
 const a=await setup();try{const first=await a.ok(await a.intake()),t=await a.get(first.taskId),input={operationId:'fixture-once-'+op()};
 const installed=await a.ok(await a.machine('runner/event-bootstrap',input,true));assert.equal(installed.seeded,1);assert.equal((await a.get(t.id)).version,t.version);
 assert.equal((await a.ok(await a.machine('runner/event-bootstrap',input,true))).replayed,true);assert.equal((await a.machine('runner/event-bootstrap',{operationId:op()},true)).status,409);
 }finally{await a.close();}
});
test('a temporary notification-storage failure retains the event until its factual blocker notice is saved',async()=>{
 const a=await setup();let renamed=false;try{
  await a.ok(await a.intake());const job=(await acquire(a,(await events(a))[0])).job,ns=await a.mf.getDurableObjectNamespace('XIAOYE_EVENTS','routines-fixture'),stub=ns.get(ns.idFromName('original-oa-secretary')),input={id:job.id,lease:job.lease,operationId:op()};
  await a.db.prepare('ALTER TABLE documents RENAME TO isolated_documents_saved').run();renamed=true;
  assert.equal((await stub.fetch('https://secretary.internal/fail',{method:'POST',body:JSON.stringify(input)})).status,503);
  const during=await (await stub.fetch('https://secretary.internal/status',{method:'POST',body:'{}'})).json();assert.equal(during.states.running,1);assert.equal(during.states.failed,0);
  await a.db.prepare('ALTER TABLE isolated_documents_saved RENAME TO documents').run();renamed=false;
  assert.equal((await a.ok(await a.machine('runner/event-fail',input,true))).state,'failed');
  assert.equal((await a.db.prepare("SELECT key FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='event-blocked'").all()).results.length,1);
 }finally{if(renamed)await a.db.prepare('ALTER TABLE isolated_documents_saved RENAME TO documents').run();await a.close();}
});
test('real durable WebSocket delivery wakes the bridge once, offline reports resume on connect, approval starts a separate execution',async()=>{
 const a=await setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-event-isolated-'));let bridge;
 try{
  fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key:runnerKey}));fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'http://example.test',LEAF_TASK_TENANT:'fixture'}}));
  fs.writeFileSync(path.join(dir,'prompt.txt'),'隔離處理器測試，不接觸真人資料。');
  class Socket extends EventEmitter{constructor(url,options){super();this.readyState=0;a.mf.dispatchFetch(String(url).replace(/^ws:/,'http:'),{headers:{...options.headers,Upgrade:'websocket'}}).then(r=>{assert.equal(r.status,101);this.socket=r.webSocket;this.socket.accept();this.socket.addEventListener('message',e=>this.emit('message',e.data));this.socket.addEventListener('close',()=>{this.readyState=3;this.emit('close');});this.readyState=1;this.emit('open');}).catch(e=>this.emit('error',e));}send(v){this.socket.send(v);}close(){this.readyState=3;this.socket?.close(1000,'fixture complete');}}
  let launches=0;
  const launch=args=>{launches++;assert.equal(args[args.indexOf('--sandbox')+1],launches===1?'workspace-write':'danger-full-access');const child=new EventEmitter();child.pid=10000+launches;child.kill=()=>child.emit('exit',1);child.stdin={end:()=>{queueMicrotask(async()=>{try{
    const active=JSON.parse(fs.readFileSync(path.join(dir,'bridge-active.private.json'))),checked=await a.ok(await a.machine('runner/event-check',{id:active.id,lease:active.lease},true));
    if(checked.job.kind==='analyze')await propose(a,checked.job);
    else{const claimed=await a.ok(await a.machine('runner/claim',{id:checked.task.id,operationId:op(),...context(checked.job)},true));await a.ok(await a.machine('runner/check',{id:claimed.task.id,lease:claimed.lease},true));await a.ok(await a.machine('runner/finish',{id:claimed.task.id,lease:claimed.lease,operationId:op(),result:'隔離事件流程已查核，等待隔離回報人確認。',explanation:{cause:'隔離示例的日期或顯示處理有誤。',handling:'已修正隔離示例並查核原流程。',outcome:'隔離流程通過，請依原操作確認。'},deployed:false,evidence:['隔離完整 Worker／D1 與事件推送查核']},true));}
    child.emit('exit',0);
  }catch(e){child.emit('error',e);}});}};return child;};
  bridge=new EventBridge({operatorDirectory:dir,promptFile:path.join(dir,'prompt.txt'),workRoot:dir,codexExecutable:'isolated-codex'},{WebSocket:Socket,launch,fetcher:(url,options)=>a.mf.dispatchFetch(url,options)});
  const original=await a.ok(await a.intake());await wait(5300);assert.equal(launches,0,'offline delivery never runs AI');
  bridge.connect();await until(async()=>!bridge.running&&(await a.get(original.taskId)).secretary.stage==='awaiting_approval');assert.equal(launches,1);
  bridge.ws.send('ready');await wait(150);assert.equal(launches,1,'reconnect/readiness does not repeat analyzed work');
  let t=await a.get(original.taskId);await a.approve(t);await until(async()=>!bridge.running&&(await a.get(t.id)).secretary.stage==='awaiting_confirmation');assert.equal(launches,2);
  await wait(150);assert.equal(launches,2);assert.equal((await a.ok(await a.machine('runner/event-status',{},true))).alarmScheduled,false);
 }finally{bridge?.stop();await a.close();}
});

// Full isolated Worker/D1/event bridge flow; desktop and LINE are synthetic.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {setup,proposal}=require('./test-xiaoye-worker.cjs');
const {EventBridge}=require('./xiaoye-event-bridge.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),op=()=>crypto.randomUUID();
async function until(fn){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await wait(100);}throw Error('isolated flow timed out');}
test('one synthetic case connects reporting, chat, question, supplement, approval, result and confirmation',async()=>{
 const a=await setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-e2e-'));let bridge;
 try{
  const key='fixture-xiaoye-runner-key-000000000001',bot='U'+'a'.repeat(32),user='U'+'b'.repeat(32);
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key}));fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'http://example.test',LEAF_TASK_TENANT:'fixture'}}));
  fs.writeFileSync(path.join(dir,'prompt.txt'),'隔離示例，不讀真人資料。');fs.writeFileSync(path.join(dir,'desktop.json'),'{}');
  const keys=['am','dailylog','uof','meeting','hozo'],routes=keys.map((key,i)=>({key,id:crypto.randomUUID(),serviceProjectId:a.projects[i]?.id||'fixture-hozo',threadId:crypto.randomUUID(),hostId:'local',workRoot:'D:/fixture/'+key}));
  fs.writeFileSync(path.join(dir,'routes.json'),JSON.stringify({routes,desktopContextFile:path.join(dir,'desktop.json'),caseChatsDirectory:path.join(dir,'case-chats')}));
  class Socket extends EventEmitter{constructor(url,options){super();this.readyState=0;a.mf.dispatchFetch(String(url).replace(/^ws:/,'http:'),{headers:{...options.headers,Upgrade:'websocket'}}).then(r=>{assert.equal(r.status,101);this.socket=r.webSocket;this.socket.accept();this.socket.addEventListener('message',e=>this.emit('message',e.data));this.socket.addEventListener('close',()=>{this.readyState=3;this.emit('close');});this.readyState=1;this.emit('open');}).catch(e=>this.emit('error',e));}send(v){this.socket.send(v);}close(){this.readyState=3;this.socket?.close(1000,'fixture complete');}}
  const threadId=crypto.randomUUID(),state={creates:0,sends:0,moves:0,turn:0,pending:false,latest:null};
  const fake={async connect(){return this;},close(){},async call(name,input){
   if(name==='create_thread'){state.creates++;assert.equal(input.target.projectId,routes[0].id);state.latest={id:'initialized',status:'completed'};return {threadId};}
   if(name==='send_message_to_thread'){assert.equal(input.threadId,threadId);state.sends++;state.pending=true;return {threadId};}
   if(name==='move_thread_to_project'){assert.equal(input.threadId,threadId);assert.equal(input.projectId,routes[1].id);state.moves++;return {threadId,projectId:input.projectId};}
   if(name==='read_thread')return {thread:{id:threadId,hostId:'local',cwd:routes[0].workRoot}};
   if(name==='wait_threads'){
    if(state.pending){state.pending=false;const active=JSON.parse(fs.readFileSync(path.join(dir,'bridge-active.private.json'))),event=await a.ok(await a.machine('runner/event-check',{id:active.id,lease:active.lease},true)),t=event.task,context={eventId:event.job.id,eventLease:event.job.lease};
     if(state.turn===0)await a.ok(await a.machine('runner/clarify',{id:t.id,version:t.version,operationId:op(),question:'隔離問題發生在哪個畫面？',...context},true));
     else if(state.turn===1)await a.ok(await a.machine('runner/propose',{id:t.id,version:t.version,operationId:op(),projectId:a.projects[1].id,category:'help',proposal,...context},true));
     else {const claim=await a.ok(await a.machine('runner/claim',{id:t.id,operationId:op(),...context},true));await a.ok(await a.machine('runner/finish',{id:t.id,lease:claim.lease,operationId:op(),result:'隔離示例已處理。',explanation:{cause:'隔離示例設定有誤。',handling:'已調整隔離設定。',outcome:'隔離測試通過，請確認。'},deployed:false,evidence:['隔離驗證'],...context},true));}
     state.latest={id:'turn-'+(++state.turn),status:'completed'};
    }
    return {polls:[{thread:{id:threadId,status:{type:'idle'}},cursor:String(state.turn),latestTurn:state.latest}]};
   }
   throw Error('unexpected desktop action '+name);
  }};
  bridge=new EventBridge({operatorDirectory:dir,workRoot:'D:/fixture/am',promptFile:path.join(dir,'prompt.txt'),visibleChatsFile:path.join(dir,'routes.json')},{WebSocket:Socket,fetcher:(url,init)=>a.mf.dispatchFetch(url,init),visibleClientFactory:()=>fake});
  bridge.connect();await until(()=>bridge.ws?.readyState===1);
  const created=await a.ok(await a.intake({text:'隔離測試：畫面沒有反應'}));
  await until(async()=>state.turn===1&&!bridge.running);let task=await a.get(created.taskId);
  assert.equal(task.secretary.caseChat.threadId,threadId);assert.equal(task.secretary.waitingForReporter,true);assert(task.resultLinks.some(x=>x.label==='案件處理詳情'));
  const questionRow=await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question'").first(),question=JSON.parse(questionRow.value).lineMessage.contents.footer.contents[0].action.data;
  const {createXiaoyeSecretary}=await import('../core/xiaoye-secretary.js'),replies=[];
  const lineAdapter=createXiaoyeSecretary({env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tasks:{meetingShareIdentity:async()=>({account:'900003',tenantKey:'fixture'}),secretaryCall:async(route,input)=>a.ok(await a.machine(route,input))},line:{replyLineMessage:async(_,value)=>replies.push(value)}});
  await lineAdapter.capture([{type:'postback',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),postback:{data:question}}]);
  await lineAdapter.capture([{type:'message',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),message:{type:'text',id:op(),text:'隔離補充：手機畫面'}}]);
  await until(async()=>state.turn===2&&!bridge.running);task=await a.get(created.taskId);assert.equal(task.secretary.stage,'awaiting_approval');assert(task.description.includes('手機畫面'));assert.equal(task.primaryParentId,a.projects[1].id);assert.equal(task.secretary.caseChat.projectId,routes[1].id);
  task=(await a.approve(task)).task;await until(async()=>state.turn===3&&!bridge.running);task=await a.get(created.taskId);assert.equal(task.secretary.stage,'awaiting_confirmation');
  const confirmation={sender:{account:'900003',userId:user,botUserId:bot},source:{eventType:'postback',type:'user',botUserId:bot,userId:user,conversationId:user,eventId:op(),timestamp:Date.now(),postbackData:'xiaoye:result:confirm:'+task.id+':'+task.version}};
  assert((await a.ok(await a.machine('reporter',confirmation))).confirmed);task=await a.get(created.taskId);assert.equal(task.secretary.stage,'closed');
  assert.equal(state.creates,1);assert.equal(state.sends,3);assert.equal(state.moves,1);assert.equal(task.secretary.caseChat.threadId,threadId);
 }finally{bridge?.stop();await a.close();fs.rmSync(dir,{recursive:true,force:true});}
});

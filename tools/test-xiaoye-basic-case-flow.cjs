'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {setup}=require('./test-xiaoye-worker.cjs'),{EventBridge}=require(process.env.XIAOYE_TEST_BRIDGE||'./xiaoye-event-bridge.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),op=()=>crypto.randomUUID();
async function until(fn){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await wait(100);}throw Error('isolated flow timed out');}
test('one original case uses its bound chat for a question, follow-up, and complete answer',async()=>{
 const a=await setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-basic-flow-'));let bridge;
 try{
  const key='fixture-xiaoye-runner-key-000000000001',bot='U'+'a'.repeat(32),user='U'+'b'.repeat(32);
  a.config.oaBotUserId=bot;await a.db.prepare("UPDATE documents SET value=? WHERE namespace='xiaoye-secretary' AND key='config'").bind(JSON.stringify(a.config)).run();
  fs.writeFileSync(path.join(dir,'runner.private.json'),JSON.stringify({key}));fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'http://example.test',LEAF_TASK_TENANT:'fixture'}}));fs.writeFileSync(path.join(dir,'prompt.txt'),'虛構測試。');fs.writeFileSync(path.join(dir,'desktop.json'),'{}');
  const keys=['am','dailylog','uof','meeting','hozo'],routes=keys.map((key,i)=>({key,id:crypto.randomUUID(),serviceProjectId:a.projects[i]?.id||'fixture-hozo',threadId:crypto.randomUUID(),hostId:'local',workRoot:'D:/fixture/'+key}));
  fs.writeFileSync(path.join(dir,'routes.json'),JSON.stringify({routes,desktopContextFile:path.join(dir,'desktop.json'),caseChatsDirectory:path.join(dir,'case-chats')}));
  class Socket extends EventEmitter{constructor(url,options){super();this.readyState=0;a.mf.dispatchFetch(String(url).replace(/^ws:/,'http:'),{headers:{...options.headers,Upgrade:'websocket'}}).then(r=>{assert.equal(r.status,101);this.socket=r.webSocket;this.socket.accept();this.socket.addEventListener('message',e=>this.emit('message',e.data));this.socket.addEventListener('close',()=>{this.readyState=3;this.emit('close');});this.readyState=1;this.emit('open');}).catch(e=>this.emit('error',e));}send(v){this.socket.send(v);}close(){this.readyState=3;this.socket?.close(1000,'fixture complete');}}
  const threadId=crypto.randomUUID(),state={creates:0,sends:0,latest:null};
  const fake={async connect(){return this;},close(){},async call(name,input){
   if(name==='create_thread'){state.creates++;state.latest={id:'initialized',status:'completed'};return {threadId};}
   if(name==='send_message_to_thread'){
    state.sends++;assert.equal(input.threadId,threadId);const turnId='turn-'+state.sends;state.latest={id:turnId,status:'completed'};
    const reporterReply=state.sends===1?{type:'question',text:'請問在哪個畫面？'}:{type:'answer',text:'請先重新開啟畫面。',explanation:{cause:'畫面未更新。',handling:'提供重新開啟方式。',outcome:'請確認畫面。'},evidence:['隔離示例畫面']};return {threadId,turnId,reporterReply};
   }
   if(name==='read_thread')return {thread:{id:threadId,hostId:'local',cwd:routes[0].workRoot}};
   if(name==='wait_threads')return {polls:[{thread:{id:threadId,status:{type:'idle'}},cursor:String(state.sends),latestTurn:state.latest}]};
   throw Error('unexpected desktop action '+name);
  }};
  bridge=new EventBridge({operatorDirectory:dir,workRoot:'D:/fixture/am',promptFile:path.join(dir,'prompt.txt'),visibleChatsFile:path.join(dir,'routes.json')},{WebSocket:Socket,fetcher:(url,init)=>a.mf.dispatchFetch(url,init),visibleClientFactory:()=>fake});bridge.connect();await until(()=>bridge.ws?.readyState===1);
  const created=await a.ok(await a.intake({text:'隔離測試畫面問題'}));await until(async()=>state.sends===1&&!bridge.running);
  let task=await a.get(created.taskId);assert.equal(task.secretary.caseChat.threadId,threadId);assert.equal(task.secretary.waitingForReporter,true);
  const qrow=await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='question'").first();const button=JSON.parse(qrow.value).lineMessage.contents.footer.contents[0].action.data;
  const {createXiaoyeSecretary}=await import('../core/xiaoye-secretary.js');const line=createXiaoyeSecretary({env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tasks:{meetingShareIdentity:async()=>({account:'900003',tenantKey:'fixture'}),secretaryCall:async(route,input)=>a.ok(await a.machine(route,input))},line:{replyLineMessage:async()=>{}}});
  await line.capture([{type:'postback',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),postback:{data:button}}]);await line.capture([{type:'message',source:{type:'user',userId:user},timestamp:Date.now(),replyToken:'fixture',webhookEventId:op(),message:{type:'text',id:op(),text:'手機畫面'}}]);
  await until(async()=>state.sends===2&&!bridge.running);task=await a.get(created.taskId);assert.equal(task.secretary.stage,'awaiting_confirmation');assert.equal(task.primaryParentId,a.projects[0].id);assert(task.description.includes('手機畫面'));assert.equal(state.creates,1);
  const rows=(await a.db.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='result'").all()).results;assert.equal(rows.length,1);const notice=JSON.parse(rows[0].value);assert.equal(notice.taskId,created.taskId);assert.equal(notice.expectedUserId,user);assert(notice.message.includes('請先重新開啟畫面。'));
 }finally{bridge?.stop();await a.close();fs.rmSync(dir,{recursive:true,force:true});}
});

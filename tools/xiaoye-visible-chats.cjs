const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
const {appToolsDirectory,codexExecutable}=require('./xiaoye-runtime-paths.cjs');
const unwrap=result=>{const item=result?.content?.find(c=>c.type==='text');if(!item)throw Error('Codex聊天工具未傳回確認');const value=JSON.parse(item.text);if(result?.isError)throw Object.assign(Error('Codex聊天工具拒絕操作'),{code:value?.error||'desktop_error'});return value;};
function desktopPipe(names){const matches=names.filter(n=>/^codex-app-tools-[0-9a-f-]+$/i.test(n));if(matches.length!==1)throw Error('目前無法唯一確認Codex桌面連線');return '\\\\.\\pipe\\'+matches[0];}
class DesktopMcp {
 constructor(context,{launch=spawn,pipeNames=()=>fs.readdirSync('\\\\.\\pipe\\'),appServerContext=null,appServerFactory=options=>new CodexAppServerClient(options)}={}){this.context=context;this.launch=launch;this.pipeNames=pipeNames;this.appServerContext=appServerContext;this.appServerFactory=appServerFactory;this.pending=new Map();this.sequence=0;this.buffer='';}
 async connect(){
  const t=this.context.transport,env={...process.env,...t.env,...this.context.environment};
  const cwd=appToolsDirectory(t.cwd);
  if(process.platform==='win32')env.CODEX_APP_TOOLS_PIPE_PATH=desktopPipe(this.pipeNames());
  this.child=this.launch(t.command,t.args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',()=>{});
  this.child.on('error',()=>this.rejectAll());this.child.on('exit',()=>this.rejectAll());
  this.child.stdout.on('data',b=>{this.buffer+=b;if(this.buffer.length>8*1024*1024){this.rejectAll();this.close();return;}let n;while((n=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);let v;try{v=JSON.parse(line);}catch{continue;}const pending=this.pending.get(v.id);if(!pending)continue;this.pending.delete(v.id);clearTimeout(pending.timer);v.error?pending.reject(Object.assign(Error('Codex桌面連線拒絕要求'),{mcpError:v.error,method:pending.method})):pending.resolve(v.result);}});
  try{
   await this.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'xiaoye-visible-event-router',version:'1.0'}});
   this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
   const listed=await this.request('tools/list',{});this.names=new Set((listed.tools||[]).map(t=>t.name));
   for(const name of ['send_message_to_thread','read_thread'])if(!this.names.has(name))throw Error('目前Codex桌面缺少聊天接續工具');
   if(this.appServerContext){
    const c=this.appServerContext;
    if(!c.nodeExecutable||!c.runtimeToolsFile||!c.toolContextFile||!c.eventCheckFile||!c.operatorDirectory||!['analyze','execute'].includes(c.kind))throw Error('案件 App Server 接線資料不完整');
    const overrides=[
     'mcp_servers.xiaoye_runtime.command='+JSON.stringify(c.nodeExecutable),
     'mcp_servers.xiaoye_runtime.args='+JSON.stringify([c.runtimeToolsFile,c.toolContextFile,c.eventCheckFile]),
     'mcp_servers.xiaoye_runtime.enabled=true',
     'mcp_servers.xiaoye_runtime.default_tools_approval_mode="approve"'
    ];
    this.appServer=this.appServerFactory({executable:codexExecutable(c.codexExecutable),configOverrides:overrides});
    await this.appServer.connect();
    const profiles=await this.appServer.request('permissionProfile/list');
    if(c.kind==='execute'&&!profiles.data?.some(p=>p.id===':danger-full-access'&&p.allowed))throw Error('案件完整執行權限目前不可用');
   }
   return this;
  }catch(error){this.close();throw error;}
 }
 rejectAll(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Codex桌面連線中斷，原事件不可自動重送'));}this.pending.clear();}
 request(method,params,timeoutMs=30000){return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Codex聊天工具回應未確認，原事件不可自動重送'));},timeoutMs);this.pending.set(id,{resolve,reject,timer,method});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 async call(name,args){
  if(name==='wait_threads'){
   // The installed desktop MCP supports reads and dispatch, but its wait endpoint
   // rejects external clients. Observe only this active event's chat, without AI
   // polling or any business queue reads. No observer runs while the bridge is idle.
   if(args.timeoutMs)await new Promise(resolve=>setTimeout(resolve,Math.min(args.timeoutMs,30000)));
   const target=args.targets?.[0];if(!target||args.targets.length!==1)throw Error('只准確認本次指定聊天');
   const v=await this.call('read_thread',{threadId:target.threadId,turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:0});
   return {polls:[{thread:v.thread,latestTurn:v.turns?.[0],cursor:v.turns?.[0]?.id}]};
  }
  if(name==='send_message_to_thread'&&this.appServer){
   if(args.hostId!=='local'||!args.threadId||!args.prompt)throw Error('案件聊天派送目標不完整');
   const desktop=await this.call('read_thread',{threadId:args.threadId,hostId:'local',turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:0});
   if(desktop.thread?.id!==args.threadId||desktop.thread?.hostId!=='local'||!desktop.thread?.cwd)throw Error('無法確認原案件聊天及工作目錄');
   await this.handoffToAppServer({threadId:args.threadId,workRoot:desktop.thread.cwd});
   const c=this.appServerContext;
   const policy={permissions:':danger-full-access'};
   return this.appServer.startTurn({threadId:args.threadId,cwd:desktop.thread.cwd,prompt:args.prompt,...policy,approvalPolicy:'never'});
  }
  if(!['send_message_to_thread','read_thread','create_thread','move_thread_to_project','set_thread_archived'].includes(name))throw Error('不是允許的專用聊天操作');
  return unwrap(await this.request('tools/call',{name,arguments:args,_meta:{'openai/threadId':this.context.ownerThreadId}},90000));
 }
 async handoffToAppServer({threadId,workRoot}){
  if(!this.appServer)throw Error('案件 App Server 尚未連線');
  const desktop=await this.call('read_thread',{threadId,hostId:'local',turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:0});
  if(desktop.thread?.id!==threadId||desktop.thread?.hostId!=='local'||path.win32.normalize(desktop.thread.cwd||'').toLowerCase()!==path.win32.normalize(workRoot||'').toLowerCase())throw Error('案件聊天與原專案目錄不符');
  const status=desktop.thread?.status?.type;
  if(status==='active'||status==='running')throw Error('案件聊天仍在執行，暫停交接');
  try{return await this.appServer.resume(threadId,workRoot);}catch(error){
   if(!/already has an active writer/i.test(error.message))throw error;
  }
  await this.call('set_thread_archived',{threadId,hostId:'local',archived:true});
  await this.call('set_thread_archived',{threadId,hostId:'local',archived:false});
  return this.appServer.resume(threadId,workRoot);
 }
 close(){this.appServer?.close();this.child?.stdin.end();const child=this.child;if(child){const timer=setTimeout(()=>child.kill(),1000);timer.unref();child.once('exit',()=>clearTimeout(timer));}this.rejectAll();}
}
function selectRoute(config,checked){
 const task=checked.task,projectId=task?.primaryParentId;
 if(config.routes?.length!==5||new Set(config.routes.map(r=>r.key)).size!==5||new Set(config.routes.map(r=>r.threadId)).size!==5||new Set(config.routes.map(r=>r.serviceProjectId)).size!==5)throw Error('五專案聊天設定不完整或重複');
 if(!task?.secretary||!checked.job||checked.job.taskId!==task.id)throw Error('事件與原案件不符');
 const project=projectId?checked.projects?.find(p=>p.id===projectId):checked.projects?.find(p=>p.key==='am');
 if(!project||!['am','dailylog','uof','meeting','hozo'].includes(project.key))throw Error('案件不是目前五個服務專案');
 const route=config.routes.find(r=>r.serviceProjectId===project.id&&r.key===project.key);
 if(!route||!route.threadId||route.hostId!=='local')throw Error('找不到已指定的Codex專用聊天');
 return route;
}
const pollFor=(v,id)=>{const poll=v?.polls?.find(p=>p.thread?.id===id);if(!poll||v.errors?.length)throw Error('無法確認指定聊天狀態');return poll;};
const active=p=>['active','running'].includes(p.thread?.status?.type)||['inProgress','in_progress','running'].includes(p.latestTurn?.status);
async function runVisibleEvent({client,config,checked,check,save,prompt,clock=Date.now,timeoutMs=27*60000}){
 const deadline=clock()+timeoutMs;let current=checked,route=selectRoute(config,current),before;
 while(true){if(clock()>=deadline)throw Error('專用聊天忙碌逾時，本次未重送案件');current=await check();const fresh=selectRoute(config,current);if(fresh.threadId!==route.threadId)throw Error('案件分類已變更，停止原聊天派送');const response=await client.call('wait_threads',{targets:[{threadId:route.threadId,hostId:route.hostId}],timeoutMs:before?60000:0});save('chat-before.private.json',response);before=pollFor(response,route.threadId);if(!active(before))break;}
 current=await check();const fresh=selectRoute(config,current);if(fresh.threadId!==route.threadId)throw Error('案件專案已變更');
 const metadata=await client.call('read_thread',{threadId:route.threadId,hostId:route.hostId,turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:0});
 const canonical=p=>path.win32.normalize(p||'').normalize('NFC').toLowerCase();
 if(metadata.thread?.id!==route.threadId||metadata.thread?.hostId!==route.hostId||canonical(metadata.thread.cwd)!==canonical(route.workRoot))throw Error('指定聊天已移到其他專案，停止派送');
 current=await check();if(selectRoute(config,current).threadId!==route.threadId)throw Error('案件專案已變更');
 const input={threadId:route.threadId,hostId:route.hostId,prompt};save('chat-dispatch.input.private.json',input);
 save('started.private.json',{at:new Date(clock()).toISOString(),jobKind:checked.job.kind,threadId:route.threadId,delivery:'visible-desktop-chat'});
 const accepted=await client.call('send_message_to_thread',input);save('chat-dispatch.response.private.json',accepted);
 let cursor=before.cursor;
 while(clock()<deadline){await check();const response=await client.call('wait_threads',{targets:[{threadId:route.threadId,hostId:route.hostId,...cursor?{afterCursor:cursor}:{}}],timeoutMs:60000});save('chat-progress.private.json',response);const p=pollFor(response,route.threadId);cursor=p.cursor||cursor;
  if(p.latestTurn?.id&&p.latestTurn.id!==before.latestTurn?.id&&!active(p)){if(p.latestTurn.status!=='completed')throw Error('專用聊天本次處理未完成');save('chat-completed.private.json',{threadId:route.threadId,turnId:p.latestTurn.id,at:new Date(clock()).toISOString()});return {threadId:route.threadId,turnId:p.latestTurn.id};}
 }
 throw Error('本次聊天結果尚未確認，停止事件且不重送');
}
module.exports={DesktopMcp,selectRoute,runVisibleEvent,unwrap,desktopPipe};

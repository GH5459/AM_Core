const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {appToolsDirectory,codexExecutable}=require('./xiaoye-runtime-paths.cjs');
class McpClient{
 constructor(file,context){this.seq=0;this.pending=new Map();this.buffer='';this.context=context;this.child=cp.spawn(context.nodeExecutable,[file],{cwd:path.dirname(file),windowsHide:true,env:{...process.env,CODEX_APP_TOOLS_PIPE_PATH:context.pipePath,CODEX_APP_TOOLS_DEFERRED:'0'},stdio:['pipe','pipe','pipe']});this.child.stderr.on('data',()=>{});this.child.on('error',()=>this.close());this.child.on('exit',()=>this.close());this.child.stdout.on('data',b=>{this.buffer+=b;let n;while((n=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);let v;try{v=JSON.parse(line);}catch{continue;}const p=this.pending.get(v.id);if(p){this.pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);}}});}
 request(method,params={}){const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('工具回應逾時。'));},90000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 async init(){await this.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'xiaoye-runtime',version:'1'}});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');return this;}
 call(name,args){return this.request('tools/call',{name,arguments:args,_meta:{'openai/threadId':this.context.ownerThreadId}});}
 close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('桌面工具連線已中斷。'));}this.pending.clear();this.child?.kill();}
}
function currentContext(context,{platform=process.platform,pipeNames=()=>fs.readdirSync('\\\\.\\pipe\\')}={}){
 if(platform!=='win32')return {...context};
 return {...context,pipePath:require('./xiaoye-visible-chats.cjs').desktopPipe(pipeNames())};
}
async function clients(context){let a;try{context=currentContext(context);a=await new McpClient(path.join(appToolsDirectory(path.dirname(context.serverFile)),'server.mjs'),context).init();return {app:a,review:a,close(){a.close();}};}catch(e){a?.close();throw e;}}
const caseRepositories=Object.freeze({am:'GH5459/AM_Core',dailylog:'GH5459/DailyLog',uof:'GH5459/UOF_LoginCheck',meeting:'GH5459/AM_Core',hozo:'GH5459/rental-management-blueprint'});
async function guard(context,eventFile){if(!eventFile)throw Error('附加PR前缺少案件執行資格。');const event=JSON.parse(fs.readFileSync(eventFile)),folder=context.operatorDirectory,cfg=JSON.parse(fs.readFileSync(folder+'/wrangler.json')),credential=JSON.parse(fs.readFileSync(folder+'/runner.private.json'));const call=async(action,v)=>{const r=await fetch(new URL('/api/integrations/leaf-snail/tasks/secretary/runner/'+action,cfg.vars.PUBLIC_ORIGIN),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+credential.key,'Content-Type':'application/json'},body:JSON.stringify({tenantKey:cfg.vars.LEAF_TASK_TENANT,...v}),signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||!j.ok)throw Error('案件授權或執行資格已失效。');return j;};const current=await call('event-check',event);if(current.job?.kind!=='execute'||current.task?.secretary?.stage!=='executing')throw Error('只有已獲授權且已領取的案件可附加PR。');const project=current.task.primaryParentId?current.projects?.find(p=>p.id===current.task.primaryParentId):current.projects?.find(p=>p.key==='am');if(!project||!caseRepositories[project.key])throw Error('案件所屬專案不在已設定範圍。');await call('check',{id:current.task.id,lease:current.task.secretary.lease});return project.key;}
function validate(name,args,projectKey){
 if(!['attach_artifact','list_artifacts','pull_requests_checks'].includes(name))throw Error('此工具未開放。');
 if(name==='attach_artifact'){
  const expected=caseRepositories[projectKey];
  if(!expected||args.artifact_type!=='pull_request'||typeof args.url!=='string')throw Error('案件PR附加範圍不符。');
  let url;try{url=new URL(args.url);}catch{throw Error('案件PR網址無效。');}
  const match=/^\/([^/]+)\/([^/]+)\/pull\/([1-9][0-9]*)$/.exec(url.pathname);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.search||url.hash||!match||`${match[1]}/${match[2]}`.toLowerCase()!==expected.toLowerCase())throw Error('案件PR附加範圍不符。');
 }
 if(name==='pull_requests_checks'){
  const pr=args.pullRequest,repo=pr?.owner&&pr?.repository?`${pr.owner}/${pr.repository}`:null;
  if(pr?.hostname!=='github.com'||!repo||!Object.values(caseRepositories).some(x=>x.toLowerCase()===repo.toLowerCase()))throw Error('CI查核僅允許已設定的服務儲存庫。');
 }
}
function toolError(code,message,cause){return Object.assign(Error(message),{code,cause});}
async function preflight(context,{workRoot}={}){let c;try{
 const checks=[[context.gitExecutable,['--version'],'git_unavailable','Git工具無法使用。']];
 if(workRoot)checks.push([context.gitExecutable,['-C',workRoot,'rev-parse','--show-toplevel'],'git_unavailable','案件專案的Git資料夾無法讀取。']);
 for(const [file,args,code,message] of checks){
  const r=cp.spawnSync(file,args,{cwd:workRoot||undefined,encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,PATH:[path.dirname(context.gitExecutable),process.env.PATH||''].join(path.delimiter)}});if(r.status!==0)throw toolError(code,message);
 }
 const {CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
 let appServer;try{
  appServer=await new CodexAppServerClient({executable:codexExecutable(context.codexExecutable||process.env.CODEX_CLI_PATH)}).connect();
  const status=await appServer.request('mcpServerStatus/list');
  const github=status.data?.find(s=>s.name==='codex_apps');
  if(!github?.tools?.['github.search_repositories']||!github?.tools?.['github.get_pr_info']||!github?.tools?.['github.get_pr_statuses'])throw Error('GitHub MCP 工具不完整');
  const temporary=await appServer.request('thread/start',{ephemeral:true,cwd:context.operatorDirectory,permissions:':danger-full-access',approvalPolicy:'never'});
  if(!temporary.thread?.id)throw Error('無法建立唯讀工具上下文');
  for(const repository of [...new Set(Object.values(caseRepositories))]){
   const result=await appServer.request('mcpServer/tool/call',{server:'codex_apps',tool:'github.search_repositories',arguments:{query:'repo:'+repository,per_page:2},threadId:temporary.thread.id},45000);
   if(result.isError||!JSON.stringify(result.structuredContent||result.content||[]).toLowerCase().includes(repository.toLowerCase()))throw Error('GitHub 儲存庫無法讀取：'+repository);
  }
 }catch(e){throw toolError('github_unavailable','案件專案的 GitHub MCP 連線或授權無法使用。',e);}finally{appServer?.close();}
 try{c=await clients(context);}catch(first){
  // Only reconnect the read-only tool discovery; never retry a dispatched action.
  await new Promise(resolve=>setTimeout(resolve,250));
  try{c=await clients(context);}catch(e){throw toolError('desktop_unavailable','Codex桌面連線無法使用。',e);}
 }
 let app,review;try{app=await c.app.request('tools/list');review=await c.review.request('tools/list');}catch(e){throw toolError('desktop_unavailable','Codex桌面工具無法讀取。',e);}
 if(!app.tools.some(t=>t.name==='attach_artifact'))throw toolError('pr_unavailable','聊天附加PR工具無法使用。');
 if(!review.tools.some(t=>t.name==='read_pull_request_check_diagnostics'))throw toolError('ci_unavailable','自動測試查核工具無法使用。');
 let result;try{result=await c.app.call('list_artifacts',{});}catch(e){throw toolError('owner_chat_unavailable','無法核對原聊天。',e);}
 if(result.isError)throw toolError('owner_chat_unavailable','無法核對原聊天。');
 return {ok:true,git:true,github:true,attachArtifact:true,ciTool:true,ownerChatVerified:true};
 }finally{c?.close();}}
async function serve(context,eventFile){const c=await clients(context),app=await c.app.request('tools/list'),allowed=app.tools.map(t=>t.name==='read_pull_request_check_diagnostics'?{...t,name:'pull_requests_checks'}:t).filter(t=>['attach_artifact','list_artifacts','pull_requests_checks'].includes(t.name));let buffer='';const send=v=>process.stdout.write(JSON.stringify(v)+'\n');const handle=async req=>{if(req.id===undefined)return;try{let result;if(req.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'xiaoye-runtime-tools',version:'1'}};else if(req.method==='tools/list')result={tools:allowed};else if(req.method==='tools/call'){const {name,arguments:args={}}=req.params;let operationFile;if(name==='attach_artifact'){const projectKey=await guard(context,eventFile);validate(name,args,projectKey);const operationId=crypto.createHash('sha256').update(eventFile+':'+args.url).digest('hex'),folder=path.join(context.operatorDirectory,'app-operations');fs.mkdirSync(folder,{recursive:true});operationFile=path.join(context.operatorDirectory,'app-operations',operationId);const input={operationId,tool:name,arguments:args,eventInputFile:eventFile};if(!fs.existsSync(operationFile+'.input.private.json'))fs.writeFileSync(operationFile+'.input.private.json',JSON.stringify(input,null,2));}else validate(name,args);result=await c.app.call(name==='pull_requests_checks'?'read_pull_request_check_diagnostics':name,args);if(operationFile)fs.writeFileSync(operationFile+'.response.private.json',JSON.stringify(result,null,2));}else throw Error('此操作未開放。');send({jsonrpc:'2.0',id:req.id,result});}catch(e){send({jsonrpc:'2.0',id:req.id,error:{code:-32000,message:e.message}});}};process.stdin.on('data',b=>{buffer+=b;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{void handle(JSON.parse(line));}catch{}}});process.stdin.on('end',()=>{c.close();process.exit(0);});}
module.exports={McpClient,clients,currentContext,preflight,validate,serve,guard,caseRepositories};
if(require.main===module){const context=JSON.parse(fs.readFileSync(path.resolve(process.argv[2])));(process.argv[3]==='preflight'?preflight(context).then(v=>console.log(JSON.stringify(v))):serve(context,process.argv[3])).catch(()=>{console.error('背景Git／PR工具無法連線；請查看私人檢查紀錄並重新連接桌面工具。');process.exitCode=1;});}

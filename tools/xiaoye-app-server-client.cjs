const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

class CodexAppServerClient {
  constructor({ executable = 'codex', launch = spawn, requestTimeoutMs = 30000, turnTimeoutMs = 27 * 60000, configOverrides = [] } = {}) {
    this.executable = executable;
    this.launch = launch;
    this.requestTimeoutMs = requestTimeoutMs;
    this.turnTimeoutMs = turnTimeoutMs;
    this.configOverrides = configOverrides;
    this.sequence = 0;
    this.pending = new Map();
    this.completions = new Map();
    this.waiters = new Map();
    this.buffer = '';
    this.closed = false;
  }
  async connect() {
    const argumentsList = ['app-server', '--stdio', ...this.configOverrides.flatMap(value => ['-c', value])];
    this.child = this.launch(this.executable, argumentsList, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.lastStderr = '';
    this.child.stderr.on('data', chunk => { this.lastStderr = (this.lastStderr + chunk.toString()).slice(-12000); });
    this.child.once('error', error => this.rejectAll(error));
    this.child.once('exit', () => this.rejectAll(Error('Codex App Server 已結束，操作結果須核對')));
    try {
      await this.request('initialize', {
        clientInfo: { name: 'xiaoye-case-router', title: 'XiaoYe Case Router', version: '1.0.0' },
        capabilities: { experimentalApi: true }
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
      return this;
    } catch (error) { this.close(); throw error; }
  }
  read(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 8 * 1024 * 1024) return this.rejectAll(Error('Codex App Server 訊息過大'));
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id != null) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        message.error ? pending.reject(Object.assign(Error(message.error.message || 'Codex App Server 拒絕操作'), { code: message.error.code })) : pending.resolve(message.result);
      } else if (message.method === 'turn/completed') {
        const turn = message.params?.turn;
        if (!turn?.id) continue;
        this.completions.set(turn.id, turn);
        const waiter = this.waiters.get(turn.id);
        if (waiter) { this.waiters.delete(turn.id); clearTimeout(waiter.timer); waiter.resolve(turn); }
      }
    }
  }
  request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.child || this.closed) return Promise.reject(Error('Codex App Server 未連線'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Codex App Server 回應未確認，禁止重送原操作')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async readThread(threadId) {
    const value = await this.request('thread/read', { threadId, includeTurns: false });
    if (value?.thread?.id !== threadId) throw Error('指定案件聊天不存在');
    return value.thread;
  }
  async resume(threadId, expectedCwd) {
    const before = await this.readThread(threadId);
    if (expectedCwd && path.win32.normalize(before.cwd || '').toLowerCase() !== path.win32.normalize(expectedCwd).toLowerCase()) throw Error('案件聊天的工作目錄與原專案不符');
    const value = await this.request('thread/resume', { threadId, excludeTurns: true });
    if (value?.thread?.id !== threadId) throw Error('案件聊天接續結果不符');
    return value.thread;
  }
  waitForTurn(turnId, timeoutMs = this.turnTimeoutMs) {
    if (this.completions.has(turnId)) return Promise.resolve(this.completions.get(turnId));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(turnId); reject(Error('案件聊天處理仍未確認完成，禁止重新派送')); }, timeoutMs);
      this.waiters.set(turnId, { resolve, reject, timer });
    });
  }
  async startTurn({ threadId, prompt, cwd, permissions, sandboxPolicy, approvalPolicy = 'never' }) {
    if (!threadId || !prompt) throw Error('案件聊天與問題內容不可為空');
    if (permissions && sandboxPolicy) throw Error('案件聊天不可同時指定兩種權限設定');
    if (!permissions && !sandboxPolicy) throw Error('案件聊天必須明確指定執行權限');
    const params = { threadId, input: [{ type: 'text', text: prompt }], approvalPolicy };
    if (permissions) params.permissions = permissions;
    if (sandboxPolicy) params.sandboxPolicy = sandboxPolicy;
    if (cwd) params.cwd = cwd;
    const started = await this.request('turn/start', params);
    const turnId = started?.turn?.id;
    if (!turnId) throw Error('案件聊天已送出，但未取得處理編號；禁止重新派送');
    const turn = await this.waitForTurn(turnId);
    if (turn.status !== 'completed') throw Object.assign(Error('案件聊天未正常完成'), { turnId, status: turn.status, turnError: turn.error });
    const read = await this.request('thread/read', { threadId, includeTurns: true });
    const stored = read?.thread?.turns?.find(item => item.id === turnId);
    if (!stored || stored.status !== 'completed') throw Object.assign(Error('案件聊天完成結果尚未回讀確認'), { turnId });
    const tools = (stored.items || []).filter(item => ['commandExecution', 'mcpToolCall'].includes(item.type));
    const succeeded = tools.filter(item => item.status === 'completed' && (item.type !== 'commandExecution' || item.exitCode === 0)).length;
    const failed = tools.filter(item => item.status === 'failed' || item.type === 'commandExecution' && item.exitCode !== 0).length;
    if (failed > 0 && succeeded === 0) throw Object.assign(Error('案件聊天工具執行失敗，不能視為完成'), { turnId, toolEvidence: { attempted: tools.length, succeeded, failed } });
    return { threadId, turnId, status: turn.status, toolEvidence: { attempted: tools.length, succeeded, failed } };
  }
  rejectAll(error) {
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
    for (const item of this.waiters.values()) { clearTimeout(item.timer); item.reject(error); }
    this.waiters.clear();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(Error('Codex App Server 連線關閉'));
    this.child?.stdin.end();
    const child = this.child;
    if (child) { const timer = setTimeout(() => child.kill(), 1000); timer.unref(); child.once('exit', () => clearTimeout(timer)); }
  }
}
const caseRepositories = Object.freeze({am:'GH5459/AM_Core',dailylog:'GH5459/DailyLog',uof:'GH5459/UOF_LoginCheck',meeting:'GH5459/AM_Core',hozo:'GH5459/rental-management-blueprint'});
function createCaseExecutorVerifier(config,{Client=CodexAppServerClient,log=message=>console.warn(message)}={}){
 return async function verifyCaseExecutor(active,inspected){
  let client;
  try{
   const routes=JSON.parse(fs.readFileSync(config.visibleChatsFile,'utf8')).routes;
   const task=inspected?.task||inspected?.checked?.task||active?.task;
   const projects=inspected?.projects||inspected?.checked?.projects||active?.projects;
   const project=task?.primaryParentId?projects?.find(p=>p.id===task.primaryParentId):projects?.find(p=>p.key==='am');
   const route=routes.find(r=>r.key===project?.key&&r.serviceProjectId===project?.id);
   if(!route?.workRoot||!caseRepositories[route.key])throw Error('無法確認原案件的五專案路由');
   const eventFile=active?.eventFile||active?.eventInputFile||active?.inputFile||(active?.id&&path.join(config.operatorDirectory,'event-runs',active.id,'check.input.private.json'));
   if(!eventFile||!fs.existsSync(eventFile))throw Error('無法確認本次事件檔');
   const eventInput=JSON.parse(fs.readFileSync(eventFile,'utf8'));
   if(active?.id&&eventInput.id!==active.id)throw Error('事件檔與待恢復事件不符');
   if(active?.lease&&eventInput.lease!==active.lease)throw Error('事件檔 lease 已變更');
   const inspectedEvent=inspected?.event;
   if(active?.id&&(!inspectedEvent||inspectedEvent.id!==active.id||inspectedEvent.taskId!==active.taskId||inspectedEvent.sourceVersion!==active.sourceVersion))throw Error('原案件查核結果與待恢復事件不符');
   const operator=JSON.parse(fs.readFileSync(path.join(config.operatorDirectory,'wrangler.json'),'utf8'));
   const toolContext=JSON.parse(fs.readFileSync(config.toolContextFile,'utf8'));
   const origin=new URL(operator.vars.PUBLIC_ORIGIN);
   if(origin.protocol!=='https:')throw Error('案件 API 位址不是 HTTPS');
   const overrides=[
    'mcp_servers.xiaoye_runtime.command='+JSON.stringify(config.nodeExecutable),
    'mcp_servers.xiaoye_runtime.args='+JSON.stringify([config.runtimeToolsFile,config.toolContextFile,eventFile]),
    'mcp_servers.xiaoye_runtime.enabled=true',
    'mcp_servers.xiaoye_runtime.default_tools_approval_mode="approve"'
   ];
   client=await new Client({executable:config.codexExecutable||'codex',configOverrides:overrides}).connect();
   const profiles=await client.request('permissionProfile/list');
   if(!profiles.data?.some(p=>p.id===':danger-full-access'&&p.allowed))throw Error('案件完整執行權限不可用');
   const status=await client.request('mcpServerStatus/list');
   const github=status.data?.find(s=>s.name==='codex_apps');
   const runtime=status.data?.find(s=>s.name==='xiaoye_runtime');
   for(const name of ['github.search_repositories','github.get_pr_info','github.get_pr_statuses','github.create_pull_request'])if(!github?.tools?.[name])throw Error('GitHub 工具不完整：'+name);
   for(const name of ['list_artifacts','attach_artifact','pull_requests_checks'])if(!runtime?.tools?.[name])throw Error('原案件 PR／CI 工具不完整：'+name);
   const git=await client.request('command/exec',{command:[toolContext.gitExecutable,'-C',route.workRoot,'rev-parse','--show-toplevel'],cwd:route.workRoot,permissionProfile:':danger-full-access',timeoutMs:15000,outputBytesCap:1024},30000);
   if(git.exitCode!==0)throw Error('案件工作目錄 Git 無法讀取');
   const probe="fetch("+JSON.stringify(origin.origin)+",{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(12000)}).then(r=>{console.log(r.status);if(r.status<200||r.status>=400)process.exitCode=1}).catch(e=>{console.error(e.message);process.exitCode=1})";
   const network=await client.request('command/exec',{command:[config.nodeExecutable, '-e',probe],cwd:route.workRoot,permissionProfile:':danger-full-access',timeoutMs:15000,outputBytesCap:1024},30000);
   if(network.exitCode!==0)throw Error('案件執行環境無法連到工作日誌');
   const temporary=await client.request('thread/start',{ephemeral:true,cwd:route.workRoot,permissions:':danger-full-access',approvalPolicy:'never'});
   if(!temporary.thread?.id)throw Error('無法建立唯讀工具探測上下文');
   const query=await client.request('mcpServer/tool/call',{server:'codex_apps',tool:'github.search_repositories',arguments:{query:'repo:'+caseRepositories[route.key],per_page:2},threadId:temporary.thread.id},45000);
   if(query.isError||!JSON.stringify(query.structuredContent||query.content||[]).toLowerCase().includes(caseRepositories[route.key].toLowerCase()))throw Error('GitHub 儲存庫唯讀查核失敗');
   const artifacts=await client.request('mcpServer/tool/call',{server:'xiaoye_runtime',tool:'list_artifacts',arguments:{},threadId:temporary.thread.id},45000);
   if(artifacts.isError)throw Error('原案件聊天 PR 工具唯讀查核失敗');
   return true;
  }catch(error){log('案件執行環境未通過：'+error.message);return false;}
  finally{client?.close();}
 };
}
module.exports = { CodexAppServerClient, createCaseExecutorVerifier };

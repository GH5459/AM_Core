const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const runtimeTools=require('./xiaoye-runtime-tools.cjs');
const {codexExecutable}=require('./xiaoye-runtime-paths.cjs');
const {reconcileInterruptedEvent,nextFailure}=require('./xiaoye-event-recovery.cjs');
const {failedEventCandidatePage}=require('./xiaoye-failed-event-scan.cjs');
class EventBridge {
  constructor(config,{WebSocket,launch,fetcher=fetch,clock=Date.now,checkTools=runtimeTools.preflight,visibleClientFactory,verifyCaseExecutor,verifyExactRenderPublish}={}) {
    this.config=config;this.folder=config.operatorDirectory;this.WebSocket=WebSocket||require(config.wsModule);this.launch=launch||((args,options)=>spawn(codexExecutable(config.codexExecutable),args,options));this.fetcher=fetcher;this.clock=clock;
    this.pending=new Set();this.running=null;this.stopped=false;this.retry=0;this.childrenStarted=0;this.checkTools=checkTools;this.visibleClientFactory=visibleClientFactory;this.verifyCaseExecutor=verifyCaseExecutor;this.verifyExactRenderPublish=verifyExactRenderPublish;
    this.failedRecoveryTimer=null;this.failedRecoveryAttempts=0;this.failedRecoveryOffset=0;this.failedRecoverySweepPending=false;
    fs.mkdirSync(path.join(this.folder,'event-runs'),{recursive:true});
    this.credentials=JSON.parse(fs.readFileSync(path.join(this.folder,'runner.private.json')));
    this.worker=JSON.parse(fs.readFileSync(path.join(this.folder,'wrangler.json')));
    this.prefix='/api/integrations/leaf-snail/tasks/secretary/runner/';
  }
  save(file,value) {const destination=path.join(this.folder,file);fs.mkdirSync(path.dirname(destination),{recursive:true});const temp=destination+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,destination);return destination;}
  async call(action,input={},file) {
    if(file)this.save(file,input);
    for(let attempt=0;attempt<3;attempt++){
      try{const r=await this.fetcher(new URL(this.prefix+action,this.worker.vars.PUBLIC_ORIGIN),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.credentials.key,'Content-Type':'application/json'},body:JSON.stringify({tenantKey:this.worker.vars.LEAF_TASK_TENANT,...input}),signal:AbortSignal.timeout(45000)});
        const v=await r.json();if(!r.ok||!v.ok)throw Object.assign(Error('Secretary event API rejected action'),{status:r.status,action,reason:typeof v.error==='string'&&/^[\u3000-\u9fff\s，。；：、（）「」／0-9]{1,180}$/.test(v.error)?v.error:null});return v;
      }catch(e){if(attempt===2||e.status&&e.status<500)throw e;await new Promise(resolve=>setTimeout(resolve,500*2**attempt));}
    }
  }
  status(state,extra={}) {this.save('bridge-status.private.json',{state,pid:process.pid,at:new Date(this.clock()).toISOString(),childrenStarted:this.childrenStarted,...extra});}
  failedRetryBudget(active,inspected,rel){
    const key=crypto.createHash('sha256').update(active.taskId).digest('hex');
    const relative='case-recovery/'+key+'.private.json',p=path.join(this.folder,relative);
    const previous=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
    const source=path.join(this.folder,rel,'tools-preflight.private.json');
    const code=fs.existsSync(source)?JSON.parse(fs.readFileSync(source)).code||'unclassified':'unclassified';
    // The server separately bounds replanning; infrastructure failures keep their own retry budget.
    if(inspected.event.state==='done'&&inspected.event.kind==='execute')return true;
    const signature=inspected.event.kind+':'+code;
    const next=nextFailure(previous,{eventId:active.id,signature,now:this.clock()});
    this.save(relative,next);
    return next.automaticRetryAllowed;
  }
  async recover() {
    const file=path.join(this.folder,'bridge-active.private.json');if(!fs.existsSync(file))return;
    const active=JSON.parse(fs.readFileSync(file));
    if(active.phase==='finished')return;
    const rel='event-runs/'+active.id,read=name=>{const p=path.join(this.folder,rel,name);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;};
    if(!active.taskId||!Number.isSafeInteger(active.sourceVersion)){
      const acquired=read('acquire.response.private.json')?.job;
      if(acquired?.id===active.id&&acquired.lease===active.lease){active.taskId=acquired.taskId;active.sourceVersion=acquired.sourceVersion;}
    }
    if(!active.taskId||!Number.isSafeInteger(active.sourceVersion)){
      this.status('reconciliation-required',{eventId:active.id,decision:'missing-exact-identity'});return;
    }
    const completeIntent=read('event-complete.input.private.json'),failIntent=read('event-fail.input.private.json')||read('failure.input.private.json'),intent=completeIntent||failIntent;
    const evidence={finalization:intent?.operationId?{action:completeIntent?'complete':'fail',operationId:intent.operationId}:null,chatDispatchInput:!!read('chat-dispatch.input.private.json'),executorReady:typeof this.verifyCaseExecutor==='function'?this.verifyCaseExecutor:false};
    evidence.failureBudgetAvailable=(a,inspected)=>this.failedRetryBudget(a,inspected,rel);
    const result=await reconcileInterruptedEvent({active,evidence,
      inspectEvent:async(taskId,eventId)=>this.call('event-inspect',{id:taskId,eventId}),
      verifyLease:async a=>{try{const r=await this.call('event-check',{id:a.id,lease:a.lease});return r.job?.id===a.id&&r.job?.lease===a.lease;}catch(e){if([403,409].includes(e.status))return false;throw e;}},
      finalizeEvent:async(action,input)=>this.call(action==='complete'?'event-complete':'event-fail',input,rel+'/recovery-'+action+'.input.private.json'),
      autoResume:async input=>this.call('auto-resume',input,rel+'/auto-resume.input.private.json')});
    this.save(rel+'/recovery.private.json',{decision:result.decision,terminal:result.terminal,at:new Date(this.clock()).toISOString()});
    if(result.terminal){this.save('bridge-active.private.json',{...active,phase:'finished',recoveryDecision:result.decision});return;}
    if(result.decision==='resume-same-event') {this.recoveringSameEventId=active.id;this.pending.add(active.id);return;}
    this.status('reconciliation-required',{eventId:active.id,decision:result.decision});
  }
  async recoverFailedEvents(){
    if(this.failedRecoveryRunning||this.running||this.pending.size||!this.verifyCaseExecutor)return;
    clearTimeout(this.failedRecoveryTimer);this.failedRecoveryTimer=null;
    this.failedRecoveryRunning=true;
    let retryNeeded=false,more=false;
    try{
      const page=failedEventCandidatePage(this.folder,{offset:this.failedRecoveryOffset});more=page.more;
      this.failedRecoveryOffset=page.nextOffset;
      for(const active of page.candidates){
        if(this.running||this.pending.size||this.stopped){this.failedRecoveryOffset=0;retryNeeded=true;more=false;break;}
        const rel='event-runs/'+active.id;
        const inspected=await this.call('event-inspect',{id:active.taskId,eventId:active.id});
        if(inspected.autoResumeEligible!==true){
          if(inspected.event?.id!==active.id||inspected.event?.taskId!==active.taskId||inspected.task?.id!==active.taskId)
            throw Error('原案件事件識別未確認，暫不變更重查紀錄');
          const terminal=inspected.event?.state==='failed'||inspected.event?.state==='done'&&inspected.event?.kind==='execute';
          const current=terminal&&inspected.event.sourceVersion===active.sourceVersion&&inspected.task.sourceVersion===active.sourceVersion&&inspected.task.stage==='blocked';
          if(!current)this.save(rel+'/auto-resume.response.private.json',{skipped:true,reason:'confirmed-case-changed'});
          else {
            const capability='render-deploy-commit-v1';
            if(inspected.event.state==='done'&&typeof this.verifyExactRenderPublish==='function'&&await this.verifyExactRenderPublish(active,inspected)){
              const fresh=await this.call('event-inspect',{id:active.taskId,eventId:active.id,capability});
              if(fresh.capabilityResumeEligible===true&&fresh.event?.id===active.id&&fresh.event?.taskId===active.taskId&&fresh.event?.sourceVersion===active.sourceVersion&&fresh.task?.id===active.taskId&&fresh.task?.sourceVersion===active.sourceVersion&&Number.isSafeInteger(fresh.task?.version)&&await this.verifyCaseExecutor(active,fresh)){
                const result=await this.call('auto-resume',{id:active.taskId,version:fresh.task.version,eventId:active.id,operationId:'capability-resume-event-'+active.id,capability},rel+'/auto-resume.input.private.json');
                this.save(rel+'/auto-resume.response.private.json',result);
                continue;
              }
            }
            retryNeeded=true;this.save(rel+'/auto-resume.decision.private.json',{decision:'waiting-for-eligibility',retryScheduled:true,at:new Date(this.clock()).toISOString()});
          }
          continue;
        }
        let executorReady=false;
        const result=await reconcileInterruptedEvent({active,inspectEvent:async()=>inspected,
          evidence:{executorReady:async(a,v)=>{executorReady=await this.verifyCaseExecutor(a,v);return executorReady;},failureBudgetAvailable:(a,v)=>this.failedRetryBudget(a,v,rel)},
          autoResume:async input=>this.call('auto-resume',input,rel+'/auto-resume.input.private.json')});
        const needsRetry=result.decision==='failed-needs-reconciliation'&&!executorReady;
        if(needsRetry)retryNeeded=true;
        this.save(rel+'/auto-resume.decision.private.json',{decision:result.decision,retryScheduled:needsRetry,at:new Date(this.clock()).toISOString()});
        if(result.decision==='auto-resumed')this.save(rel+'/auto-resume.response.private.json',result.result);
      }
    }catch(error){
      // A transient inspection failure is not proof that an event changed.
      // Keep the original record and retry the read-only check with backoff.
      this.failedRecoveryOffset=0;more=false;retryNeeded=true;
      throw error;
    }finally{
      this.failedRecoveryRunning=false;
      this.failedRecoverySweepPending=this.failedRecoverySweepPending||retryNeeded;
      if((more||this.failedRecoverySweepPending)&&!this.stopped){
        const delay=more?1000:Math.min(300000,30000*2**Math.min(this.failedRecoveryAttempts++,4));
        if(!more)this.failedRecoverySweepPending=false;
        this.failedRecoveryTimer=setTimeout(()=>{this.failedRecoveryTimer=null;this.recoverFailedEvents().catch(()=>this.status('reconciliation-required'));},delay);
        this.failedRecoveryTimer.unref?.();
      }else {this.failedRecoveryAttempts=0;this.failedRecoverySweepPending=false;}
    }
  }
  connect() {
    if(this.stopped)return;
    const url=new URL(this.prefix+'events/ws',this.worker.vars.PUBLIC_ORIGIN);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    const ws=this.ws=new this.WebSocket(url,{headers:{Authorization:'Bearer '+this.credentials.key},handshakeTimeout:30000});
    ws.on('open',()=>{this.retry=0;this.status('connected');ws.send('ready');if(this.pending.size)this.drain().catch(()=>this.status('reconciliation-required'));else this.recoverFailedEvents().catch(()=>this.status('reconciliation-required'));this.pingTimer=setInterval(()=>{if(typeof ws.ping!=='function')return;this.pongTimeout=setTimeout(()=>ws.terminate(),15000);ws.ping();},45000);});
    ws.on('pong',()=>clearTimeout(this.pongTimeout));
    ws.on('message',data=>{let v;try{v=JSON.parse(String(data));}catch{return;}
      if(v.type==='work'&&/^[a-f0-9]{64}$/.test(v.id)&&this.running?.id!==v.id&&!fs.existsSync(path.join(this.folder,'event-runs',v.id,'started.private.json'))){this.pending.add(v.id);this.drain().catch(()=>this.status('blocked'));}
      if(v.type==='invalidate'&&this.running?.id===v.id){this.running.invalidated=true;this.running.child?.kill();}
    });
    ws.on('error',()=>this.status('connection-recovering'));
    ws.on('close',()=>{clearInterval(this.pingTimer);clearTimeout(this.pongTimeout);if(this.stopped)return;this.status('disconnected');const delay=Math.min(60000,1000*2**Math.min(this.retry++,6));this.reconnect=setTimeout(()=>this.connect(),delay);});
  }
  async drain() {
    if(this.running||this.stopped)return;
    const id=this.pending.values().next().value;if(!id)return;this.pending.delete(id);
    if(fs.existsSync(path.join(this.folder,'event-runs',id,'started.private.json'))&&this.recoveringSameEventId!==id){if(this.pending.size)queueMicrotask(()=>this.drain().catch(()=>this.status('blocked')));return;}
    if(this.recoveringSameEventId===id)this.recoveringSameEventId=null;
    this.running={id};this.toolWarning=null;this.toolContext=null;
    const rel='event-runs/'+id,operationFile=path.join(this.folder,rel+'/acquire.input.private.json');
    let input;
    if(fs.existsSync(operationFile))input=JSON.parse(fs.readFileSync(operationFile));
    else input={id,operationId:'event-acquire-'+crypto.randomUUID()};
    try {
      const acquired=await this.call('event-acquire',input,rel+'/acquire.input.private.json');
      this.save(rel+'/acquire.response.private.json',acquired);
      if(!acquired.job)return;
      const job=acquired.job,checkInput={id:job.id,lease:job.lease};
      const markerPath=path.join(this.folder,rel+'/started.private.json');
      if(fs.existsSync(markerPath)) {
        await this.call('event-fail',{...checkInput,operationId:'repeat-stopped-'+job.id},rel+'/repeat-stop.input.private.json');return;
      }
      const checkFile=this.save(rel+'/check.input.private.json',checkInput);
      const initialChecked=await this.call('event-check',checkInput);
      const active={id:job.id,lease:job.lease,taskId:job.taskId,sourceVersion:job.sourceVersion,phase:'checking-tools',failureOperation:'event-failure-'+crypto.randomUUID()};
      this.save('bridge-active.private.json',active);
      let preflightRoute;
      if(this.config.toolContextFile){
        try{
          this.toolContext=JSON.parse(fs.readFileSync(this.config.toolContextFile));
          let workRoot;
          if(this.config.visibleChatsFile){
            const routes=JSON.parse(fs.readFileSync(this.config.visibleChatsFile));
            preflightRoute=require('./xiaoye-visible-chats.cjs').selectRoute(routes,initialChecked);
            workRoot=preflightRoute.workRoot;
          }
          let health;
          try{health=await this.checkTools(this.toolContext,{workRoot});}
          catch(first){await new Promise(resolve=>setTimeout(resolve,1000));health=await this.checkTools(this.toolContext,{workRoot});}
          this.save(rel+'/tools-preflight.private.json',health);
        }
        catch(e){
          const labels={git_unavailable:'Git工具無法使用',github_unavailable:'GitHub連線或授權無法使用',desktop_unavailable:'Codex桌面連線無法使用',pr_unavailable:'聊天附加PR工具無法使用',ci_unavailable:'自動測試查核工具無法使用',owner_chat_unavailable:'無法核對原聊天'};
          const label=labels[e.code]||'背景工具檢查未通過';
          this.save(rel+'/tools-preflight.private.json',{ok:false,code:e.code||'unknown',reason:e.message});
          // Analysis in the designated case chat remains read-only. A failed
          // preflight never grants permission to change code or retry work.
          if(job.kind==='analyze'&&this.config.visibleChatsFile){this.toolWarning=label;}
          else {const result=await this.call('event-fail',{...checkInput,operationId:active.failureOperation,reason:label+'，本次未啟動AI執行。',nextStep:'工具恢復後系統會自動核對原案件及已有動作，再依目前設定接續；若需補充情況，會在原案件詢問回報人。'},rel+'/tools-failed.input.private.json');this.save(rel+'/completion.private.json',result);this.save('bridge-active.private.json',{...active,phase:'finished',state:result.state});return;}
        }
      }
      if(this.config.visibleChatsFile){
        const {DesktopMcp,runVisibleEvent}=require('./xiaoye-visible-chats.cjs');
        const routes=JSON.parse(fs.readFileSync(this.config.visibleChatsFile));
        const context=JSON.parse(fs.readFileSync(routes.desktopContextFile));
        const appServerContext={kind:job.kind,operatorDirectory:this.folder,nodeExecutable:this.config.nodeExecutable,codexExecutable:this.config.codexExecutable,runtimeToolsFile:this.config.runtimeToolsFile,toolContextFile:this.config.toolContextFile,eventCheckFile:checkFile};
        const client=await (this.visibleClientFactory?this.visibleClientFactory(context,appServerContext):new DesktopMcp(context,{appServerContext})).connect();
        try {
          const checked=await this.call('event-check',checkInput);
          if(preflightRoute){const fresh=require('./xiaoye-visible-chats.cjs').selectRoute(routes,checked);if(fresh.id!==preflightRoute.id||fresh.workRoot!==preflightRoute.workRoot)throw Error('案件專案在工具檢查後已變更，停止派送');}
          const renderTarget=this.config.exactRenderDeployRecovery,renderProjectKeys=renderTarget?.projectKeys||[renderTarget?.projectKey].filter(Boolean),renderTools=renderTarget&&renderProjectKeys.includes(preflightRoute?.key)?{renderExecutable:renderTarget.cliExecutable,renderWorkspaceId:renderTarget.workspaceId,renderServiceId:renderTarget.serviceId}:{};
          const prompt=fs.readFileSync(this.config.promptFile,'utf8')+(this.toolWarning?'\n\n本次背景工具檢查結果：'+this.toolWarning+'。請在查核結果中說明，不可假稱工具正常。':'')+'\n\n本次由本人指定的Codex專用聊天接續。請在這個聊天顯示實際查核、修改、驗證及受阻進度。只處理下列原事件；先用原API重核，不查queue，不傳送其他聊天。analyze僅准寫operatorDirectory私人證據，不准改程式或業務資料。只有原API確認目前方案具有有效處理授權，且claim取得有效lease的execute才可修改；授權可依本人設定自動產生，所有副作用前再次event-check及check，失效立即停止。若確定受阻於無法指定受測 commit 發布 Render，請在本事件資料夾 fail.input.private.json 的 blockerInfo 加入 capability: "render-deploy-commit-v1"；不得用讀取能力取代精準發布。使用已設定的 Render CLI 前重新確認登入、工作區、服務與指定版本能力。不要在本聊天等待新事件，提出方案、釐清、完成或受阻後立即結束。\n可信啟動資料：\n'+JSON.stringify({eventKind:job.kind,eventCheckInputFile:checkFile,operatorDirectory:this.folder,workRoot:this.config.workRoot,...this.toolContext?{tools:{gitExecutable:this.toolContext.gitExecutable,ghExecutable:this.toolContext.ghExecutable,...renderTools}}:{}});
          active.phase='visible-chat';this.save('bridge-active.private.json',active);this.status('processing-visible-chat');
          const eventCheck=async()=>{if(this.running?.invalidated)throw Error('原事件已失效');return this.call('event-check',checkInput);};
          const saveEvent=(file,v)=>this.save(rel+'/'+file,v);
          if(routes.caseChatsDirectory){
            const {runCaseEvent}=require('./xiaoye-case-events.cjs');
            const caseUrl=new URL('/xiaoye',this.worker.vars.PUBLIC_ORIGIN);caseUrl.searchParams.set('issue',checked.task.id);
            await runCaseEvent({client,config:routes,checked,prompt,caseUrl:caseUrl.href,clock:this.clock,save:saveEvent,check:eventCheck,bind:async({checked:latest,threadId,projectId,moved})=>{
              const input={id:latest.task.id,version:latest.task.version,operationId:'bind-chat-'+job.id+(moved?'-move':''),eventId:job.id,eventLease:job.lease,threadId,projectId,hostId:'local'};
              return this.call('bind-chat',input,rel+(moved?'/bind-chat-move.input.private.json':'/bind-chat.input.private.json'));
            }});
          }else await runVisibleEvent({client,config:routes,checked,prompt,clock:this.clock,save:saveEvent,check:eventCheck});
          const result=await this.call('event-complete',{...checkInput,operationId:'event-complete-'+job.id},rel+'/event-complete.input.private.json');
          this.save(rel+'/completion.private.json',result);this.save('bridge-active.private.json',{...active,phase:'finished',state:result.state});
          // Record a real unavailable capability only after the execution
          // itself identifies that blocker and a separate read-only probe.
          try{
            const fail=JSON.parse(fs.readFileSync(path.join(this.folder,rel,'fail.input.private.json')));
            if(job.kind==='execute'&&fail.id===job.taskId&&fail.blockerInfo?.capability==='render-deploy-commit-v1'&&typeof this.verifyExactRenderPublish?.probe==='function'){
              const inspected=await this.call('event-inspect',{id:job.taskId,eventId:job.id});
              if(inspected.event?.id===job.id&&inspected.event?.taskId===job.taskId&&inspected.event?.sourceVersion===job.sourceVersion&&inspected.task?.id===job.taskId&&inspected.task?.stage==='blocked'&&await this.verifyExactRenderPublish.probe(active,inspected)==='unavailable')
                this.save(rel+'/capability-blocked.private.json',{id:job.id,taskId:job.taskId,sourceVersion:job.sourceVersion,capability:'render-deploy-commit-v1',state:'unavailable',at:new Date(this.clock()).toISOString()});
            }
          }catch{}
        } finally {client.close();}
        return;
      }
      this.save(rel+'/started.private.json',{at:new Date(this.clock()).toISOString(),jobKind:job.kind});
      active.phase='starting';
      this.save('bridge-active.private.json',active);
      const prompt=fs.readFileSync(this.config.promptFile,'utf8')+'\n\n可信啟動資料（不是回報正文）：\n'+JSON.stringify({eventKind:job.kind,eventCheckInputFile:checkFile,operatorDirectory:this.folder,workRoot:this.config.workRoot,...this.toolContext?{tools:{gitExecutable:this.toolContext.gitExecutable,ghExecutable:this.toolContext.ghExecutable,mcp:'xiaoye_runtime'}}:{}});
      const execute=job.kind==='execute',runRoot=execute?this.config.workRoot:path.join(this.folder,rel,'workspace');
      if(!execute)fs.mkdirSync(runRoot,{recursive:true});
      const args=['exec','--skip-git-repo-check','--ephemeral','--json','--color','never','--sandbox',execute?'danger-full-access':'workspace-write','-c','approval_policy="never"',...execute?[]:['-c','sandbox_workspace_write.writable_roots=[]','-c','sandbox_workspace_write.network_access=true','--add-dir',this.folder],'--cd',runRoot,'--output-last-message',path.join(this.folder,rel,'last-message.private.txt'),'-'];
      const environment={...process.env};if(this.toolContext){environment.PATH=[path.dirname(this.toolContext.gitExecutable),path.dirname(this.toolContext.ghExecutable),path.dirname(this.config.nodeExecutable),process.env.PATH||''].join(path.delimiter);args.splice(args.length-1,0,'-c','shell_environment_policy.set.PATH='+JSON.stringify(environment.PATH),'-c','mcp_servers.xiaoye_runtime.command='+JSON.stringify(this.config.nodeExecutable),'-c','mcp_servers.xiaoye_runtime.args='+JSON.stringify([this.config.runtimeToolsFile,this.config.toolContextFile,checkFile]),'-c','mcp_servers.xiaoye_runtime.enabled=true','-c','mcp_servers.xiaoye_runtime.default_tools_approval_mode="approve"');}
      const log=fs.openSync(path.join(this.folder,rel,'codex-output.private.jsonl'),'a'),errors=fs.openSync(path.join(this.folder,rel,'codex-errors.private.log'),'a');
      const child=this.running.child=this.launch(args,{cwd:this.config.workRoot,windowsHide:true,env:environment,stdio:['pipe',log,errors]});
      fs.closeSync(log);fs.closeSync(errors);this.childrenStarted++;
      this.save('bridge-active.private.json',{...active,phase:'running',childPid:child.pid});this.status('processing');
      const timeout=setTimeout(()=>{if(this.running)this.running.invalidated=true;child.kill();},27*60000);
      let exitCode;
      try{exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);child.stdin.end(prompt);});}
      finally{clearTimeout(timeout);}
      const action=exitCode===0&&!this.running.invalidated?'event-complete':'event-fail';
      const result=await this.call(action,{...checkInput,operationId:action==='event-fail'?active.failureOperation:'event-complete-'+job.id},rel+'/'+action+'.input.private.json');
      this.save(rel+'/completion.private.json',result);
      this.save('bridge-active.private.json',{...active,phase:'finished',state:result.state});
    } catch(e) {
      const rejected=[401,403,409].includes(e.status),confirmation=e.code==='confirmation_required',reason=rejected?'原服務未通過本次執行資格檢查，已停止。'+(e.reason||'原登入、核准或案件版本需要重新確認。'):confirmation?'案件聊天搬到所屬專案時，需要先確認資料夾存取權限。':'Codex專用聊天接續受阻，本次不改用隱藏程序重做。',nextStep=rejected?'請重新確認本人登入與原案件目前方案，再沿原卡接續；已完成程式與測試保留，不重播舊事件。':confirmation?'請在 Codex 側欄將原案件聊天移到所屬專案並完成確認，再沿原案件重新查核；原聊天和案件紀錄保留。':'確認Codex桌面與指定聊天可用後，沿原案件重新查核並提案；不要重送結果不明的事件。';
      this.save(rel+'/bridge-error.private.json',{at:new Date(this.clock()).toISOString(),status:e.status||null,action:e.action||null,reason:rejected?reason:null,message:'Event stopped; original state and evidence retained.'});
      const activePath=path.join(this.folder,'bridge-active.private.json');
      if(fs.existsSync(activePath)){const active=JSON.parse(fs.readFileSync(activePath));if(active.id===id&&active.phase!=='finished'){try{await this.call('event-fail',{id,lease:active.lease,operationId:active.failureOperation,...this.config.visibleChatsFile?{reason,nextStep}:{}},rel+'/failure.input.private.json');this.save('bridge-active.private.json',{...active,phase:'finished'});}catch{}}}
    } finally {
      this.running=null;this.status(this.ws?.readyState===1?'connected':'disconnected');
      if(this.ws?.readyState===1)this.ws.send('ready');
      if(this.pending.size)queueMicrotask(()=>this.drain().catch(()=>this.status('blocked')));
      else if(this.ws?.readyState===1)this.recoverFailedEvents().catch(()=>this.status('reconciliation-required'));
    }
  }
  stop() {this.stopped=true;clearTimeout(this.reconnect);clearTimeout(this.failedRecoveryTimer);clearInterval(this.pingTimer);clearTimeout(this.pongTimeout);this.ws?.close();this.running?.child?.kill();this.status('stopped');}
}
module.exports={EventBridge};
if(require.main===module){
 const config=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]))),lock=path.join(config.operatorDirectory,'bridge.lock.private.json');
 if(fs.existsSync(lock)){const previous=JSON.parse(fs.readFileSync(lock));try{process.kill(previous.pid,0);process.exit(0);}catch{fs.unlinkSync(lock);}}
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
 const {createCaseExecutorVerifier}=require('./xiaoye-app-server-client.cjs');
 const {createExactRenderPublishVerifier}=require('./xiaoye-render-publish-recovery.cjs');
 const bridge=new EventBridge(config,{verifyCaseExecutor:createCaseExecutorVerifier(config),verifyExactRenderPublish:createExactRenderPublishVerifier(config)});
 process.on('exit',()=>{try{if(JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}catch{}});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{bridge.stop();process.exit(0);});
 bridge.recover().then(()=>bridge.connect()).catch(()=>{bridge.status('blocked');process.exitCode=1;});
}

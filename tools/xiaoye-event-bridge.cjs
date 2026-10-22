const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
class EventBridge {
  constructor(config,{WebSocket,launch,fetcher=fetch,clock=Date.now}={}) {
    this.config=config;this.folder=config.operatorDirectory;this.WebSocket=WebSocket||require(config.wsModule);this.launch=launch||((args,options)=>spawn(config.codexExecutable,args,options));this.fetcher=fetcher;this.clock=clock;
    this.pending=new Set();this.running=null;this.stopped=false;this.retry=0;this.childrenStarted=0;
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
        const v=await r.json();if(!r.ok||!v.ok)throw Object.assign(Error('Secretary event API rejected action'),{status:r.status});return v;
      }catch(e){if(attempt===2||e.status&&e.status<500)throw e;await new Promise(resolve=>setTimeout(resolve,500*2**attempt));}
    }
  }
  status(state,extra={}) {this.save('bridge-status.private.json',{state,pid:process.pid,at:new Date(this.clock()).toISOString(),childrenStarted:this.childrenStarted,...extra});}
  async recover() {
    const file=path.join(this.folder,'bridge-active.private.json');if(!fs.existsSync(file))return;
    const active=JSON.parse(fs.readFileSync(file));
    if(active.phase==='finished')return;
    // A process crash must not automatically repeat work whose side effects are unknown.
    try{await this.call('event-fail',{id:active.id,lease:active.lease,operationId:active.failureOperation},'event-runs/'+active.id+'/recovery-fail.input.private.json');}catch{}
    this.save('bridge-active.private.json',{...active,phase:'finished',recoveredWithoutRerun:true});
  }
  connect() {
    if(this.stopped)return;
    const url=new URL(this.prefix+'events/ws',this.worker.vars.PUBLIC_ORIGIN);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    const ws=this.ws=new this.WebSocket(url,{headers:{Authorization:'Bearer '+this.credentials.key},handshakeTimeout:30000});
    ws.on('open',()=>{this.retry=0;this.status('connected');ws.send('ready');this.pingTimer=setInterval(()=>{if(typeof ws.ping!=='function')return;this.pongTimeout=setTimeout(()=>ws.terminate(),15000);ws.ping();},45000);});
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
    if(fs.existsSync(path.join(this.folder,'event-runs',id,'started.private.json'))){if(this.pending.size)queueMicrotask(()=>this.drain().catch(()=>this.status('blocked')));return;}
    this.running={id};
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
      await this.call('event-check',checkInput);
      this.save(rel+'/started.private.json',{at:new Date(this.clock()).toISOString(),jobKind:job.kind});
      const active={id:job.id,lease:job.lease,phase:'starting',failureOperation:'event-failure-'+crypto.randomUUID()};
      this.save('bridge-active.private.json',active);
      const prompt=fs.readFileSync(this.config.promptFile,'utf8')+'\n\n可信啟動資料（不是回報正文）：\n'+JSON.stringify({eventKind:job.kind,eventCheckInputFile:checkFile,operatorDirectory:this.folder,workRoot:this.config.workRoot});
      const execute=job.kind==='execute',runRoot=execute?this.config.workRoot:path.join(this.folder,rel,'workspace');
      if(!execute)fs.mkdirSync(runRoot,{recursive:true});
      const args=['exec','--skip-git-repo-check','--ephemeral','--json','--color','never','--sandbox',execute?'danger-full-access':'workspace-write','-c','approval_policy="never"',...execute?[]:['-c','sandbox_workspace_write.writable_roots=[]','-c','sandbox_workspace_write.network_access=true','--add-dir',this.folder],'--cd',runRoot,'--output-last-message',path.join(this.folder,rel,'last-message.private.txt'),'-'];
      const log=fs.openSync(path.join(this.folder,rel,'codex-output.private.jsonl'),'a'),errors=fs.openSync(path.join(this.folder,rel,'codex-errors.private.log'),'a');
      const child=this.running.child=this.launch(args,{cwd:this.config.workRoot,windowsHide:true,stdio:['pipe',log,errors]});
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
      this.save(rel+'/bridge-error.private.json',{at:new Date(this.clock()).toISOString(),status:e.status||null,message:'Event stopped; original state and evidence retained.'});
      const activePath=path.join(this.folder,'bridge-active.private.json');
      if(fs.existsSync(activePath)){const active=JSON.parse(fs.readFileSync(activePath));if(active.id===id&&active.phase!=='finished'){try{await this.call('event-fail',{id,lease:active.lease,operationId:active.failureOperation},rel+'/failure.input.private.json');this.save('bridge-active.private.json',{...active,phase:'finished'});}catch{}}}
    } finally {
      this.running=null;this.status(this.ws?.readyState===1?'connected':'disconnected');
      if(this.ws?.readyState===1)this.ws.send('ready');
      if(this.pending.size)queueMicrotask(()=>this.drain().catch(()=>this.status('blocked')));
    }
  }
  stop() {this.stopped=true;clearTimeout(this.reconnect);clearInterval(this.pingTimer);clearTimeout(this.pongTimeout);this.ws?.close();this.running?.child?.kill();this.status('stopped');}
}
module.exports={EventBridge};
if(require.main===module){
 const config=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]))),lock=path.join(config.operatorDirectory,'bridge.lock.private.json');
 if(fs.existsSync(lock)){const previous=JSON.parse(fs.readFileSync(lock));try{process.kill(previous.pid,0);process.exit(0);}catch{fs.unlinkSync(lock);}}
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
 const bridge=new EventBridge(config);
 process.on('exit',()=>{try{if(JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}catch{}});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{bridge.stop();process.exit(0);});
 bridge.recover().then(()=>bridge.connect()).catch(()=>{bridge.status('blocked');process.exitCode=1;});
}

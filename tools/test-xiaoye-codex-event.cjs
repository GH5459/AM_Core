// Explicit local acceptance only. A real Codex process handles entirely synthetic data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{EventBridge}=require('./xiaoye-event-bridge.cjs');
const dir=path.resolve(process.env.DAILYLOG_XIAOYE_PACKAGE),operator=path.join(dir,'codex-synthetic-'+Date.now()),work=path.join(operator,'workspace');
process.env.DAILYLOG_XIAOYE_FIXTURE=path.join(dir,'event-fixture.cjs');
const {setup}=require('./test-xiaoye-worker.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{let a,bridge;try{
 a=await setup();fs.mkdirSync(work+'/docs',{recursive:true});
 const note='這是完全隔離的合成驗收，不存在真人業務或正式憑證。只使用啟動資料給的原API，完成一個簡短help提案即結束，不改程式或其他資料。';
 for(const f of ['AGENTS.md','docs/HANDOFF.md','docs/XIAOYE_AI_SECRETARY_PILOT_GUIDE.md'])fs.writeFileSync(path.join(work,f),note);
 fs.writeFileSync(operator+'/runner.private.json',JSON.stringify({key:'fixture-xiaoye-runner-key-000000000001'}));
 const origin=String(await a.mf.ready);fs.writeFileSync(operator+'/wrangler.json',JSON.stringify({vars:{PUBLIC_ORIGIN:origin,LEAF_TASK_TENANT:'fixture'}}));
 fs.copyFileSync(path.join(__dirname,'xiaoye-runner.cjs'),operator+'/runner.cjs');
 bridge=new EventBridge({operatorDirectory:operator,workRoot:work,promptFile:path.join(__dirname,'xiaoye-event-prompt.txt'),codexExecutable:process.env.XIAOYE_CODEX_EXECUTABLE,wsModule:path.join(process.env.DAILYLOG_ROOT,'node_modules/ws')});
 bridge.connect();const created=await a.ok(await a.intake({text:'這是隔離驗收：請確認文字回報會保存為同一張卡，整理一個簡短任務名稱與help查核提案即可，不需要改程式或正式發布。'}));
 const deadline=Date.now()+240000;
 for(;;){const t=await a.get(created.taskId);if(!bridge.running&&t.secretary.stage==='awaiting_approval'){assert.equal(t.secretary.category,'help');assert.equal(t.secretary.proposal.deploy,false);assert(t.title.length<=100);break;}if(Date.now()>deadline)throw Error('Synthetic Codex event timed out; inspect private logs');await wait(500);}
 const status=await a.ok(await a.machine('runner/event-status',{},true));assert.equal(status.states.done,1);assert.equal(status.alarmScheduled,false);assert.equal(bridge.childrenStarted,1);
 const result={passed:true,realCodexProcess:true,syntheticOnly:true,eventsProcessed:1,proposalSaved:true,ownerApprovalStillRequired:true,deployed:false,realLineOrBusinessWrites:false,at:new Date().toISOString()};fs.writeFileSync(dir+'/codex-synthetic-results.private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{bridge?.stop();await a?.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});

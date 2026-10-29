const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {appToolsDirectory,codexExecutable}=require('./xiaoye-runtime-paths.cjs');
const {createCaseExecutorVerifier}=require('./xiaoye-app-server-client.cjs');

test('a removed bundled server resolves to the latest installed Codex app tools',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-tools-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const parent=path.join(root,'codex-app-tools'),old=path.join(parent,'0.1.6');fs.mkdirSync(old,{recursive:true});
 for(const version of ['26.1016.1','26.1023.51421']){
  const folder=path.join(parent,version);fs.mkdirSync(path.join(folder,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(folder,'server.mjs'),'');fs.writeFileSync(path.join(folder,'scripts','launch_codex_app_tools_mcp.cmd'),'');
 }
 assert.equal(appToolsDirectory(old),path.join(parent,'26.1023.51421'));
 assert.equal(appToolsDirectory(path.join(parent,'26.1016.1')),path.join(parent,'26.1016.1'));
});

test('a removed Codex executable resolves only inside the installed Codex directory',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-codex-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const installed=path.join(root,'OpenAI','Codex','bin','current','codex.exe');fs.mkdirSync(path.dirname(installed),{recursive:true});fs.writeFileSync(installed,'');
 const outside=path.join(root,'other','codex.exe');fs.mkdirSync(path.dirname(outside));fs.writeFileSync(outside,'');
 assert.equal(codexExecutable(path.join(root,'gone.exe'),{localAppData:root,locate:()=>({stdout:outside+'\n'+installed+'\n'})}),installed);
 assert.throws(()=>codexExecutable(path.join(root,'gone.exe'),{localAppData:root,locate:()=>({stdout:outside+'\n'})}),/unavailable/);
});

test('failed-case recovery checks the current Codex executable before dispatch',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-recovery-path-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id='a'.repeat(64),lease='fixture-lease',taskId='work-00000000-0000-0000-0000-000000000001';
 const run=path.join(root,'event-runs',id);fs.mkdirSync(run,{recursive:true});
 fs.writeFileSync(path.join(run,'check.input.private.json'),JSON.stringify({id,lease}));
 fs.writeFileSync(path.join(root,'wrangler.json'),JSON.stringify({vars:{PUBLIC_ORIGIN:'https://example.test'}}));
 const routes=path.join(root,'routes.json'),context=path.join(root,'context.json');
 fs.writeFileSync(routes,JSON.stringify({routes:[{key:'am',serviceProjectId:'project-am',workRoot:'D:/fixture/am'}]}));
 fs.writeFileSync(context,'{}');
 const config={operatorDirectory:root,visibleChatsFile:routes,toolContextFile:context,codexExecutable:'C:/old/codex.exe',nodeExecutable:'node',runtimeToolsFile:path.join(root,'runtime.cjs')};
 let resolvedFrom,launched;const messages=[];
 class Client{constructor(options){launched=options.executable;}async connect(){throw Error('probe reached');}}
 const verify=createCaseExecutorVerifier(config,{Client,resolveExecutable:old=>{resolvedFrom=old;return 'C:/current/codex.exe';},log:message=>messages.push(message)});
 const ready=await verify({id,lease,taskId,sourceVersion:1},{task:{primaryParentId:'project-am'},projects:[{id:'project-am',key:'am'}],event:{id,taskId,sourceVersion:1}});
 assert.equal(ready,false);assert.equal(resolvedFrom,config.codexExecutable);
 assert.equal(launched,'C:/current/codex.exe');assert.match(messages[0],/probe reached/);
});

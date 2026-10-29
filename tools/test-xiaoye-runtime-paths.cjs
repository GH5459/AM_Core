const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {appToolsDirectory,codexExecutable}=require('./xiaoye-runtime-paths.cjs');

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

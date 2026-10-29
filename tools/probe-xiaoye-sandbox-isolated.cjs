'use strict';
// Manual isolated Windows probe. No production files or credentials are read.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
async function run(){
 if(process.platform!=='win32')throw Error('This probe targets native Windows only');
 const parent=fs.realpathSync(os.tmpdir()),base=fs.mkdtempSync(path.join(parent,'xiaoye-sandbox-probe-')),workspace=path.join(base,'workspace'),outside=path.join(base,'outside');
 fs.mkdirSync(workspace);fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'fictional.txt'),'fictional');process.env.XIAOYE_SYNTHETIC_ENV_CANARY='fictional';
 const server=http.createServer((_req,res)=>res.end('fixture'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{
  const config=(root,deny)=>['shell_environment_policy.inherit="core"','default_permissions="xiaoye_probe"','permissions.xiaoye_probe={filesystem={":root"="'+root+'", ":minimal"="read", '+(deny?JSON.stringify(outside)+'="deny", ':'')+'":workspace_roots"={"."="write"}},network={enabled=false}}'];
  const script="const fs=require('node:fs');console.log('synthetic-env='+Object.hasOwn(process.env,'XIAOYE_SYNTHETIC_ENV_CANARY'));try{fs.readFileSync(process.argv[1]);console.log('outside-read=allowed')}catch(e){console.log('outside-read=denied:'+e.code)};Promise.all([fetch('https://example.com',{signal:AbortSignal.timeout(4000)}).then(()=>console.log('public-network=allowed')).catch(()=>console.log('public-network=denied')),fetch(process.argv[2],{signal:AbortSignal.timeout(4000)}).then(()=>console.log('loopback=allowed')).catch(()=>console.log('loopback=denied'))]);";
  const results=[];
  for(const [root,deny] of [['deny',false],['read',true]]){
   const c=new CodexAppServerClient({configOverrides:config(root,deny)});try{await c.connect();const p=await c.request('permissionProfile/list');const r=await c.request('command/exec',{command:[process.execPath,'-e',script,path.join(outside,'fictional.txt'),'http://127.0.0.1:'+port],cwd:workspace,permissionProfile:'xiaoye_probe',timeoutMs:12000},20000);results.push({root,profileAllowed:p.data?.find(x=>x.id==='xiaoye_probe')?.allowed,exitCode:r.exitCode,observations:r.stdout});}catch(e){results.push({root,error:String(e.message).slice(0,300)});}finally{c.close();}
  }
  console.log(JSON.stringify({results}));
 }finally{delete process.env.XIAOYE_SYNTHETIC_ENV_CANARY;server.close();const resolved=fs.realpathSync(base);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('xiaoye-sandbox-probe-'))throw Error('Refusing to remove unexpected temporary path');fs.rmSync(resolved,{recursive:true,force:true});}
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1});

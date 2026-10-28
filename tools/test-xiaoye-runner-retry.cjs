const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
async function run(action){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-network-'));let count=0;
 const server=http.createServer((req,res)=>{count++;if(count===1){req.socket.destroy();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{fs.writeFileSync(dir+'/wrangler.json',JSON.stringify({vars:{PUBLIC_ORIGIN:'http://127.0.0.1:'+server.address().port,LEAF_TASK_TENANT:'fixture'}}));fs.writeFileSync(dir+'/runner.private.json',JSON.stringify({key:'fixture'}));fs.writeFileSync(dir+'/input.json',JSON.stringify({id:'fixture',lease:'fixture',operationId:'fixture-operation',version:1}));
  const p=spawn(process.execPath,[path.join(__dirname,'xiaoye-runner.cjs'),dir,action,dir+'/input.json'],{stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);const code=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',resolve)});return {code,count,out};
 }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('a temporary connection failure retries the same read-only event check',async()=>{const r=await run('event-check');assert.equal(r.code,0);assert.equal(r.count,2);assert(JSON.parse(r.out).ok);});
test('a write with an unknown outcome is never retried automatically',async()=>{const r=await run('propose');assert.notEqual(r.code,0);assert.equal(r.count,1);});

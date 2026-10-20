import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {build}=createRequire(import.meta.url)('./build-personal-completion-worker.cjs');
test('personal authority scope keeps original identity RPC bindings intact for every other route',async()=>{
 const root=fs.realpathSync(os.tmpdir()),out=fs.mkdtempSync(path.join(root,'personal-worker-boundary-'));
 try{
  fs.mkdirSync(out+'/baseline');fs.mkdirSync(out+'/candidate');
  const baseline='const existing_worker=baseWorker;\nconst completionReportAuthority=validateAuthority;\nexport {\n  existing_worker as default\n};\n';
  fs.writeFileSync(out+'/baseline/worker.mjs',baseline);fs.writeFileSync(out+'/candidate/worker.mjs',baseline);
  fs.writeFileSync(out+'/before.private.json',JSON.stringify({version:'synthetic',modules:[{name:'worker.mjs',sha256:crypto.createHash('sha256').update(baseline).digest('hex')}]}));
  build(out);const code=fs.readFileSync(out+'/candidate/worker.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/export \{[\s\S]*?\n\};/,'');
  const env={SHARED_ACCESS:{snapshot(){},identityLink:()=> 'original RPC'}},calls=[];let scopes=0,scheduled=false;
  const base={async fetch(req,e){assert.equal(e,env);calls.push(new URL(req.url).pathname);assert.equal(e.SHARED_ACCESS.identityLink(),'original RPC');return new Response('original');},scheduled(){scheduled=true;}};
  const factory=new Function('baseWorker','validateAuthority','withAuthorityInvocation','readAuthority','personalAuthority','personalCompletionRoute','personalCompletionResponse','beginAuthorityStage',code+'\nreturn personal_completion_worker;');
  const worker=factory(base,()=>{},async(e,fn)=>{scopes++;return fn({...e,SHARED_ACCESS:{snapshot(){}}});},async()=>({account:'synthetic'}),async()=>({account:'synthetic'}),async()=>new Response('personal'),async(req,r)=>r,()=>{});
  for(const route of ['/api/auth/line-entry-info','/tasks.js','/api/tasks/work-'+ 'a'.repeat(36)])assert.equal(await(await worker.fetch(new Request('https://example.test'+route),env,{})).text(),'original');
  assert.equal(scopes,0);assert.equal(calls.length,3);
  assert.equal(await(await worker.fetch(new Request('https://example.test/api/tasks/personal-completion-directory'),env,{})).text(),'personal');assert.equal(scopes,1);assert.equal(calls.length,3);
  await worker.scheduled();assert.equal(scheduled,true);
 }finally{const resolved=fs.realpathSync(out);assert.equal(path.dirname(resolved),root);assert(path.basename(resolved).startsWith('personal-worker-boundary-'));fs.rmSync(resolved,{recursive:true});}
});

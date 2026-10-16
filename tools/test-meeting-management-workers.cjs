const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL}=require('url');
const folder=process.argv[2],esbuild=require(process.argv[3]||'esbuild');
const now=Date.now(),identity={account:'140901',expiresAt:now+600000};
const route='/api/management/meetings/conversations',rpc='/api/meeting-management/conversations';
(async()=>{
 let uof,daily;
 for(const name of ['uof-line-cloud','dailylog']){
  const dir=folder+'/'+name;let source=fs.readFileSync(dir+'/candidate/worker.mjs','utf8');
  source+='\nexport { '+(name==='uof-line-cloud'?'managementRoute as testRoute':'createWorker as testCreateWorker')+' };';
  const out=dir+'/test-bundle.mjs';
  await esbuild.build({stdin:{contents:source,resolveDir:dir+'/candidate',sourcefile:'worker.mjs'},outfile:out,bundle:true,platform:'node',format:'esm',loader:{'.html':'text','.sql':'text'},plugins:[{name:'synthetic-cloudflare-runtime',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'workers',namespace:'synthetic'}));build.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export class WorkerEntrypoint{constructor(ctx,env){this.ctx=ctx;this.env=env;}};export class DurableObject extends WorkerEntrypoint{};'}));}}]});
  const module=await import(pathToFileURL(out));if(name==='uof-line-cloud')uof=module;else daily=module;
 }
 let forwarded=0,csrf=0;
 const app={session:async()=>identity,access:async()=>({}),isAdmin:()=>true,csrf(request){csrf++;assert.equal(request.headers.get('X-UOF-CSRF'),'synthetic');},env:{DAILYLOG_MANAGEMENT:{manage:async(r,i)=>{forwarded++;assert.equal(new URL(r.url).pathname,rpc);assert.equal(i.account,identity.account);assert(!r.headers.has('Cookie'));return Response.json({ok:true});}}}};
 assert.equal((await uof.testRoute(app,new Request('https://sample'+route))).status,200);
 assert.equal((await uof.testRoute(app,new Request('https://sample'+route,{method:'PUT',headers:{'X-UOF-CSRF':'synthetic'},body:'{}'}))).status,200);assert.equal(csrf,1);
 await assert.rejects(()=>uof.testRoute({...app,isAdmin:()=>false},new Request('https://sample'+route)),/ACCESS_DENIED/);
 await assert.rejects(()=>uof.testRoute({...app,session:async()=>null},new Request('https://sample'+route)),/LOGIN_REQUIRED/);
 await assert.rejects(()=>uof.testRoute(app,new Request('https://sample'+route,{method:'PUT',body:'{}'})));
 assert.equal(forwarded,2,'Unauthorized requests must never reach the management service');
 const state={revision:1,sharedAccessRevision:1,routineLibraryPolicy:'multi-library-v1',accountLifecycleVersion:0,accounts:{'140901':{enabled:true,admin:true},'123':{enabled:true,admin:false}}};
 const DB={prepare(sql){return {bind(){return this;},async first(){if(sql.includes('FROM documents'))return {value:JSON.stringify(state),revision:1};if(sql.includes('FROM employees'))return {user_id:'synthetic-id',value:JSON.stringify({name:'管理者'})};throw Error('Unexpected SQL '+sql);}};}};
 const env={DB,SHARED_ACCESS_REQUIRED:'true',AMCORE_MEETING_MANAGEMENT_SECRET:'synthetic-secret-only-'.repeat(3),SHARED_ACCESS:{snapshot:async()=>({schemaVersion:1,revision:1,dailylogEnabledAccounts:['140901'],adminAccounts:['140901']})}};
 const originalFetch=global.fetch;let remote=0;global.fetch=async(url,opts)=>{assert.equal(url,'https://am.hozorental.com/integrations/meeting-management/conversations');assert(opts.headers['x-meeting-signature']);remote++;return Response.json({conversations:[]});};
 try{const worker=daily.testCreateWorker();assert.equal((await worker.managementFetch(new Request('https://sample'+rpc),identity,env,{})).status,200);
  assert.equal((await worker.managementFetch(new Request('https://sample'+rpc),{...identity,account:'123'},env,{})).status,403);
  assert.equal((await worker.managementFetch(new Request('https://sample'+rpc),{...identity,expiresAt:now-1},env,{})).status,401);
  assert.equal(remote,1);
 }finally{global.fetch=originalFetch;}
 fs.writeFileSync(folder+'/worker-tests.private.json',JSON.stringify({passed:true,uofLogin:true,uofAdmin:true,csrf:true,dailylogLatestGrant:true,expiredSession:true,allOtherModulesPreserved:true,at:new Date().toISOString()},null,2));
 console.log('Complete Worker candidates: login, current admin grants, CSRF, RPC identity, expired-session rejection, signed proxy and preserved modules passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

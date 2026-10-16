// Run with a deployment-local Miniflare module path. Uses synthetic data only.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL}=require('url');
const runtime=require(process.argv[2]||'miniflare');
(async()=>{
 const {verifyManagementRequest}=await import(pathToFileURL(path.resolve(__dirname,'../modules/meetings/management-auth.js')));
 const secret='synthetic-workerd-meeting-secret-only'.repeat(2),actor='123',received=[];
 let outcome='ok';
 const worker={name:'meetings-proxy',modules:true,compatibilityDate:'2026-10-06',script:fs.readFileSync(path.resolve(__dirname,'../modules/meetings/management-proxy.mjs'),'utf8')+`\nexport default {fetch(request,env){return meetingManagementProxy(request,env,'${actor}');}};`,
  bindings:{AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETING_MANAGEMENT_ORIGIN:'https://upstream.example.test'},
  outboundService:async request=>{
   assert.equal(request.url,'https://upstream.example.test/integrations/meeting-management/conversations');
   assert(!request.headers.has('Cookie'));
   const body=await request.text(),headers=Object.fromEntries(request.headers);
   assert(verifyManagementRequest(secret,{method:request.method,url:new URL(request.url).pathname,headers},body));received.push({method:request.method,body});
   if(outcome==='redirect')return new Response(null,{status:302,headers:{Location:'https://must-not-follow.example.test'}});
   if(outcome==='html')return new Response('synthetic upstream page',{status:502,headers:{'Content-Type':'text/html'}});
   return Response.json({conversations:[]});
  }};
 const options={workers:[worker]},mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  for(const method of ['GET','PUT']){const r=await mf.dispatchFetch('https://management.example.test/api/meeting-management/conversations',{method,headers:{Cookie:'NEVER_FORWARD'},...(method==='PUT'?{body:'{"enabled":false}'}:{})});assert.equal(r.status,200);assert.deepEqual(await r.json(),{conversations:[]});}
  assert.deepEqual(received,[{method:'GET',body:''},{method:'PUT',body:'{"enabled":false}'}]);
  for(const failed of ['redirect','html']){outcome=failed;const r=await mf.dispatchFetch('https://management.example.test/api/meeting-management/conversations');assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');}
  assert.equal(received.length,4,'Redirects must never forward the signed headers to another destination');
  console.log('Real workerd: signed GET/PUT, response parsing, redirect rejection without following and HTML failure passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

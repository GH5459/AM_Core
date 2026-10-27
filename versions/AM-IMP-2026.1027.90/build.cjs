const fs=require('fs'),assert=require('assert/strict');
exports.patchWorker=function(source){
 const marker='google_renewal_worker as default';assert.equal(source.split(marker).length,2,'Unexpected current export; inspect latest source');
 return "import {meetingProxy,meetingAssets} from './dailylog-meetings.mjs';\n"+source.replace(marker,'meetings_tab_worker as default')+`
const meetings_tab_worker={...google_renewal_worker,async fetch(request,env,ctx){
 const early=await meetingProxy(request,env,ctx,google_renewal_worker);if(early)return early;
 const url=new URL(request.url);if(url.pathname==='/dailylog-meetings-client.js'){
  const check=await google_renewal_worker.fetch(new Request(url.origin+'/api/auth/session',{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx);
  if(!check.ok||!(await check.json()).authenticated)return new Response('請先登入。',{status:401});
  return new Response(${JSON.stringify(fs.readFileSync(__dirname+'/client.js','utf8'))},{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'private, no-store'}});
 }
 return meetingAssets(request,await google_renewal_worker.fetch(request,env,ctx));
}};
`;
};

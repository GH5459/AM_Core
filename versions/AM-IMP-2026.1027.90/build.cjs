const fs=require('fs'),assert=require('assert/strict');
exports.patchWorker=function(source){
 const exports=[...source.matchAll(/\b([A-Za-z_$][\w$]*) as default\b/g)];assert.equal(exports.length,1,'Unexpected current export; inspect latest source');
 assert(!source.includes("from './dailylog-meetings.mjs'"),'Meeting integration already installed');
 const original=exports[0][1],marker=exports[0][0];
 return "import {meetingProxy,meetingAssets} from './dailylog-meetings.mjs';\n"+source.replace(marker,'meetings_tab_worker as default')+`
const meetings_tab_worker={...${original},async fetch(request,env,ctx){
 const early=await meetingProxy(request,env,ctx,${original});if(early)return early;
 const url=new URL(request.url);if(url.pathname==='/dailylog-meetings-client.js'){
  const check=await ${original}.fetch(new Request(url.origin+'/api/auth/session',{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx);
  if(!check.ok||!(await check.json()).authenticated)return new Response('請先登入。',{status:401});
  return new Response(${JSON.stringify(fs.readFileSync(__dirname+'/client.js','utf8'))},{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'private, no-store'}});
 }
 return meetingAssets(request,await ${original}.fetch(request,env,ctx));
}};
`;
};

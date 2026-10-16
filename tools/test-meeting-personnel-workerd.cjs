const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const runtime=require(process.argv[2]||'miniflare');
(async()=>{
 const bot='U'+'b'.repeat(32),user='U'+'a'.repeat(32),key=crypto.createHash('sha256').update(bot+':user:'+user).digest('hex');let writes=0;
 const source=fs.readFileSync(path.resolve(__dirname,'../modules/meetings/management-proxy.mjs'),'utf8')+`
 const binding={account:'123',bindingId:'fixture',userId:'${user}',groupId:'${user}'};
 export default {async fetch(request,env){const app={env:{...env,DAILYLOG_MANAGEMENT:{manage:r=>meetingManagementProxy(r,env,'999')}},sharedAccess:{snapshot:async()=>({effectiveActiveAccounts:['123']})},store:{get:async()=>[binding]},line:{gateway:async()=>({...binding,status:'bound',externalUserId:'123'})},csrf:r=>{if(r.headers.get('X-UOF-CSRF')!=='fixture')throw Error('csrf rejected');}};return meetingManagementRoute(app,request,{account:'999',expiresAt:Date.now()+60000});}};`;
 const worker={name:'personnel-meetings',modules:true,compatibilityDate:'2026-10-06',script:source,bindings:{AMCORE_MEETING_BOT_USER_ID:bot,AMCORE_MEETING_MANAGEMENT_SECRET:'synthetic-personnel-meeting-secret-only'.repeat(2),AMCORE_MEETING_MANAGEMENT_ORIGIN:'https://upstream.example.test'},outboundService:async req=>{
  assert.equal(req.url,'https://upstream.example.test/integrations/meeting-management/conversations');if(req.method==='PUT'){const body=await req.json();assert.equal(body.key,key);assert(!Object.hasOwn(body,'account'));writes++;return Response.json({ok:true,version:2});}
  return Response.json({conversations:[{key,type:'user',name:'同名',enabled:false,version:1},{key:'d'.repeat(64),type:'group',name:'同名'}],tenants:[]});}};
 const options={workers:[worker]},mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{const groups=await(await mf.dispatchFetch('https://sample/api/management/meetings/conversations')).json();assert.deepEqual(groups.conversations.map(r=>r.type),['group']);const people=await(await mf.dispatchFetch('https://sample/api/management/meetings/people')).json();assert.equal(people.conversations[0].account,'123');
  const input={key,account:'123',enabled:true,todoMode:'record_only',tenantKey:'',version:1,operationId:'fixture-operation-123'},options={method:'PUT',headers:{'X-UOF-CSRF':'fixture'},body:JSON.stringify(input)};
  assert.equal((await mf.dispatchFetch('https://sample/api/management/meetings/conversations',options)).status,409);assert.equal(writes,0);
  assert.equal((await mf.dispatchFetch('https://sample/api/management/meetings/people',options)).status,200);assert.equal(writes,1);
  console.log('Real workerd personnel route: same-OA hash and exact account mapping, separated inventory, personal-write scope rejection and verified original setting forwarding passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

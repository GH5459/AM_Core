import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {managementSignature} from '../modules/meetings/management-auth.js';
import {embeddedRequest,dailylogActor} from '../modules/meetings/dailylog-embedded.js';
import {meetingProxy,meetingAssets} from '../versions/AM-IMP-2026.1027.90/dailylog-meetings.mjs';
import {createLoginContinuationHttp} from '../core/login-continuation-http.js';
const secret='synthetic-test-secret-only-'.repeat(3),line='U'+'1'.repeat(32),bot='U'+'b'.repeat(32),account='900001',origin='https://diary.test';
const identity={account,botUserId:bot,lineUserId:line,confirmedAt:'2026-10-27T00:00:00Z',identityId:'test-identity'};
function signed({path='/meetings/review/hub/api',bytes=Buffer.from('{"action":"list"}'),actor=account,person=line,change=false,nonce=crypto.randomUUID(),timestamp=String(Date.now())}={}){
 const u=new URL('https://machine.test'+path);u.searchParams.set('_dailylogLine',person);u.searchParams.set('_dailylogNonce',nonce);
 const req=Readable.from([bytes]);req.method='POST';req.url=u.pathname+u.search;req.headers={'content-type':'application/json','x-meeting-time':timestamp,'x-meeting-actor':actor,'x-meeting-signature':managementSignature(secret,{method:'POST',path:req.url,timestamp,actor,body:(change?Buffer.from('changed'):bytes).toString('base64')})};return {req,u};
}
const accepted=new Set(),pool={async query(sql,[nonce]){if(accepted.has(nonce))return {rows:[]};accepted.add(nonce);return {rows:[{key:nonce}]};}},platform={meetingShareIdentity:async id=>id===line?{account,name:'隔離同仁'}:null};
test('machine host delegates signed meeting hub to the gateway; normal browser still redirects',async()=>{
 const handler=createLoginContinuationHttp({env:{AMCORE_MEETINGS_LIFF_ENDPOINT_URL:'https://public.test/meetings/review'},pool:{},authority:{},lineIdentity:{}});
 const req={method:'GET',headers:{host:'machine.test','x-meeting-signature':'unverified-until-gateway'}},url=new URL('https://machine.test/meetings/review/hub');assert.equal(await handler.handle(req,{},url),false);
 let redirected=false;assert.equal(await handler.handle({...req,headers:{host:'machine.test'}},{writeHead(){redirected=true;},end(){}},url),true);assert(redirected);
});
test('signed binary forwarding keeps original bytes, actor and original access checks; replay denied',async()=>{
 const bytes=Buffer.from([0,255,128,13,10]),{req,u}=signed({bytes});
 const forward=await embeddedRequest(req,u,{secret,platform,origin:'https://public.test',pool});
 assert.equal(forward.request[dailylogActor].id,line);assert.equal(forward.request.headers.origin,'https://public.test');assert.equal(forward.request.url,'/meetings/review/hub/api');const chunks=[];for await(const c of forward.request)chunks.push(c);assert.deepEqual(Buffer.concat(chunks),bytes);
 const replay=signed({bytes,nonce:u.searchParams.get('_dailylogNonce')});await assert.rejects(embeddedRequest(replay.req,replay.u,{secret,platform,origin,pool}),{status:403});
});
test('forged body, wrong account, wrong LINE, expired signature and unrelated routes rejected',async()=>{
 for(const v of [{change:true},{actor:'900002'},{person:'U'+'2'.repeat(32)},{timestamp:String(Date.now()-120000)},{path:'/api/management/users'}]){const {req,u}=signed(v);await assert.rejects(embeddedRequest(req,u,{secret,platform,origin,pool}),{status:403});}
});
function environment({reverse=true,conflict=false}={}){return {AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETING_MANAGEMENT_ORIGIN:'https://machine.test',DB:{prepare(sql){return {bind(key){return {async all(){return {results:[{value:JSON.stringify(identity)},...(conflict?[{value:JSON.stringify({...identity,lineUserId:'U'+'2'.repeat(32)})}]:[])]};},async first(){return reverse?{value:JSON.stringify(identity)}:null;}};}};}}};}
const inner={fetch:async()=>Response.json({authenticated:true,user:{account},csrfToken:'synthetic-csrf'})};
test('worker session, CSRF and two-way identity gate all meeting operations; no credential forwarding',async()=>{
 const env=environment(),events=[];
 const fetchImpl=async(input,options)=>{const url=new URL(input),req=Readable.from(options.body?.length?[Buffer.from(options.body)]:[]);req.url=url.pathname+url.search;req.method=options.method;req.headers=options.headers;const forwarded=await embeddedRequest(req,url,{secret,platform,origin:'https://public.test',pool});assert(forwarded);assert(!options.headers.cookie);assert(!options.headers.authorization);events.push(forwarded);return Response.json({ok:true,url:'https://public.test/meetings/review/work/'+'a'.repeat(64)},{headers:{'X-DailyLog-Meetings-Origin':'https://public.test'}});};
 const request=new Request(origin+'/meetings/review/hub/api',{method:'POST',headers:{Origin:origin,'X-DailyLog-CSRF':'synthetic-csrf',Cookie:'private-cookie',Authorization:'Bearer do-not-forward','Content-Type':'application/json'},body:'{"action":"list"}'});
 const ok=await meetingProxy(request.clone(),env,{},inner,{fetchImpl});assert.equal(ok.status,200);assert((await ok.json()).url.startsWith(origin));assert.equal(events.length,1);
 for(const changed of [{Origin:'https://other.test'},{'X-DailyLog-CSRF':'wrong'}]){const h=new Headers(request.headers);for(const [k,v]of Object.entries(changed))h.set(k,v);assert.equal((await meetingProxy(new Request(request.clone(),{headers:h}),env,{},inner,{fetchImpl})).status,403);}
 assert.equal((await meetingProxy(request.clone(),environment({reverse:false}),{},inner,{fetchImpl})).status,403);
 assert.equal((await meetingProxy(request.clone(),environment({conflict:true}),{},inner,{fetchImpl})).status,403);
 assert.equal((await meetingProxy(request.clone(),env,{}, {fetch:async()=>Response.json({authenticated:false})},{fetchImpl})).status,401);
 assert.equal(events.length,1);
});
test('same-origin frame HTML and scripts retain original API paths; unrelated routes pass through',async()=>{
 const r=await meetingProxy(new Request(origin+'/meetings/review/hub'),environment(),{},inner,{fetchImpl:async()=>new Response('<script src="/login-continuation/browser.js"></script>',{headers:{'Content-Type':'text/html'}})});assert((await r.text()).includes('/meetings/embedded-browser.js'));assert.equal(r.headers.get('X-Frame-Options'),'SAMEORIGIN');
 assert.equal(await meetingProxy(new Request(origin+'/api/tasks'),environment(),{},inner),null);
 const html=await meetingAssets(new Request(origin+'/'),new Response('<body></body>'));assert((await html.text()).includes('/dailylog-meetings-client.js'));
});
test('original recording playback retains byte ranges and streaming metadata',async()=>{
 const r=await meetingProxy(new Request(origin+'/meetings/review/work/'+'a'.repeat(64)+'/audio',{headers:{Range:'bytes=2-4'}}),environment(),{},inner,{fetchImpl:async(url,options)=>{assert.equal(options.headers.Range,'bytes=2-4');return new Response(new Uint8Array([2,3,4]),{status:206,headers:{'Content-Type':'audio/webm','Content-Range':'bytes 2-4/10','Accept-Ranges':'bytes','Content-Length':'3'}});}});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-4/10');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[2,3,4]);
});

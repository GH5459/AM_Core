import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {dailyEntryFetch,taskDeliveryJobs,taskRelations,reviewBootstrap} from '../versions/AM-IMP-2026.1026.03/entry-speed.mjs';
const origin='https://dailylog.chatgpt-673.workers.dev',fallback='https://am.hozorental.com/meetings/review/connect?app=dailylog&openExternalBrowser=1',entry=origin+'/line-entry?'+new URLSearchParams({fallback}),env={PUBLIC_ORIGIN:origin};
test('followup source remains parseable and refuses a changed or already patched baseline',()=>{
 const {transformFollowup}=createRequire(import.meta.url)('../versions/AM-IMP-2026.1026.03/followup-worker.cjs');
 const source=`import {dailyEntryFetch,taskDeliveryJobs} from './entry-speed.mjs';
  function createUnifiedCloudTasks2(env, canUse, now, membersSnapshot, legacyCore, authority2 = {}) {
    async function present(user, task, visible = null) {
      for(const id of []){const n = await read52(id);
        if (n && (taskViewMembers(n).includes(user.account)))return n;}
    }
    async function list(){const result = await Promise.all(visible.map((t) => present(user, t, visible)));return result;}
  }
  __name(createUnifiedCloudTasks2,'fixture');
async function renderer(){
        if (path === "/auth/bootstrap.js" && request.method === "GET") {
          await register(session3.user);
          return send(js("window.DAILYLOG_AUTH = " + safe({user:session3.user,csrfToken:session3.csrf}) + ";"));
        }
        if (path === "/google-config.js")return null;
}`;
 const result=transformFollowup(source);new Function(result.replace(/^import .*$/m,''));assert.match(result,/assertSharingVersions\(db,\[\.\.\.relations.values\(\)\],true\)/);assert.match(result,/window.DAILYLOG_EXPERIENCE/);assert.throws(()=>transformFollowup(result));assert.throws(()=>transformFollowup(source.replace('async function present','async function changed')));
});
test('native entry invokes the original authenticated renderer and preserves the response cookie',async()=>{
 let received;const r=await dailyEntryFetch(new Request(entry,{headers:{Cookie:'dailylog_session='+'a'.repeat(64)}}),env,{}, {fetch:async request=>{received=request;return new Response('<html><head></head><body>original</body>',{headers:{'Content-Type':'text/html','Set-Cookie':'original-cookie','ETag':'old'}});}});
 assert.equal(received.url,origin+'/?openExternalBrowser=1');assert(received.headers.get('Cookie'));assert.equal(r.headers.get('Set-Cookie'),'original-cookie');assert.equal(r.headers.get('ETag'),null);const html=await r.text();assert.match(html,/original/);assert.match(html,/history.replaceState/);assert(!html.includes('localStorage'));
});
test('cross-site Strict cookie absence re-enters its own origin before considering LINE fallback',async()=>{
 let calls=0;const r=await dailyEntryFetch(new Request(entry),env,{}, {fetch:async()=>{calls++;}});assert.equal(calls,0);const html=await r.text(),next=[];vm.runInNewContext(html.match(/<script>(.*?)<\/script>/s)[1],{location:{replace:x=>next.push(x)}});assert.equal(new URL(next[0],origin).origin,origin);assert.equal(new URL(next[0],origin).searchParams.get('native'),'1');
 const anonymous=await dailyEntryFetch(new Request(origin+next[0]),env,{}, {fetch:async()=>new Response(null,{status:303,headers:{Location:'/login'}})});assert.equal(anonymous.status,303);assert.equal(anonymous.headers.get('Location'),fallback);
});
test('invalid fallback, wrong origin and writes never invoke the renderer; permission/server failures stay visible',async()=>{
 let calls=0;const base={fetch:async()=>{calls++;return new Response('denied',{status:403});}};
 for(const bad of ['https://evil.test/meetings/review/connect?app=dailylog','https://am.hozorental.com/meetings/review/connect?app=uof','https://am.hozorental.com/meetings/review/connect?app=dailylog#secret'])assert.equal((await dailyEntryFetch(new Request(origin+'/line-entry?'+new URLSearchParams({fallback:bad})),env,{},base)).status,400);
 assert.equal((await dailyEntryFetch(new Request(entry,{method:'POST'}),env,{},base)).status,405);assert.equal(calls,0);
 assert.equal((await dailyEntryFetch(new Request(entry+'&native=1'),env,{},base)).status,403);
});
test('task delivery status queries one batch, including empty and duplicate recipients',async()=>{
 let queries=0,bound;const db={prepare(sql){queries++;assert.match(sql,/json_each/);return {bind(v){bound=JSON.parse(v);return {all:async()=>({results:[{key:'one:1',value:'{"state":"synced"}'}]})};}};}};
 const rows=await taskDeliveryJobs(db,Array.from({length:150},(_,i)=>({id:i?'task-'+i:'one',requester:{account:'1'},lead:{account:'1'},collaborators:[{account:'2'}]})));assert.equal(queries,1);assert.equal(bound.length,300);assert.equal(rows.get('one:1').state,'synced');await taskDeliveryJobs(db,[]);assert.equal(queries,1);
});
test('a validated renderer can inline its original bootstrap without changing other scripts or storage',async()=>{
 const r=await dailyEntryFetch(new Request(entry+'&native=1'),env,{}, {fetch:async(request,scope)=>{scope.ENTRY_SPEED_CAPTURE_BOOTSTRAP('window.DAILYLOG_AUTH = {"user":{"id":"synthetic"},"csrfToken":"original"};');return new Response('<html><head></head><body><script src="/auth/bootstrap.js"></script><script src="notion-sync-client.js"></script><iframe src="private"></iframe></body>',{headers:{'Content-Type':'text/html'}});}});const html=await r.text();assert.match(html,/csrfToken/);assert(!html.includes('src="/auth/bootstrap.js"'));assert.match(html,/src="notion-sync-client.js"/);assert.match(html,/<iframe src="private"/);assert(!html.includes('localStorage'));
});
test('relation hydration batches repeated parents and preserves missing/hidden references for the original permission filter',async()=>{
 let queries=0,hydrations=0;const db={prepare(){queries++;return {bind(value){assert.deepEqual(JSON.parse(value),['project','missing']);return {all:async()=>({results:[{value:JSON.stringify({id:'project',version:3,sharedWith:[]})}]})};}};}};
 const result=await taskRelations(db,Array.from({length:150},()=>({primaryParentId:'project',dependencyIds:['missing']})),async(_,rows)=>{hydrations++;return rows;});assert.equal(queries,1);assert.equal(hydrations,1);assert.equal(result.get('project').version,3);assert(!result.has('missing'));assert.equal((await taskRelations(db,[],()=>{throw Error();})).size,0);
});
function appFixture(){const session={authenticated:true,allowed:true,cookieAccepted:true,account:'synthetic',csrfToken:'csrf'},calls=[],pending={account:'synthetic',cases:[{taskId:'original'}],categories:[]};let pendingStatus=200;const app={fetch:async request=>{calls.push(request);return new URL(request.url).pathname.endsWith('/session')?Response.json(session,{headers:{'Set-Cookie':'original-cookie'}}):Response.json(pending,{status:pendingStatus});}};return {app,session,pending,calls,setStatus:s=>pendingStatus=s};}
test('UOF bootstrap calls only original read endpoints with original cookies and returns the same session fields',async()=>{
 const {app,calls}=appFixture();const r=await reviewBootstrap(new Request('https://uof.test/api/uof-review/bootstrap',{headers:{Cookie:'original'}}),app),value=await r.json();assert.deepEqual(calls.map(r=>new URL(r.url).pathname),['/api/uof-review/session','/api/uof-review/web-pending']);assert(calls.every(r=>r.method==='GET'&&r.headers.get('Cookie')==='original'));assert.equal(value.pending.account,'synthetic');assert.equal(value.csrfToken,'csrf');assert.equal(r.headers.get('Set-Cookie'),'original-cookie');
});
test('UOF anonymous, revoked, changed account and failed reads cannot become a successful empty list',async()=>{
 const f=appFixture();for(const key of ['authenticated','allowed','cookieAccepted']){f.session[key]=false;assert(!(await(await reviewBootstrap(new Request('https://uof.test'),f.app)).json()).pending);f.session[key]=true;}
 f.setStatus(503);let value=await(await reviewBootstrap(new Request('https://uof.test'),f.app)).json();assert.equal(value.pendingError.status,503);assert(!value.pending);
 f.setStatus(200);f.pending.account='other';assert.equal((await reviewBootstrap(new Request('https://uof.test'),f.app)).status,401);
});

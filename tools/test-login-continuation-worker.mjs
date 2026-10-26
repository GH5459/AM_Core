import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {dailyContinuationFetch,uofContinuationFetch,continuationCall} from '../versions/AM-IMP-2026.1023.50/login-continuation-worker.mjs';
const {transformWorker}=createRequire(import.meta.url)('../versions/AM-IMP-2026.1023.50/build-worker.cjs');
test('latest complete Worker wrapper and scheduled behavior remain the base',()=>{
 const source='var SharedManagementService = class extends WorkerEntrypoint {}\nexport {SharedManagementService,future_work_worker as default};';
 const out=transformWorker('dailylog',source);assert.match(out,/future_work_worker.fetch\(request,env,ctx\)/);assert.match(out,/future_work_worker.scheduled\(\.\.\.args\)/);assert.match(out,/async continuationCall/);assert.throws(()=>transformWorker('dailylog',out));
});
test('anonymous internal authority cannot read any source proof',async()=>{
 const r=await dailyContinuationFetch(new Request('https://dailylog.chatgpt-673.workers.dev/api/integrations/leaf-snail/tasks/login-continuation-authority',{method:'POST',body:'{}'}),{});assert.equal(r.status,401);
});
test('broker rejection retains only a bounded phase code, never raw service details',async()=>{
 const original=globalThis.fetch;try{
  for(const [code,expected]of [['CONTINUATION_TARGET_ACCESS','CONTINUATION_TARGET_ACCESS'],['Bearer private-secret','CONTINUATION_BROKER_HTTP']]){
   globalThis.fetch=async()=>Response.json({ok:false,code,error:'private service details'},{status:401});
   await assert.rejects(()=>continuationCall({AMCORE_MEETING_MANAGEMENT_SECRET:'isolated-secret-with-at-least-32-characters'},{action:'check'}),e=>e.diagnostic===expected&&!e.message.includes('private'));
  }
 }finally{globalThis.fetch=original;}
});
test('UOF browser challenge is target-only, short, HttpOnly and original login remains available',async()=>{
 const app={env:{},session:async()=>null,store:{get:async()=>null}};
 const r=await uofContinuationFetch(app,new Request('https://uof-line.ghotel.tw/login-continuation/start?returnPath=%2FLine%2FReview'));
 assert.equal(r.status,303);const cookies=r.headers.getSetCookie();assert(cookies.some(c=>/^__Host-uof-login-challenge=/.test(c)&&c.includes('HttpOnly; Secure; SameSite=Lax; Max-Age=60')));
 assert.equal(await uofContinuationFetch(app,new Request('https://uof-line.ghotel.tw/Account/Login?continuation=skip')),null);
 for(const path of ['https://evil.test','//evil.test','/admin'])assert.equal((await uofContinuationFetch(app,new Request('https://uof-line.ghotel.tw/login-continuation/start?returnPath='+encodeURIComponent(path)))).status,401);
});

test('a source-site failure automatically returns to the requested app and preserves the exact destination',async()=>{
 const app={env:{},session:async()=>null,store:{get:async()=>null}};
 for(const target of ['dailylog','meetings','uof']){
  const returnPath=target==='dailylog'?'/xiaoye?issue=work-original':target==='meetings'?'/meetings/review/hub?view=mine':'/Line/Review';
  const r=await uofContinuationFetch(app,new Request('https://uof-line.ghotel.tw/login-continuation/authorize?'+new URLSearchParams({target,returnPath,challenge:'a'.repeat(64)})));
  const html=await r.text(),nodes={status:{},retry:{}},navigation=[];
  await vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{history:{replaceState(){}},location:{pathname:'/login-continuation/authorize',replace:u=>navigation.push(u)},document:{getElementById:id=>nodes[id]},fetch:async()=>({ok:false,json:async()=>({})})});
  const back=new URL(navigation[0]);assert.equal(back.origin,target==='dailylog'?'https://dailylog.chatgpt-673.workers.dev':target==='meetings'?'https://am.hozorental.com':'https://uof-line.ghotel.tw');
  assert.equal(back.searchParams.get('continuation'),'skip');
  if(target!=='meetings')assert.equal(back.searchParams.get(target==='dailylog'?'returnTo':'ReturnUrl'),returnPath);
  assert.equal(nodes.retry.href,navigation[0]);
 }
});

test('native login returnTo is retained and a callback failure retains its original local destination',async()=>{
 const app={env:{},session:async()=>null,store:{get:async()=>null}};
 const env={DB:{prepare(){return {first:async()=>null}}}};
 const started=await dailyContinuationFetch(new Request('https://dailylog.chatgpt-673.workers.dev/login?returnTo='+encodeURIComponent('/xiaoye?issue=work-original')),env);
 assert.equal(new URL(started.headers.get('Location')).searchParams.get('returnPath'),'/xiaoye?issue=work-original');
 const r=await uofContinuationFetch(app,new Request('https://uof-line.ghotel.tw/login-continuation/callback?code=bad',{headers:{Cookie:'__Host-uof-login-return='+encodeURIComponent('/Line/Review')}}));
 const html=await r.text();assert(html.includes('ReturnUrl=%2FLine%2FReview'));
 const denied=await uofContinuationFetch(app,new Request('https://uof-line.ghotel.tw/login-continuation/authorize?'+new URLSearchParams({target:'dailylog',returnPath:'https://evil.test/',challenge:'a'.repeat(64)})));
 assert.equal(denied.status,401);
});

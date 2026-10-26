import test from 'node:test';
import assert from 'node:assert/strict';
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

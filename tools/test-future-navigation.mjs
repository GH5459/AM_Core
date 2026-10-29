import test from 'node:test';
import assert from 'node:assert/strict';
import {futureNavResponse} from '../versions/AM-IMP-2026.1029.future-nav/future-nav.mjs';
const req=(path,method='GET')=>new Request('https://example.test'+path,{method});
test('does not modify authorization failures, other paths, or non-GET requests',async()=>{
 for(const [request,response] of [[req('/journal.js'),new Response('登入',{status:401})],[req('/api/tasks'),new Response('original')],[req('/journal.js','POST'),new Response('original')]]){const out=await futureNavResponse(request,response);assert.equal(out,response);}
});
test('fails safely if the production page changes unexpectedly',async()=>{
 for(const path of ['/','/journal.js','/mobile.js']){const out=await futureNavResponse(req(path),new Response('changed asset'));assert.equal(out.status,503);assert.equal(out.headers.get('cache-control'),'private, no-store');}
});
test('updates navigation in the intended order',async()=>{
 const source="const items=[['journals','book','今日'],['weekly','calendar','本週'],['todos','check','追蹤'],['account','people','我的']];";const out=await futureNavResponse(req('/mobile.js'),new Response(source,{headers:{etag:'old','content-type':'text/javascript'}}));const body=await out.text();assert.match(body,/\['journals','book','今日'\],\['future','check','未來'\],\['weekly','calendar','本週'\]/);assert.equal(out.headers.get('etag'),null);
});



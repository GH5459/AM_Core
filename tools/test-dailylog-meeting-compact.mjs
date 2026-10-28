import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
const require=createRequire(import.meta.url),native=require('../versions/AM-IMP-2026.1028.04/build.cjs'),compact=require('../versions/AM-IMP-2026.1028.05/build.cjs');
test('patch current meeting client without replacing its original login or actions',()=>{
 const original=native.clientSource(),updated=compact.patchClient(original);new Script(updated);
 assert(updated.includes("add.textContent='＋ 新增會議'"));assert(updated.includes('calendar.hidden=true'));assert(updated.includes('loginContinuationSession:async()=>true'));assert(updated.includes("action:'create'"));assert.throws(()=>compact.patchClient('unknown current client'));
});
test('replace only the existing authenticated client literal in the worker',()=>{
 const client=native.clientSource(),source=`import {meetingProxy} from './dailylog-meetings.mjs';if(url.pathname==='/dailylog-meetings-client.js'){if(!check)return new Response('請先登入。',{status:401});return new Response(${JSON.stringify(client)},{headers:{'Content-Type':'text/javascript; charset=utf-8'}});}originalWorker.fetch();`;
 const updated=compact.patchWorker(source);assert(updated.includes("return new Response('請先登入。',{status:401})"));assert(updated.endsWith('originalWorker.fetch();'));assert.throws(()=>compact.patchWorker('unknown worker'));
});

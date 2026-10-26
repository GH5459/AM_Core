import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {journalRecoveryAsset} from '../versions/AM-IMP-2026.1026.02/journal-recovery.mjs';
const {transformWorker}=createRequire(import.meta.url)('../versions/AM-IMP-2026.1026.02/build-worker.cjs');
test('capacity changes only the authenticated journal route and its automatic draft preparation',()=>{
 const source='if (new TextEncoder().encode(body2).length > 1024 * 1024) return base.fetch(request, env, ctx);\njournal.submit(session3.user, await bodyJson(request, 1024 * 1024), { defer: true });\nreturn await dailyContinuationFetch(request,env)||future_work_worker.fetch(request,env,ctx);\nconst unrelated=1024 * 1024;';
 const out=transformWorker(source);assert.match(out,/journal.submit\(session3.user, await bodyJson\(request, 1536 \* 1024\), \{ defer: true \}\)/);assert.match(out,/const unrelated=1024 \* 1024/);assert.throws(()=>transformWorker(out));assert.throws(()=>transformWorker(source+source));
});
test('save error explains rejection without altering pending content or acknowledgement logic',async()=>{
 const original="state==='failed'?'暫時無法連線，內容已保留在這台裝置。':''; pending=sent;metadata();";
 let received;const base={fetch:async r=>{received=r;return new Response(original,{headers:{ETag:'old','Content-Type':'text/javascript'}});}};
 const r=await journalRecoveryAsset(new Request('https://daily.test/notion-sync-client.js',{headers:{'If-None-Match':'old'}}),{}, {},base);
 const script=await r.text();assert.equal(received.headers.get('If-None-Match'),null);assert.equal(r.headers.get('ETag'),null);assert.match(script,/message\?'尚未儲存：'/);assert.match(script,/pending=sent;metadata\(\)/);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 assert.equal(await journalRecoveryAsset(new Request('https://daily.test/private-data.js'),{},{},base),null);
});
test('server-normalized acknowledgement merges against the sent draft and preserves edits or conflicts',async()=>{
 const r=await journalRecoveryAsset(new Request('https://daily.test/notion-sync-client.js'),{},{},{fetch:async()=>new Response("if(pending===sent)pending=null;state=pending?'pending':result.state==='synced'?'synced':'saved';")});
 const source=await r.text();assert.match(source,/merge\(JSON.parse\(sent\),packet\(data\),ack\)/);assert.match(source,/reconciled.conflicts.length/);assert.match(source,/backup\(packet\(data\)\);blocked=true/);assert.match(source,/pending=equal\(packet\(data\),ack\)\?null/);assert.match(source,/state=blocked\?'conflict'/);
});

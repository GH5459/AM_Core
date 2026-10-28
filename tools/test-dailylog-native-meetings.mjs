import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
import {hubHtml} from '../modules/meetings/hub-ui.js';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
const require=createRequire(import.meta.url),build=require('../versions/AM-IMP-2026.1028.04/build.cjs');
test('native boot data preserves content and cannot close its JSON script',()=>{
 const value={id:'a'.repeat(64),topic:'</script><script>alert(1)</script>',liffId:'fixture'};
 for(const html of [hubHtml(value),workspaceHtml(value)]){
  const boot=html.match(/<script type="application\/json" id="dailylogMeetingBoot">([\s\S]*?)<\/script>/)?.[1];assert(boot);assert(!boot.includes('<'));assert.deepEqual(JSON.parse(boot),value);
 }
});
test('native client is compiled trusted code with scoped DOM and one existing login',()=>{
 const client=build.clientSource();new Script(client);assert(!client.includes("createElement('iframe')"));assert(!client.includes('new Function('));assert(client.includes("attachShadow({mode:'open'})"));assert(client.includes('loginContinuationSession:async()=>true'));assert(client.includes('window.DAILYLOG_AUTH.csrfToken'));assert(client.includes('message.textContent=e.message'));assert(client.includes('const views=new Map()'));assert(client.includes('navigator.mediaDevices.getUserMedia'));
});
test('updating current worker retains anonymous rejection and the existing delegate',()=>{
 const source=`import {meetingProxy,meetingAssets} from './dailylog-meetings.mjs';\nconst worker={fetch(){const url={};if(url.pathname==='/dailylog-meetings-client.js'){if(!check)return new Response('請先登入。',{status:401});return new Response('old-client',{headers:{'Content-Type':'text/javascript; charset=utf-8'}});}return latest_attachments_worker.fetch();}};`;
 const updated=build.patchWorker(source);assert(updated.includes("return new Response('請先登入。',{status:401})"));assert(updated.includes('return latest_attachments_worker.fetch()'));assert(!updated.includes("new Response('old-client'"));assert.throws(()=>build.patchWorker('unknown export'));
});

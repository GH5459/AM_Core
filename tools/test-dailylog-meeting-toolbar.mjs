import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {hubHtml} from '../modules/meetings/hub-ui.js';
const require=createRequire(import.meta.url),native=require('../versions/AM-IMP-2026.1028.04/build.cjs'),compact=require('../versions/AM-IMP-2026.1028.05/build.cjs'),toolbar=require('../versions/AM-IMP-2026.1028.12/build.cjs');
test('toolbar retains the live status node and existing action listeners',()=>{
 const updated=toolbar.patchClient(compact.patchClient(native.clientSource()));
 const dom=new JSDOM(hubHtml({})),body=dom.window.document.body;
 const status=body.querySelector('#status'),refresh=body.querySelector('#refresh'),add=body.querySelector('#new');let clicked=0;refresh.addEventListener('click',()=>clicked++);
 const block=updated.split('root.append(head,body);')[1].split('const realDocument=')[0];
 new Function('body','target',block)(body,{pathname:'/meetings/review/hub'});
 assert.equal(body.querySelector('header #status'),status);assert.equal(body.querySelector('#new'),add);assert.equal(body.querySelector('#refresh'),refresh);
 status.textContent='會議暫時無法讀取';assert.equal(body.querySelector('header [role=status]').textContent,'會議暫時無法讀取');refresh.click();assert.equal(clicked,1);
 assert(!updated.includes('會議與記錄沿用原資料'));assert(!updated.includes('data-meeting-home>會議清單'));
 assert.throws(()=>toolbar.patchClient(updated));dom.window.close();
});
test('patch retains authentication and all other worker code',()=>{
 const client=compact.patchClient(native.clientSource()),before="/* existing worker */if(url.pathname==='/dailylog-meetings-client.js'){if(!check)return new Response('請先登入。',{status:401});return new Response(",after=",{headers:{'Content-Type':'text/javascript; charset=utf-8'}});}original.fetch();";
 const updated=toolbar.patchWorker(before+JSON.stringify(client)+after);assert(updated.startsWith(before));assert(updated.endsWith(after));assert.throws(()=>toolbar.patchWorker('unexpected worker'));
});

import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {multilingualClient} from '../core/multilingual-client.js';
import {hubHtml} from '../modules/meetings/hub-ui.js';
import {multilingualScript} from '../modules/meetings/multilingual.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:['C:/Users/seven/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><script>('+multilingualClient.toString()+')();</script></head><body><main><h1>Room 301 belum selesai</h1><button id="new">新增</button><section id="hubPreparation">編輯內容</section><select id="status"><option value="done">已完成</option></select></main></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 for(const locale of ['zh-Hant','en','id']){const page=await browser.newPage();let items=[{name:'Synthetic author',at:'2026-10-19T00:00:00Z',text:'Saya belum selesai 301.'}],saved=[];
  await page.route('**/api',async route=>{const value=route.request().postDataJSON();if(value.action==='reply-add'){saved.push(value);items=[...items,{name:'Synthetic author',at:'2026-10-19T01:00:00Z',text:value.text}];}await route.fulfill({json:{ok:true,experience:{locale,revision:1},replies:items,...value.action==='translate'?{translations:value.texts.map(t=>'Translated '+t)}:{}}});});
  await page.goto(origin+'/meetings/review/work/'+'a'.repeat(64));
  const poll=()=>page.evaluate(()=>fetch(location.pathname+'/api',{method:'POST',headers:{Authorization:'Bearer synthetic-local-only','Content-Type':'application/json'},body:JSON.stringify({action:'read'})}));await poll();await page.locator('.three-language-replies textarea').waitFor();
  await page.locator('.three-language-replies textarea').fill('Unsent draft belum selesai');await page.locator('h1').click();await poll();assert.equal(await page.locator('.three-language-replies textarea').inputValue(),'Unsent draft belum selesai');
  await page.locator('.three-language-replies button').click();await page.waitForFunction(()=>document.querySelector('.three-language-replies textarea').value==='');assert.equal(saved.length,1);assert.equal(saved[0].text,'Unsent draft belum selesai');
  if(locale!=='zh-Hant'){assert.equal(await page.locator('#new').isVisible(),false);assert.equal(await page.locator('#hubPreparation').isVisible(),false);}
  await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('Translated'));
  await page.locator('.three-language-bar button').click();assert.equal(await page.locator('h1').textContent(),'Room 301 belum selesai');assert.equal(await page.locator('#status').inputValue(),'done');
  for(const width of [360,390,430,768,1024,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow at '+width);}
  await page.close();
 }
 const html=hubHtml({liffId:'synthetic'}).replace('<header>',multilingualScript+'<header>');assert(html.includes('window.__threeLanguageText'));assert(html.indexOf('window.__threeLanguageText')<html.indexOf('id="new"'));
 console.log('Three locale browser checks passed: drafts, original toggle, stable status values, restrictions, six widths and actual hub injection.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

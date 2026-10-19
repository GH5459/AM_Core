import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {hubHtml} from '../modules/meetings/hub-ui.js';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],weeks=[],creates=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fixture.test/**',async route=>{
  const request=route.request();if(!request.url().endsWith('/api'))return route.fulfill({contentType:'text/html',body:hubHtml({liffId:'fixture'}).replace('<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',`<script>window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'fixture'};</script>`)});
  const v=request.postDataJSON();let result={ok:true};
  if(v.action==='list')result={...result,items:[],next:null};
  if(v.action==='calendar-week'){weeks.push(v.start);result.items=[{id:'recurring-instance',topic:'每週討論',start:v.start+'T10:00:00+08:00',end:v.start+'T11:00:00+08:00',location:'合成地點',calendarRef:'signed-for-current-person'}];}
  if(v.action==='sources')result.sources=[{key:'fixture-source',name:'合成來源'}];
  if(v.action==='organization')result.organization={departments:[],people:[]};
  if(v.action==='create'){creates.push(v);return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'合成測試保留輸入'})});}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('https://fixture.test/meetings/review/hub');await page.waitForSelector('#calendarItems article');
 assert.equal(creates.length,0);await page.click('#nextWeek');await page.waitForFunction(first=>document.querySelector('#weekLabel').textContent.slice(0,10)!==first,weeks[0]);await page.waitForTimeout(100);
 assert.equal(Date.parse(weeks[1])-Date.parse(weeks[0]),7*86400000);await page.click('#previousWeek');await page.waitForTimeout(100);assert.equal(weeks[2],weeks[0]);
 await page.click('#calendarItems button');await page.locator('#newPanel').waitFor({state:'visible'});assert(await page.locator('#newPanel').isVisible());assert.equal(await page.locator('#topic').inputValue(),'每週討論');assert(await page.locator('#calendar').isDisabled());assert.equal(creates.length,0);
 await page.click('#create');await page.waitForFunction(()=>document.querySelector('#status').textContent==='合成測試保留輸入');assert.equal(creates[0].calendarRef,'signed-for-current-person');assert.equal(creates[0].calendar,false);
 for(const width of [360,390,430,768,1024,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width);}
 await page.setViewportSize({width:390,height:844});if(process.argv[3])await page.screenshot({path:process.argv[3],fullPage:true});assert.deepEqual(errors,[]);
 console.log('Weekly Calendar UI: seven-day navigation, private preview without creation, explicit source/filing, no duplicate Calendar write, preserved retry input and six widths passed.');
}finally{await browser.close();}

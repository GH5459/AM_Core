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
  if(v.action==='list')result={...result,items:[{id:'saved-fixture',topic:'已建檔會議',start:new Date().toISOString(),end:new Date(Date.now()+86400000).toISOString(),state:'review',kind:'本人會議',host:'合成主持人',url:'https://fixture.test/meetings/review/work/saved-fixture'}],next:null};
  if(v.action==='list'&&v.scope==='shared')result={ok:true,items:[],next:null};
  if(v.action==='calendar-week'){weeks.push(v.start);result.items=[{id:'recurring-instance',topic:'每週討論',start:v.start+'T10:00:00+08:00',end:v.start+'T11:00:00+08:00',location:'合成地點',calendarRef:'signed-for-current-person'},...['服務流程與跨部門協作會議（手機長標題換行）','已建檔會議','人資週會','財務週會'].map((topic,i)=>({id:'event-'+i,topic,start:v.start+'T'+String(11+i).padStart(2,'0')+':00:00+08:00',end:v.start+'T'+String(12+i).padStart(2,'0')+':00:00+08:00',location:i===0?'總部第三會議室':'',calendarRef:'fixture-'+i,...i===1?{meetingId:'saved-fixture'}:{}})),{id:'tomorrow',topic:'隔天討論',start:new Date(Date.parse(v.start+'T00:00:00Z')+86400000).toISOString().slice(0,10)+'T10:00:00+08:00',end:new Date(Date.parse(v.start+'T00:00:00Z')+86400000).toISOString().slice(0,10)+'T11:00:00+08:00',calendarRef:'tomorrow-ref'}];}
  if(v.action==='sources')result.sources=[{key:'fixture-source',name:'合成來源'}];
  if(v.action==='organization')result.organization={departments:[],people:[]};
  if(v.action==='create'){creates.push(v);return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'合成測試保留輸入'})});}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('https://fixture.test/meetings/review/hub');await page.waitForSelector('#calendarItems article');assert.equal(await page.locator('#calendarItems article').count(),6);assert.equal(await page.locator('#calendarItems').getByText('已建檔會議',{exact:true}).count(),1);assert((await page.locator('#calendarItems .meeting-time').first().textContent()).includes('11:00'));assert.equal(await page.locator('.meeting-date').count(),2);
 assert.equal(creates.length,0);await page.click('#nextWeek');await page.waitForFunction(first=>document.querySelector('#weekLabel').dataset.start!==first,weeks[0]);await page.waitForTimeout(100);
 assert.equal(Date.parse(weeks[1])-Date.parse(weeks[0]),7*86400000);await page.click('#previousWeek');await page.waitForTimeout(100);assert.equal(weeks[2],weeks[0]);
 await page.click('#dayView');assert.equal(await page.locator('#dayView').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#calendarItems article').count(),5);assert.equal(await page.locator('.meeting-date').count(),0);assert.equal(await page.locator('#nextWeek').getAttribute('aria-label'),'後一天');const requestCount=weeks.length;await page.click('#nextWeek');await page.waitForFunction(first=>document.querySelector('#weekLabel').dataset.start!==first,weeks[0]);await page.waitForTimeout(100);assert.equal(Date.parse(weeks[requestCount])-Date.parse(weeks[0]),86400000);await page.click('#weekView');assert.equal(await page.locator('#nextWeek').getAttribute('aria-label'),'下一週');await page.click('#currentWeek');await page.waitForTimeout(100);assert.equal(await page.locator('#endedPanel').getAttribute('open'),null);
 await page.getByRole('button',{name:'建立／開啟會議記錄：每週討論',exact:true}).click();await page.locator('#newPanel').waitFor({state:'visible'});assert(await page.locator('#newPanel').isVisible());assert.equal(await page.locator('#topic').inputValue(),'每週討論');assert(await page.locator('#calendar').isDisabled());assert.equal(creates.length,0);
 await page.click('#create');await page.waitForFunction(()=>document.querySelector('#status').textContent==='合成測試保留輸入');assert.equal(creates[0].calendarRef,'signed-for-current-person');assert.equal(creates[0].calendar,false);
 for(const width of [360,390,430,768,1024,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width);}
 await page.click('#new');await page.setViewportSize({width:390,height:844});assert((await page.locator('#calendarItems article').first().boundingBox()).height<120);if(process.argv[3])await page.screenshot({path:process.argv[3],fullPage:true});assert.deepEqual(errors,[]);
 console.log('Compact Calendar UI: day/week modes, one-day/seven-day navigation, private preview without creation, explicit source/filing, no duplicate Calendar write, preserved retry input and six widths passed.');
}finally{await browser.close();}

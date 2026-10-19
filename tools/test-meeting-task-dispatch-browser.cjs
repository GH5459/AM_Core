const assert=require('assert/strict'),fs=require('fs');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{const [,, ,url,out]=process.argv,browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('待派發 1 項'));
 assert((await page.locator('#notice').textContent()).includes('自動補派'));assert(await page.locator('#readerPanel').isVisible());
 await page.click('#editMode');await page.waitForSelector('[data-number]');assert((await page.locator('[data-number]').first().textContent()).includes('待派發'));
 assert((await page.locator('#publishText').textContent()).includes('不影響發布'));
 fs.mkdirSync(out,{recursive:true});await page.screenshot({path:out+'/synthetic-desktop.png',fullPage:true});
 for(const width of [390,768,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/synthetic-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Synthetic browser: published reader with pending delivery, per-item edit status, unconnected publication explanation and 390/768/1280 widths passed.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const r=await page.request.post('http://127.0.0.1:8845/meetings/review/hub/api',{headers:{Authorization:'Bearer host'},data:{action:'create',operationId:'markdown-browser-'+Date.now(),conversationKey:'a'.repeat(64),topic:'合成示例｜Markdown 會前議程',start:'2026-10-28T10:00:00+08:00',end:'2026-10-28T11:00:00+08:00',location:'合成會議室',accounts:[],calendar:false,cancelled:false}});
  assert(r.ok());const result=await r.json();await page.route('https://meeting.example.test/**',async route=>{const request=route.request();const response=await page.request.fetch('http://127.0.0.1:8845'+new URL(request.url()).pathname,{method:request.method(),headers:{...request.headers(),host:'meeting.example.test'},data:request.postDataBuffer()||undefined});await route.fulfill({response});});await page.goto(result.url);await page.waitForFunction(()=>document.querySelector('#preparation')?.disabled===false);
  await page.click('#preparationPanel > summary');
  const original='# 會前議程\n\n## 一、進度討論\n\n**本週重點**：確認工作安排。\n\n1. 回顧上週進度\n   - 已完成項目\n   - 仍待確認項目\n2. 安排下週工作\n\n- [ ] 準備參考資料\n- [x] 確認會議時間\n\n| 項目 | 說明 |\n| --- | --- |\n| 進度 | 請各組補充 |\n\n> 本區為會前背景，實際決議依會議記錄。\n\n[參考連結](https://example.test)';
  await page.fill('#preparation',original);await page.click('#preparationView');assert.equal(await page.locator('#preparationPreview h1').innerText(),'會前議程');assert.equal(await page.locator('#preparationPreview ol li ul li').count(),2);
  assert(await page.locator('#preparationStatus').innerText()==='會前資料尚未儲存');
  await page.click('#preparationEdit');assert.equal(await page.locator('#preparation').inputValue(),original);
  await page.click('#savePreparation');await page.waitForFunction(()=>document.querySelector('#hubStatus').textContent==='會前資料已儲存');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#preparation')?.value.startsWith('# 會前議程'));
  await page.click('#preparationPanel > summary');assert(await page.locator('#preparationPreview').isVisible());assert.equal(await page.locator('#preparation').inputValue(),original);
  for(const width of [360,390,768,1024]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width);}
  await page.setViewportSize({width:390,height:844});const out=process.argv[3];if(out){fs.mkdirSync(out,{recursive:true});await page.locator('#preparationPanel').screenshot({path:out+'/preparation-markdown-mobile.png'});}
  assert.deepEqual(errors,[]);console.log('PASS: real Chrome preview/edit, original text, explicit save/reload, persisted format, 360/390/768/1024 widths, no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});



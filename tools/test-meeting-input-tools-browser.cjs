const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
 const {workspaceHtml}=await import('../modules/meetings/workspace-ui.js');
 const id='e'.repeat(64),origin='https://meeting.example.test',calls=[];let failPlan=true,plan=null,input={source:'audio',text:'',version:0},audio=false;
 const state={ok:true,access:'member',actor:{id:'fixture-host',name:'合成主持人'},host:true,canEdit:true,types:[{name:'工作會議',prompt:'保留來源依據'}],workspace:{id,state:'setup',revision:1,fields:{settings:{topic:'合成會議工具驗證',type:'工作會議',prompt:'保留來源依據',date:'2026-10-27',speakers:[],cycle:{frequency:'daily'}},record:'',transcript:''},versions:{settings:0}},presence:[],reader:null,sharing:{enabled:false,version:0},members:{people:[]}};
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.fulfill({body:'',contentType:'application/javascript'});
   if(u.pathname.endsWith('/api')){assert(!req.headers().authorization,'External continued session has no LINE bearer');const v=req.postDataJSON();calls.push(v);if(v.action==='start'){state.workspace.state='processing';state.workspace.revision++;}return route.fulfill({json:state});}
   if(u.pathname.endsWith('/hub')){assert(!req.headers().authorization,'Tools must use continued cookie session');const v=req.postDataJSON();calls.push(v);
    if(v.action==='plan-read'&&failPlan){failPlan=false;return route.fulfill({status:503,json:{error:'合成暫時讀取失敗'}});}
    if(v.action==='preparation-init')plan={preparation:v.text,preparation_version:1,participants:[]};
    if(v.action==='transcript-input'){input={source:v.source,text:v.text,version:input.version+1};state.workspace.revision++;}
    if(v.action==='audio-begin')return route.fulfill({json:{saved:false,received:[]}});
    if(v.action==='audio-part')return route.fulfill({json:{ok:true}});
    if(v.action==='audio-finish'){audio=true;state.workspace.revision++;}
    return route.fulfill({json:{ok:true,plan,input,host:true,actorId:'fixture-host',audio,calendar:[]}});
   }
   if(u.pathname.includes('/work/'))return route.fulfill({contentType:'text/html',body:workspaceHtml({id,liffId:'123-fixture'}).replace('<head>','<head><script>window.loginContinuationSession=async()=>true;</script>')});
   return route.fulfill({body:'',contentType:'application/javascript'});
  });
  await page.goto(origin+'/meetings/review/work/'+id);await page.waitForSelector('#retryMeetingTools:not([hidden])');assert(await page.locator('#hubPreparation').isVisible(),'Load failure must leave panel and retry visible');await page.click('#retryMeetingTools');await page.waitForFunction(()=>document.querySelector('#retryMeetingTools').hidden);
  assert.equal(await page.locator('#preparationPanel').getAttribute('open'),null);assert(await page.locator('#recordStart').isVisible(),'Recording independent of collapsed agenda');assert(await page.locator('#recordFile').isVisible());assert(!await page.locator('#planSchedule').isVisible());
  await page.click('#preparationPanel > summary');await page.fill('#preparation','議程：核對服務流程。');await page.click('#preparationPanel > summary');await page.click('#preparationPanel > summary');assert.equal(await page.inputValue('#preparation'),'議程：核對服務流程。');await page.click('#savePreparation');await page.waitForFunction(()=>document.querySelector('#hubStatus').textContent==='會前資料已儲存');
  await page.click('#recordStart');await page.waitForFunction(()=>!document.querySelector('#recordStop').disabled);await page.waitForTimeout(1200);await page.click('#recordStop');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.includes('已在此裝置保存'));await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.includes('錄音已保存'));
  await page.locator('#recordFile').setInputFiles({name:'fixture.wav',mimeType:'audio/wav',buffer:Buffer.from('synthetic-audio')});await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.includes('錄音已保存'));
  await page.selectOption('#generationSource','transcript');await page.fill('#inputTranscript','[00:01] 同仁甲：請核對資料。');await page.click('#start');assert((await page.locator('#hubStatus').textContent()).includes('請先儲存整理來源'));
  await page.click('#saveTranscriptInput');await page.waitForFunction(()=>document.querySelector('#transcriptInputStatus').textContent.includes('已儲存'));assert.equal(input.source,'transcript');await page.reload();await page.waitForFunction(()=>document.querySelector('#inputTranscript')?.value.includes('請核對資料'));assert.equal(await page.inputValue('#generationSource'),'transcript');
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow at '+width);}
  await page.setViewportSize({width:390,height:844});await page.click('#preparationPanel > summary');await page.click('#transcriptInputPanel > summary');if(process.argv[3]){fs.mkdirSync(process.argv[3],{recursive:true});await page.screenshot({path:process.argv[3]+'/meeting-tools-mobile.png',fullPage:true});}
  await page.click('#start');await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('製作中'));assert(!await page.locator('#meetingSources').isVisible());assert(calls.some(v=>v.action==='audio-part'));assert(calls.some(v=>v.action==='start'&&v.revision===state.workspace.revision-1));assert.deepEqual(errors,[]);
  console.log('Chrome continued-session UI: visible agenda toggle, failure/retry, no-plan microphone/upload, transcript save/reload/start, revision refresh, locked source and four viewport sizes passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

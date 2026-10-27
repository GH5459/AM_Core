const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
 const {hubWorkspaceClient}=await import('../modules/meetings/hub-ui.js');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const id='c'.repeat(64),block=8388608,plan={topic:'合成快速上傳',preparation:'',preparation_version:1,version:1,participants:[],calendar_enabled:false};
  let total=0,offset=0,transfer=[],lost=false,fail=false,saved=false;
  const html='<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main><div id="meetingHeading"></div><button id="start">整理</button></main><script>('+hubWorkspaceClient.toString()+')('+JSON.stringify({id,token:'synthetic'})+')</script></html>';
  await page.route('https://meeting.example.test/**',async route=>{
   const req=route.request();if(req.method()==='GET')return route.fulfill({contentType:'text/html',body:html});
   if(req.headers()['content-type']==='application/octet-stream'){
    const bytes=req.postDataBuffer(),from=Number(new URL(req.url()).searchParams.get('offset'));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),req.headers()['x-audio-sha256']);assert(bytes.length<=block);transfer.push({from,length:bytes.length});
    if(fail)return route.fulfill({status:503,json:{error:'合成中斷'}});
    offset=Math.max(offset,from+bytes.length);if(!lost){lost=true;return route.abort();}return route.fulfill({json:{ok:true,offset}});
   }
   const v=req.postDataJSON();let result={ok:true,host:true,actorId:'synthetic-host',plan,calendar:[],audio:saved,audioTransport:'drive-binary-resume-v2'};
   if(v.action==='audio-fast-begin'){total=v.total;assert.match(v.manifest,/^[a-f0-9]{64}$/);result={ok:true,transport:'drive-binary-resume-v2',offset,total,blockSize:block,saved};}
   if(v.action==='audio-fast-finish'){assert.equal(offset,total);saved=true;result={ok:true,audio:true,saved:true};}
   return route.fulfill({json:result});
  });
  await page.goto('https://meeting.example.test/work');await page.waitForFunction(()=>document.querySelector('#start')?.textContent==='進行會議記錄整理');
  // Real file input, larger than two upload blocks.
  await page.locator('#recordFile').setInputFiles({name:'synthetic.wav',mimeType:'audio/wav',buffer:Buffer.alloc(block*2+44,5)});
  await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.includes('音檔已在裝置暫存'));
  await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.startsWith('錄音已保存'));
  assert.deepEqual(transfer.map(x=>x.from),[0,0,block,block*2]);assert.equal(offset,block*2+44);
  // 1,024 small recording fragments aggregate into two binary requests.
  saved=false;offset=0;transfer=[];lost=true;
  await page.evaluate(async id=>{const db=await new Promise(r=>{const q=indexedDB.open('leaf-meeting-recorder-v1',1);q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('chunks','readwrite'),os=tx.objectStore('chunks'),slot=id+':synthetic-host',uploadKey='synthetic-recording-parts';os.put({uploadKey,parts:1024,mime:'audio/webm',filename:'synthetic.webm'},slot);for(let i=0;i<1024;i++)os.put(new Blob([new Uint8Array(16384)]),slot+':'+uploadKey+':'+i);tx.oncomplete=r;});db.close();},id);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#recordStatus')?.textContent.includes('1024'));await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.startsWith('錄音已保存'));
  assert.equal(transfer.length,2,'Recording fragments must be batched');assert(transfer.every(x=>x.length===block));
  // Actual browser microphone and IndexedDB survive a page reload.
  saved=false;offset=0;transfer=[];await page.click('#recordStart');await page.waitForFunction(()=>!document.querySelector('#recordStop').disabled);await page.waitForTimeout(1100);await page.click('#recordStop');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.includes('已在此裝置保存'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#recordStatus')?.textContent.includes('尚未保存錄音'));await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.startsWith('錄音已保存'));assert.equal(transfer.length,1);
  for(const width of [360,390,768]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.deepEqual(errors,[]);console.log('Chrome fast path: real file input, raw binary/hash, lost response retry, 1,024 recording fragments -> 2 requests, actual microphone/IndexedDB reload/upload and mobile widths passed.');
 }catch(e){for(const c of browser.contexts())for(const p of c.pages())console.error(await p.locator('body').innerText());throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

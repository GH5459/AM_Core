const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
 const {hubWorkspaceClient}=await import('../modules/meetings/hub-ui.js');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const id='a'.repeat(64),uploadId='synthetic-upload-001',content=Buffer.from('synthetic-audio'),hash=crypto.createHash('sha256').update(content).digest('hex');
  const plan={topic:'合成續傳測試',preparation:'',preparation_version:1,version:1,start_at:'2026-10-20T02:00:00Z',end_at:'2026-10-20T03:00:00Z',location:'',participants:[],calendar_enabled:false};
  let received=new Map(Array.from({length:54},(_,part)=>[part,hash])),saved=false,mode='transient',failed=false,requests=[];
  const html='<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main><div id="meetingHeading"></div><button id="start">整理</button></main><script>('+hubWorkspaceClient.toString()+')('+JSON.stringify({id,token:'synthetic'})+')</script></html>';
  await page.route('https://meeting.example.test/**',async route=>{
   if(route.request().method()==='GET')return route.fulfill({contentType:'text/html',body:html});
   const v=route.request().postDataJSON();requests.push(v.action==='audio-part'?v.part:v.action);
   let result={ok:true,host:true,actorId:'synthetic-host',plan,calendar:[],audio:saved};
   if(v.action==='audio-begin')result={ok:true,saved,received:[...received].map(([part,hash])=>({part,hash}))};
   if(v.action==='audio-part'){
    assert.equal(crypto.createHash('sha256').update(Buffer.from(v.bytes,'base64')).digest('hex'),hash);
    if(mode==='persistent'||(!failed&&v.part===54)){failed=true;return route.fulfill({status:503,json:{error:'合成連線中斷'}});}
    received.set(v.part,hash);result={ok:true,saved:true};
   }
   if(v.action==='audio-finish'){assert.equal(received.size,95);saved=true;result.audio=true;}
   return route.fulfill({json:result});
  });
  await page.goto('https://meeting.example.test/work');
  await page.waitForFunction(()=>document.querySelector('#planTopic')?.value==='合成續傳測試');
  async function seed(){
   await page.evaluate(async({id,uploadId})=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('leaf-meeting-recorder-v1',1);q.onsuccess=()=>resolve(q.result);q.onerror=reject;});
    await new Promise((resolve,reject)=>{const tx=db.transaction('chunks','readwrite'),os=tx.objectStore('chunks'),slot=id+':synthetic-host';os.put({uploadKey:uploadId,parts:95,mime:'audio/mpeg',filename:'synthetic.mp3'},slot);for(let i=0;i<95;i++)os.put(new Blob(['synthetic-audio']),slot+':'+uploadId+':'+i);tx.oncomplete=resolve;tx.onerror=reject;});db.close();
   },{id,uploadId});
   await page.reload();await page.waitForFunction(()=>document.querySelector('#recordStatus')?.textContent.includes('95'));
  }
  async function localCount(){return page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('leaf-meeting-recorder-v1',1);q.onsuccess=()=>r(q.result);});return new Promise(r=>{const q=db.transaction('chunks').objectStore('chunks').count();q.onsuccess=()=>{db.close();r(q.result);};});});}
  await seed();requests=[];await page.click('#recordUpload');
  await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.startsWith('錄音已保存'),{timeout:30000});
  assert.equal(requests.filter(x=>typeof x==='number'&&x<54).length,0,'Do not resend the first 54 parts');
  assert.equal(requests.filter(x=>x===54).length,2,'Retry only the interrupted part');assert.equal(received.size,95);assert.equal(await localCount(),0);
  saved=false;received=new Map();mode='persistent';await seed();requests=[];
  // Shorten test backoff only; the deployed code retains its bounded delays.
  await page.evaluate(()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,Math.min(ms,5),...args);});
  await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.startsWith('上傳暫停'));
  assert.equal(requests.filter(x=>x===0).length,6);assert.equal(await localCount(),96,'Keep all local data after retries are exhausted');
  saved=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#recordStatus')?.textContent.includes('95'));requests=[];
  await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.startsWith('錄音已保存'));
  assert(!requests.some(x=>typeof x==='number'));assert(!requests.includes('audio-finish'));assert.equal(await localCount(),0,'Recover an already saved upload without replay');
  saved=false;received=new Map([[0,'different-hash']]);await seed();requests=[];await page.click('#recordUpload');await page.waitForFunction(()=>document.querySelector('#hubStatus').textContent.includes('內容不同'));
  assert.equal(requests.filter(x=>typeof x==='number').length,0);assert.equal(await localCount(),96);assert.deepEqual(errors,[]);
  console.log('Chrome: 95-part resume skips 54 confirmed parts; transient retry, bounded permanent failure, reload, saved-response recovery, hash conflict and local preservation passed.');
 }catch(e){for(const context of browser.contexts())for(const p of context.pages())console.error(await p.locator('body').innerText());throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


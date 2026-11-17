const assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');

function wav(seconds, level){
 const data=Buffer.alloc(44+8000*2*seconds);
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
 data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
 data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
 data.write('data',36);data.writeUInt32LE(data.length-44,40);
 for(let i=44;i<data.length;i+=2)data.writeInt16LE(i%80<40?level:-level,i);
 return data;
}

(async()=>{
 const {workspaceHtml}=await import('../modules/meetings/workspace-ui.js');
 const id='a'.repeat(64),base='https://meeting.example.test',path='/meetings/review/work/'+id;
 const recordings=[],uploads=new Map(),puts=[],starts=[],errors=[];
 const parts=[wav(5,10),wav(5,20),wav(5,30)];
 const fields={settings:{topic:'合成多段錄音',date:'2026-11-17',type:'工作會議',prompt:'整理決議',projectGoal:'',speakers:[]}};
 let phase='setup',revision=1,loseFinish=true,shared=true;
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',...process.env.MEETING_TEST_MIC_WAV?['--use-file-for-fake-audio-capture='+process.env.MEETING_TEST_MIC_WAV]:[]]});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname==='/login-continuation/browser.js')return route.fulfill({contentType:'application/javascript',body:''});
   if(url.host==='static.line-scdn.net')return route.fulfill({contentType:'application/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=>"synthetic"};'});
   if(url.pathname===path+'/audio'){
    const file=uploads.get(url.searchParams.get('recording'));
    return route.fulfill({status:shared&&file?200:403,contentType:file?.filename.endsWith('.webm')?'audio/webm':'audio/wav',body:file?.data});
   }
   if(req.method()==='GET')return route.fulfill({contentType:'text/html',body:workspaceHtml({id,liffId:'synthetic',publicAvailable:phase==='published'})});
   if(req.headers()['content-type']==='application/octet-stream'){
    const uploadId=url.searchParams.get('uploadId'),file=uploads.get(uploadId);
    assert.equal(url.searchParams.get('stage'),'1');
    const offset=Number(url.searchParams.get('offset')),bytes=req.postDataBuffer();
    puts.push(uploadId);file.data=Buffer.concat([file.data.subarray(0,offset),bytes]);
    return route.fulfill({json:{offset:file.data.length}});
   }
   const input=req.postDataJSON();
   if(url.pathname===path+'/hub'){
    const view=()=>({ok:true,host:true,actorId:'synthetic-host',recordings:recordings.map(({id,filename,size})=>({id,filename,size})),audio:!!recordings.length,
     audioRevision:revision,audioStamp:recordings.map(x=>x.id).join(','),audioTransport:'drive-binary-resume-v2'});
    if(input.action==='plan-read')return route.fulfill({json:view()});
    if(input.action==='audio-fast-begin'){
     assert(input.stage);
     if(!uploads.has(input.uploadId))uploads.set(input.uploadId,{id:input.uploadId,filename:input.filename,size:input.total,data:Buffer.alloc(0),saved:false});
     const file=uploads.get(input.uploadId);
     return route.fulfill({json:{transport:'drive-binary-resume-v2',total:file.size,offset:file.data.length,blockSize:8388608,saved:file.saved}});
    }
    if(input.action==='audio-fast-finish'){
     const file=uploads.get(input.uploadId);assert(input.stage);assert.equal(file.data.length,file.size);file.saved=true;
     if(loseFinish){loseFinish=false;return route.abort();}
     return route.fulfill({json:{audio:true,saved:true}});
    }
    if(input.action==='audio-list-save'){
     assert.equal(input.revision,revision);
     const chosen=input.ids.map(id=>recordings.find(x=>x.id===id)||uploads.get(id));assert(chosen.every(x=>x?.saved));
     recordings.splice(0,recordings.length,...chosen);revision++;
     return route.fulfill({json:view()});
    }
   }
   if(input.action==='start'){starts.push(input);phase='processing';}
   const workspace={id,state:phase,revision,fields,versions:{},ownerNames:{},sourceRecordingCount:recordings.length};
   if(phase==='published'){
    if(!shared)return route.fulfill({status:403,json:{error:'已撤銷分享'}});
    const transcript='[1@0:00] 第1段講者 A：現場錄音。\n[2@0:02] 第2段講者 A：前段。\n[3@0:02] 第3段講者 A：後段。';
    return route.fulfill({json:{ok:true,access:'public',host:false,actor:{name:'分享觀看'},workspace,reader:{
     topic:fields.settings.topic,record:'重點與決議\n## 核對\n摘要：整理兩段。\n對話依據（摘意）：\n- [3@0:02] 第3段講者 A：後段。',
     transcript,todos:[],segments:[{start:0,recordingIndex:1,speaker:'第1段講者 A',text:'現場錄音。'},{start:2000,recordingIndex:2,speaker:'第2段講者 A',text:'前段。'},{start:2000,recordingIndex:3,speaker:'第3段講者 A',text:'後段。'}]},
     audioRecordings:recordings.map((file,i)=>({index:i+1,filename:file.filename,url:path+'/audio?recording='+file.id}))}});
   }
   return route.fulfill({json:{ok:true,access:'member',host:true,canEdit:true,actor:{id:'synthetic-host',name:'主持人'},workspace,presence:[],types:[],sharing:{enabled:false,people:[],version:0}}});
  });
  await page.goto(base+path);
  await page.waitForFunction(()=>!document.querySelector('#recordFile')?.disabled);
  assert.equal(await page.locator('#inputTranscript,#generationSource,#saveTranscriptInput').count(),0);
  await page.click('#recordStart');
  await page.waitForFunction(()=>!document.querySelector('#recordStop').disabled);
  await page.waitForTimeout(process.env.MEETING_TEST_MIC_WAV?6500:1600);
  await page.click('#recordStop');
  await page.waitForFunction(()=>document.querySelector('#recordStop').disabled);
  assert.equal(puts.length,0);
  await page.locator('#recordFile').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
  await page.waitForFunction(()=>document.querySelector('#hubStatus').textContent.includes('支援的錄音格式'));
  assert.equal(await page.locator('#recordingList li').count(),0);
  const file=(i,name)=>({name,mimeType:'audio/wav',buffer:parts[i]});
  await page.locator('#recordFile').setInputFiles([file(0,'前半場.wav'),file(1,'後半場.wav')]);
  await page.getByText('後半場.wav',{exact:false}).first().waitFor();
  await page.locator('#recordFile').setInputFiles(file(2,'補充.wav'));
  await page.locator('#recordingList li').nth(3).waitFor();
  await page.locator('#recordingList li').nth(3).getByRole('button',{name:'往上'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#recordingList li')[2].textContent.includes('補充'));
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('#recordingList li').length===4);
  await page.click('#start');
  assert.equal(starts.length,0,'Unsaved collection must not start processing');
  await page.locator('#recordingList li').filter({hasText:'補充.wav'}).getByRole('button',{name:'移除'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#recordingList li').length===3);
  await page.click('#recordUpload');
  await page.waitForFunction(()=>document.querySelector('#recordStatus').textContent.includes('共 3 份'));
  assert.match(recordings[0].filename,/^會議錄音-/);
  assert(recordings[0].data.length>0);
  assert.deepEqual(recordings.slice(1).map(x=>x.filename),['前半場.wav','後半場.wav']);
  assert.equal(puts.length,3,'Lost finish response must not repeat a successful raw upload');
  if(process.env.MEETING_TEST_CAPTURE_DIR){
   const fs=require('node:fs'),path=require('node:path');
   fs.writeFileSync(path.join(process.env.MEETING_TEST_CAPTURE_DIR,recordings[0].filename),recordings[0].data);
  }
  await page.click('#start');
  await page.waitForSelector('#processingPanel:not([hidden])');
  assert.equal(starts[0].revision,revision);

  phase='published';
  await page.reload();
  const player=page.locator('#audio'),picker=page.getByRole('combobox',{name:'選擇播放錄音'});
  await picker.waitFor();
  for(const [i,file] of recordings.entries()){
   const segment=page.locator('#readingSegments button[data-recording="'+(i+1)+'"]');
   await segment.evaluate(el=>el.click());
   await page.waitForFunction(({id,at})=>{const player=document.querySelector('#audio');return player.src.includes(id)&&player.currentTime>=at&&!player.paused;},{id:file.id,at:i?2:0});
   assert.equal(await picker.inputValue(),String(i+1));
   assert.match(await player.getAttribute('src'),new RegExp(file.id));
  }
  await page.locator('#readingRecordText').evaluate(node=>{for(let el=node;el;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;node.querySelectorAll('details').forEach(details=>{details.open=true;});});
  await page.getByRole('button',{name:'播放錄音 3 · 0:02'}).click();
  for(const width of [360,390,768]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow at '+width);
  }
  shared=false;
  await page.waitForFunction(()=>!document.querySelector('#audio').hasAttribute('src'));
  assert.deepEqual(errors,[]);
  console.log('Chrome mixed recording: real MediaRecorder and two selected files saved together, reload recovery, upload retry, all three playable by timestamp, sharing revocation and mobile widths passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

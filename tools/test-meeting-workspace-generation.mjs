import assert from 'node:assert/strict';
import meetings from '../modules/meetings/index.js';
import {GenerationWait} from '../modules/meetings/generation-queue.js';
import {meetingSpeakerTools} from '../modules/meetings/workspace-speakers.js';
const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;let streams=0,uploads=0,writes=0,prompt='';
globalThis.setTimeout=(fn,ms,...args)=>originalTimer(fn,Math.min(ms,5),...args);
globalThis.fetch=async(url,init)=>{
 if(String(url).endsWith('/v2/upload')){uploads++;for await(const chunk of init.body)assert(chunk.length);return Response.json({upload_url:'https://fixture/audio'});}
 if(String(url).endsWith('/v2/transcript')){assert(init.body.includes('女'));return Response.json({id:'fixture-transcript'});}
 if(String(url).includes('/v2/transcript/'))return Response.json({status:'completed',utterances:[{speaker:'A',start:1000,end:2000,text:'請完成資料核對。'}]});
 throw Error('Unexpected external call');
};
meetings.init({assemblyKey:'synthetic',llm:{completeJson:async opts=>{prompt=opts.system;return {title:'測試',type:'會議',topics:[{title:'完成資料核對',summary:'同仁甲需核對資料，尚待完成。',status:'待處理',evidence:[{timestamp:'00:01',speaker:'同仁甲',text:'請完成資料核對。'}]}],minutes:[{heading:'資料',points:['請完成核對']}],highlights:['核對資料'],conclusions:['安排核對'],todos:[{content:'核對資料',owner:'同仁甲',due:'2026-10-25'}],nextMeeting:''};}},pushLineMessage:async()=>writes++,notionRequest:async()=>writes++});
try{
 const result=await meetings.generateWorkspace({tenant:{key:'fixture'},filename:'fixture.m4a',settings:{topic:'來源確認',date:'2026-10-10',type:'自訂類型',prompt:'比較各項目標與進度',speakers:[{name:'同仁甲',gender:'女',role:'主持人'}]},audioStreamFactory:async()=>{streams++;return {stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close();}})}},loadAudio:async()=>{throw Error('Should not buffer primary path');}});
 assert.equal(streams,1);assert.equal(uploads,1);assert.equal(writes,0);assert(prompt.includes('比較各項目標與進度'));assert(prompt.includes('2026-10-10'));assert(result.diarized.includes('同仁甲'));assert.equal(result.segments[0].start,1000);assert.equal(result.parsed.todos.length,1);assert.equal(result.parsed.topics.length,1);assert.equal(result.parsed.topics[0].evidence[0].timestamp,'00:01',result.diarized);assert(prompt.includes('不逐句列發言'));assert(prompt.lastIndexOf('會議記錄統一使用')>prompt.indexOf('本場類型與整理要求'));
 console.log('Workspace primary generation: stream the same archived recording, gender/name hints, custom prompt snapshot, actual meeting date, timestamped speaker transcript, and no premature Notion/LINE/task writes passed.');
 const pasted='[00:01] 同仁甲：請完成資料核對。\n[00:05] 同仁乙：週五前回報。';
 const textResult=await meetings.generateWorkspace({tenant:{key:'fixture'},settings:{topic:'文字來源',date:'2026-10-27',type:'工作會議',prompt:'保留依據',speakers:[]},inputTranscript:pasted,audioStreamFactory:async()=>{throw Error('Text must not request audio');},loadAudio:async()=>{throw Error('Text must not load audio');}});
 assert.equal(textResult.diarized,pasted);assert.equal(uploads,1);assert.equal(streams,1);assert.equal(writes,0);assert.equal(textResult.parsed.todos.length,1);
 console.log('Pasted transcript: preserves exact source and uses summary only, without audio upload, transcription, or publication.');

 const recordings=[{id:'first-audio',filename:'前半場.wav'},{id:'second-audio',filename:'後半場.m4a'}];
 const readFiles=[],summaryRequests=[];
 let providerUploads=0,submitted=0,secondPolls=0;
 globalThis.fetch=async(url,options)=>{
  url=String(url);
  if(url.endsWith('/v2/upload')){
   for await(const chunk of options.body)assert(chunk.length);
   return Response.json({upload_url:'https://fixture.invalid/'+ ++providerUploads});
  }
  if(url.endsWith('/v2/transcript')){
   assert(!Object.hasOwn(JSON.parse(options.body),'speakers_expected'),'Do not force whole-meeting headcount on each recording');
   return Response.json({id:'file-'+ ++submitted});
  }
  if(url.endsWith('/file-1')||url.endsWith('/file-2')){
   const isSecond=url.endsWith('/file-2');
   if(isSecond&&++secondPolls===1)return new Response('quota',{status:429});
   const phrase=isSecond?'星期五取消，核對工作改為星期一。':'暫定星期五核對資料。';
   const utterances=Array.from({length:5},(_,i)=>({speaker:'A',start:i*1000+2000,end:i*1000+2900,text:phrase+'驗證錄音順序及保留原文字。'.repeat(120)}));
   return Response.json({status:'completed',utterances});
  }
  throw Error('Unexpected provider request '+url);
 };
 meetings.init({assemblyKey:'synthetic',geminiKey:'synthetic',llm:{completeJson:async options=>{
  const content=options.userContent;
  const merged=options.system.includes('輸入為同一場會議依發生順序的各段摘要');
  summaryRequests.push({content,merged});
  const second=merged||content.includes('[2@0:02]');
  const index=second?2:1;
  const phrase=second?'星期一核對資料，星期五取消。':'暫定星期五核對資料。';
  return {title:'測試',type:'工作會議',topics:[{title:'核對時間',summary:phrase,status:second?'方向確認':'待確認',
   evidence:[{timestamp:index+'@0:02',speaker:'第'+index+'段講者 A',text:phrase}]}],todos:[{content:phrase,timestamp:index+'@0:02'}]};
 }}});
 let progress={},resultMulti,quotaErrors=0;
 const multiArgs={tenant:{key:'fixture'},settings:{topic:'多檔驗證',date:'2026-11-17',type:'工作會議',prompt:'整合決議',speakers:[]},
  confirmedSpeakerCount:2,recordings,audioForRecording:async file=>{
   readFiles.push(file.id);
   return {size:2,contentType:'audio/wav',stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close();}})};
  }};
 for(let attempt=0;attempt<8&&!resultMulti;attempt++){
  // Simulate a fresh generation worker reading its last durable checkpoint.
  const checkpoint={get value(){return progress;},async save(patch){progress=JSON.parse(JSON.stringify({...progress,...patch}));}};
  try{resultMulti=await meetings.generateWorkspace({...multiArgs,checkpoint});}
  catch(error){
   if(error.status===429){quotaErrors++;assert(progress.fileJobs['first-audio'].result);continue;}
   if(!(error instanceof GenerationWait))throw error;
  }
 }
 assert(resultMulti);
 assert.deepEqual(readFiles,recordings.map(x=>x.id));
 assert.equal(submitted,2);
 assert.equal(quotaErrors,1);
 assert.equal(summaryRequests.filter(x=>x.merged).length,1);
 assert.equal(resultMulti.parsed.todos.length,1);
 assert.equal(resultMulti.parsed.todos[0].timestamp,'2@0:02');
 assert.equal(resultMulti.parsed.topics[0].evidence[0].timestamp,'2@0:02');
 assert.match(resultMulti.parsed.topics[0].summary,/星期一/);
 assert.deepEqual(meetingSpeakerTools().segments(resultMulti.diarized).filter(x=>x.start===2000).map(x=>[x.recordingIndex,x.speaker]),
  [[1,'第1段講者 A'],[2,'第2段講者 A']]);
 progress={};
 const rerun=await meetings.generateWorkspace({...multiArgs,recordings:recordings.toReversed(),priorRecordingCache:resultMulti.recordingCache,
  checkpoint:{get value(){return progress;},async save(patch){progress={...progress,...patch};}}});
 assert.equal(providerUploads,2,'An accepted prior transcription can be reused after reorder');
 assert.equal(rerun.segments[0].recordingId,'second-audio');
 assert.match(rerun.diarized,/^\[1@0:02\] 第1段講者 A：星期五取消/);
 console.log('Multi-recording generation: separate transcription, resuming the second file after rate limit, reuse after reorder, final reconciliation, validated evidence and file-local speaker/time passed.');

 const primaryFetch=globalThis.fetch;
 let cutOff=true,fallbackUploads=0;
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/file-3'))return Response.json({status:'error'});
  if(String(url).endsWith('/upload/v1beta/files'))return new Response(null,{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/multiaudio-test'}});
  if(String(url).endsWith('/upload/multiaudio-test')){
   fallbackUploads++;
   for await(const chunk of options.body)assert(chunk.length);
   return Response.json({file:{name:'files/multiaudio-test',state:'ACTIVE',uri:'https://generativelanguage.googleapis.com/v1beta/files/multiaudio-test'}});
  }
  if(String(url).endsWith(':generateContent'))return Response.json({candidates:[{
   finishReason:cutOff?'MAX_TOKENS':'STOP',content:{parts:[{text:JSON.stringify({segments:[{speaker:'A',start:2000,end:3000,text:'取消星期五。'}]})}]}
  }]});
  return primaryFetch(url,options);
 };
 progress={};
 const fallbackArgs={...multiArgs,priorRecordingCache:{...resultMulti.recordingCache,files:[resultMulti.recordingCache.files[0]]},
  checkpoint:{get value(){return progress;},async save(patch){progress={...progress,...patch};}}};
 await assert.rejects(meetings.generateWorkspace(fallbackArgs),GenerationWait);
 await assert.rejects(meetings.generateWorkspace(fallbackArgs),/incomplete_fallback_transcript/);
 assert(!progress.fileJobs['second-audio'].result);
 cutOff=false;
 const fallbackResult=await meetings.generateWorkspace(fallbackArgs);
 assert.equal(fallbackUploads,1);
 assert.equal(fallbackResult.segments.at(-1).recordingIndex,2);
 assert.match(fallbackResult.warning,/錄音 2：使用備援逐字稿/);
 console.log('Per-file fallback: truncated transcript rejected, provider upload reused during retry, and fallback source warning preserved.');
}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}

import assert from 'node:assert/strict';
import meetings from '../modules/meetings/index.js';
const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;let streams=0,uploads=0,writes=0,prompt='';
globalThis.setTimeout=(fn,ms,...args)=>originalTimer(fn,Math.min(ms,5),...args);
globalThis.fetch=async(url,init)=>{
 if(String(url).endsWith('/v2/upload')){uploads++;for await(const chunk of init.body)assert(chunk.length);return Response.json({upload_url:'https://fixture/audio'});}
 if(String(url).endsWith('/v2/transcript')){assert(init.body.includes('女'));return Response.json({id:'fixture-transcript'});}
 if(String(url).includes('/v2/transcript/'))return Response.json({status:'completed',utterances:[{speaker:'A',start:1000,end:2000,text:'請完成資料核對。'}]});
 throw Error('Unexpected external call');
};
meetings.init({assemblyKey:'synthetic',llm:{completeJson:async opts=>{prompt=opts.system;return {title:'測試',type:'會議',minutes:[{heading:'資料',points:['請完成核對']}],highlights:['核對資料'],conclusions:['安排核對'],todos:[{content:'核對資料',owner:'同仁甲',due:'2026-10-25'}],nextMeeting:''};}},pushLineMessage:async()=>writes++,notionRequest:async()=>writes++});
try{
 const result=await meetings.generateWorkspace({tenant:{key:'fixture'},filename:'fixture.m4a',settings:{topic:'來源確認',date:'2026-10-10',type:'自訂類型',prompt:'比較各項目標與進度',speakers:[{name:'同仁甲',gender:'女',role:'主持人'}]},audioStreamFactory:async()=>{streams++;return {stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close();}})}},loadAudio:async()=>{throw Error('Should not buffer primary path');}});
 assert.equal(streams,1);assert.equal(uploads,1);assert.equal(writes,0);assert(prompt.includes('比較各項目標與進度'));assert(prompt.includes('2026-10-10'));assert(result.diarized.includes('同仁甲'));assert.equal(result.segments[0].start,1000);assert.equal(result.parsed.todos.length,1);
 console.log('Workspace primary generation: stream the same archived recording, gender/name hints, custom prompt snapshot, actual meeting date, timestamped speaker transcript, and no premature Notion/LINE/task writes passed.');
}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}

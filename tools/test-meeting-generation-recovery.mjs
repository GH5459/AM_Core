import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createMeetingWorkspace } from '../modules/meetings/workspace-service.js';
import { claimGeneration, generationCheckpoint } from '../modules/meetings/generation-queue.js';
import meetings from '../modules/meetings/index.js';

const pg=new PGlite();
const pool={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
for(const file of ['core/central-archive/schema.sql','modules/meetings/workspace.sql']) {
  await pg.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));
}
const host={id:'fixture-host',name:'合成主持人'};
const tenants=['primary','fallback'];
const rows=Object.fromEntries(tenants.map(tenant=>[tenant,{
  key:tenant,bot_id:tenant,source_kind:'group',source_id:tenant,enabled:true,connection_state:'active',
}]));
const bytes=128*1024*1024;
const duration=125*60;
const utterances=Array.from({length:125},(_,i)=>({
  speaker:i%2?'B':'A',start:i*60000,end:i*60000+5000,
  text:'這是合成字幕，須核對測試計畫和記錄。'.repeat(12),
}));
const responseBody={
  title:'合成會議',type:'工作會議',topics:[{title:'核對資料',summary:'請核對合成測試資料。',status:'待處理'}],todos:[],nextMeeting:'',
};
let uploads=0,submissions=0,primaryReads=0,fallbackReads=0,polls=0,geminiUploads=0,geminiReads=0,geminiSummaries=0;
const summaries=new Map();
const originalFetch=globalThis.fetch;
const initialRss=process.memoryUsage.rss();
let peakRss=initialRss;
function audio() {
  let left=bytes;
  return new ReadableStream({pull(controller){
    peakRss=Math.max(peakRss,process.memoryUsage.rss());
    if(left===0){controller.close();return;}
    const size=Math.min(left,64*1024);
    controller.enqueue(new Uint8Array(size));
    left-=size;
  }});
}
async function consume(body) {
  let count=0;
  for await(const chunk of body) {
    assert(chunk.length<=64*1024);
    count+=chunk.length;
  }
  assert.equal(count,bytes);
}
globalThis.fetch=async(url,opts)=>{
  url=String(url);
  if(url.includes('/drive/v3/files/')){
    if(url.includes('/primary?'))primaryReads++;else fallbackReads++;
    return new Response(audio(),{headers:{'content-type':'audio/wav','content-length':String(bytes)}});
  }
  if(url.endsWith('/v2/upload')){
    uploads++;
    await consume(opts.body);
    return Response.json({upload_url:'https://fixture.invalid/upload/'+uploads});
  }
  if(url.endsWith('/v2/transcript')){
    submissions++;
    const fallback=opts.headers.Authorization==='fixture-fallback';
    return Response.json({id:fallback?'failed-id':'saved-id'});
  }
  if(url.endsWith('/v2/transcript/saved-id')){
    polls++;
    return Response.json(polls===1?{status:'processing'}:{status:'completed',id:'saved-id',audio_duration:duration,utterances});
  }
  if(url.endsWith('/v2/transcript/failed-id'))return Response.json({status:'error'});
  if(url.endsWith('/upload/v1beta/files')){
    assert.equal(opts.headers['X-Goog-Upload-Protocol'],'resumable');
    assert.equal(Number(opts.headers['X-Goog-Upload-Header-Content-Length']),bytes);
    return new Response(null,{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/fixture'}});
  }
  if(url.endsWith('/upload/fixture')){
    geminiUploads++;
    assert.equal(opts.headers['X-Goog-Upload-Command'],'upload, finalize');
    assert.equal(Number(opts.headers['Content-Length']),bytes);
    await consume(opts.body);
    return Response.json({file:{name:'files/fixture',state:'PROCESSING'}});
  }
  if(url.endsWith('/v1beta/files/fixture')){
    geminiReads++;
    return Response.json(geminiReads===1?{state:'PROCESSING'}:{state:'ACTIVE',uri:'https://generativelanguage.googleapis.com/v1beta/files/fixture'});
  }
  if(url.endsWith(':generateContent')){
    geminiSummaries++;
    assert.match(opts.body,/file_uri/);
    assert(opts.body.length<100000);
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(responseBody)}]}}]});
  }
  throw Error('Unexpected URL '+url);
};
meetings.init({
  aiForTenant:tenant=>({assemblyKey:'fixture-'+tenant.key,geminiKey:'fixture'}),
  llm:{completeJson:async opts=>{
    const key=opts.userContent;
    const calls=(summaries.get(key)||0)+1;
    summaries.set(key,calls);
    if(summaries.size===2&&calls===1)throw Object.assign(Error('simulated 429'),{status:429,retryAfterMs:60_000});
    return responseBody;
  }},
});
function service(botId) {
  return createMeetingWorkspace({
    pool,botId,platform:{drive:{getAccessToken:async()=> 'synthetic'}},env:{},
    archive:{original:async()=>({file:{id:botId,size:bytes}})},
    meetingModule:meetings,getConversation:async()=>rows[botId],context:async()=>({tenant:{key:botId}}),logger:{warn(){}},
  });
}
async function activate(botId) {
  await pool.query("INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$1,'group',$1)",[botId]);
  const {store}=service(botId);
  const event={source:{userId:host.id},message:{id:'recording-'+botId,type:'audio'},timestamp:Date.now()};
  const newRow=await store.create(botId,event,'simulated.wav',host.name);
  await pool.query("UPDATE central_archive.meeting_workspaces SET state='setup' WHERE id=$1",[newRow.id]);
  const settings={...newRow.fields.settings,topic:'測試',speakers:[{name:'測試甲',gender:'',role:''},{name:'測試乙',gender:'',role:''}]};
  const edited=await store.edit(newRow.id,host,{field:'settings',value:settings,version:0});
  const first=await store.transition(newRow.id,host,'start',Number(edited.revision));
  const again=await store.transition(newRow.id,host,'start',Number(edited.revision));
  assert.equal(first.revision,again.revision);
  return {id:newRow.id,store};
}
async function run(botId) {
  const fresh=service(botId);
  await fresh.drain();
  await fresh.settle();
}
const expire=id=>pool.query("UPDATE central_archive.meeting_workspaces SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);

try {
  const primary=await activate('primary');
  const fallback=await activate('fallback');
  const interrupted=await claimGeneration(pool,primary.id);
  assert(interrupted);
  assert.equal(await claimGeneration(pool,fallback.id),undefined,'another tenant must stay queued');
  assert.equal(fallbackReads,0);
  await expire(primary.id);
  await run('primary');
  await assert.rejects(()=>generationCheckpoint(pool,interrupted).heartbeat(),/lease_lost/);
  let row=await primary.store.get(primary.id);
  assert.equal(row.receipt.generationProgress.assemblyId,'saved-id');
  assert.equal(row.receipt.generationLease,undefined);
  assert.equal(row.state,'processing');
  await expire(primary.id);
  await run('primary');
  await expire(primary.id);
  await run('primary');
  row=await primary.store.get(primary.id);
  assert.equal(row.state,'processing');
  assert.equal(row.receipt.generationProgress.stage,'summary');
  assert.equal(row.receipt.generationProgress.summaryParts.length,1);
  assert.equal(row.receipt.generationProgress.transcript.segments.length,125);
  assert(new Date(row.lease_until).getTime()-Date.now()>50_000,'429 retry must honor backoff');
  assert.equal(uploads,1);
  await expire(primary.id);
  await run('primary');
  row=await primary.store.get(primary.id);
  assert.equal(row.state,'review');
  assert.equal(row.source.message.id,'recording-primary');
  assert.equal(row.result.diagnostics.audioDurationSeconds,duration);
  assert.equal(row.result.segments.at(-1).start,124*60000);
  assert.equal(row.receipt.generationProgress,undefined);
  assert.equal([...summaries.values()][0],1);
  assert.equal([...summaries.values()][1],2);
  assert.equal(polls,2);
  assert.equal(primaryReads,1);

  await run('fallback');
  await expire(fallback.id);
  await run('fallback');
  row=await fallback.store.get(fallback.id);
  assert.equal(row.receipt.generationProgress.geminiFile.name,'files/fixture');
  const interruptedFallback=await expire(fallback.id).then(()=>claimGeneration(pool,fallback.id));
  assert(interruptedFallback);
  await expire(fallback.id);
  await run('fallback');
  row=await fallback.store.get(fallback.id);
  assert.equal(row.state,'review');
  assert.match(row.result.warning,/備援/);
  assert.equal(row.source.message.id,'recording-fallback');
  assert.equal(uploads,2);
  assert.equal(submissions,2);
  assert.equal(fallbackReads,2);
  assert.equal(geminiUploads,1);
  assert.equal(geminiReads,2);
  assert.equal(geminiSummaries,1);
  console.log('125-minute fixture, 128 MiB per streamed transfer. Primary, fallback, lease takeover, quota retry, no repeated successful stages. Peak RSS growth: '+Math.round((peakRss-initialRss)/1048576)+' MiB.');
} finally {
  globalThis.fetch=originalFetch;
  await pg.close();
}

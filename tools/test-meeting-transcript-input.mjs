import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createMeetingWorkspace} from '../modules/meetings/workspace-service.js';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const {pg,platform,row,key,host,guest}=f;
const pool={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
let generated,originalReads=0,pushes=0;const blocks=[];let createdPage;
const appPlatform={...platform,pushLineMessage:async()=>pushes++,meetingTaskIdentity:async()=>null};
const service=createMeetingWorkspace({pool,botId:row.bot_id,platform:appPlatform,archive:{original:async()=>{originalReads++;throw Error('Text-only meeting must not read audio');}},env:{AMCORE_MEETINGS_LIFF_ID:'123-test',AMCORE_MEETING_MANAGEMENT_ORIGIN:platform.publicBaseUrl},context:async()=>({tenant:{}}),tenantFor:()=>({config:{meetings:{liffId:'123-test'}}}),getConversation:async()=>row,ensureDatabase:async()=>({dbId:'synthetic'}),request:async(path,method='GET',body)=>{
 if(path.includes('/query'))return {results:[]};
 if(path==='/pages'){createdPage=body;return {id:'synthetic-text-page'};}
 if(path.includes('/children')&&method==='GET')return {results:blocks,has_more:false};
 if(path.includes('/children')&&method==='PATCH'){blocks.push(...body.children);return {};}
 throw Error('Unexpected Notion request');
},meetingModule:{generateWorkspace:async value=>{generated=value;return {parsed:{minutes:[{heading:'資料確認',points:['保留原文依據']}],todos:[],highlights:[],conclusions:[]},diarized:value.inputTranscript??'[0:00] 合成：來自錄音。',segments:[]};}},logger:{warn(){}}});
async function call(id,area,input,token='host'){
 const req=Readable.from([Buffer.from(JSON.stringify(input))]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:platform.publicBaseUrl};let status=200,result;
 const res={setHeader(){},writeHead(s){status=s;},get headersSent(){return false;},set statusCode(s){status=s;},end(s){result=JSON.parse(s);}};
 await service.handle(req,res,new URL(platform.publicBaseUrl+'/meetings/review/work/'+id+'/'+area));return {status,...result};
}
try{
 const created=await service.store.create(key,{source:{type:'group',groupId:row.source_id,userId:host},message:{id:'text-input-fixture',type:'text'},timestamp:Date.now()},'','合成主持人');const id=created.id;
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='setup',fields=jsonb_set(fields,'{settings,topic}','\"合成逐字稿會議\"'::jsonb) WHERE id=$1",[id]);
 appPlatform.loginContinuationActor=async()=>({id:host,name:'合成主持人'});
 const continued=await call(id,'hub',{action:'plan-read'},'');assert.equal(continued.status,200,JSON.stringify(continued));assert.equal(continued.host,true);
 appPlatform.loginContinuationActor=async()=>null;assert.equal((await call(id,'hub',{action:'plan-read'},'')).status,401);
 const hub=v=>call(id,'hub',v),work=v=>call(id,'api',v),text='[00:01] 同仁甲：請核對資料。\n[00:03] 同仁乙：明天回報。';
 const initial=await hub({action:'plan-read'});assert.equal(initial.status,200,JSON.stringify(initial));assert.equal(initial.plan??null,null,'Unscheduled meeting tools');
 const removed=await hub({action:'transcript-input',source:'transcript',text,version:0});
 assert.equal(removed.status,410);assert.match(removed.error,/已停止上傳逐字稿/);
 assert.equal((await call(id,'hub',{action:'transcript-input',source:'transcript',text,version:1},'guest')).status,403);
 const input={source:'transcript',text,version:1};
 await pg.query("UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{transcriptInput}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(input)]);
 let r=await service.store.get(id);const revision=Number(r.revision);
 const tools=await hub({action:'plan-read'});
 assert.equal(tools.status,200);assert(!JSON.stringify(tools).includes(text));assert(!Object.hasOwn(tools,'input'));
 const start=await work({action:'start',revision});
 assert.equal(start.status,503);assert.match(start.error,/請先保存至少一份錄音/);
 assert.equal((await service.store.get(id)).state,'setup');

 // An already-running job retains the snapshot it was started with.
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='processing',receipt=jsonb_set(receipt,'{generationSnapshot}',$2::jsonb) WHERE id=$1",[id,JSON.stringify({input})]);
 await service.drain();await service.settle();
 r=await service.store.get(id);
 assert.equal(r.state,'review');assert.equal(generated.inputTranscript,text);
 assert.equal(r.fields.transcript,text);assert.equal(r.receipt.generationSnapshot.input.version,1);assert.equal(originalReads,0);assert.equal(pushes,0);
 assert.equal((await work({action:'read'})).audioUrl,null);
 assert.equal((await work({action:'publish',revision:Number(r.revision)})).status,200);await service.drain();await service.settle();r=await service.store.get(id);
 assert.equal(r.state,'published');assert.equal(createdPage.properties['Google Drive 錄音'].url,null);assert.equal(createdPage.properties['錄音保存狀態'].rich_text[0].text.content,'逐字稿來源（無錄音）');assert(blocks.some(b=>JSON.stringify(b).includes('請核對資料')));assert.equal(originalReads,0);assert.equal(pushes,1,'One explicit synthetic publication');
 const edits=await pg.query("SELECT * FROM central_archive.meeting_workspace_edits WHERE workspace_id=$1 AND field='transcript_input'",[id]);assert.equal(edits.rows.length,0);assert.deepEqual(r.receipt.transcriptInput,input);
 await pg.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=true WHERE id=$1',[id]);const shared=await call(id,'api',{action:'read'},'outsider');assert.equal(shared.status,200);assert.equal(shared.audioUrl,null);assert(!JSON.stringify(shared).includes('transcriptInput'));
 const newMeeting=await service.store.create(key,{source:{type:'group',groupId:row.source_id,userId:host},message:{id:'old-draft-with-audio-fixture',type:'audio'},timestamp:Date.now()},'new.wav','合成主持人');
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='setup',fields=jsonb_set(fields,'{settings,topic}',to_jsonb('合成音檔會議'::text)),receipt=$2::jsonb WHERE id=$1",
  [newMeeting.id,JSON.stringify({transcriptInput:input,hubAudio:{id:'synthetic-audio'},linkSent:true})]);
 const current=await service.store.get(newMeeting.id);
 assert.equal((await call(newMeeting.id,'api',{action:'start',revision:Number(current.revision)})).status,200);
 await service.drain();await service.settle();
 const finished=await service.store.get(newMeeting.id);
 assert.equal(finished.state,'review');
 assert.equal(generated.inputTranscript,null);
 assert.equal(finished.receipt.generationSnapshot.input.source,'audio');
 assert.deepEqual(finished.receipt.transcriptInput,input);
 console.log('Transcript intake removed: old writes rejected, draft requires audio, stale transcript is not used, original text and in-progress/published results retained.');
}finally{await pg.close();}

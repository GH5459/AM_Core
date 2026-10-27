import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createMeetingWorkspace} from '../modules/meetings/workspace-service.js';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const {pg,platform,row,key,host,guest}=f;
const pool={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
let generated,originalReads=0,pushes=0;const blocks=[];let createdPage;
const service=createMeetingWorkspace({pool,botId:row.bot_id,platform:{...platform,pushLineMessage:async()=>pushes++,meetingTaskIdentity:async()=>null},archive:{original:async()=>{originalReads++;throw Error('Text-only meeting must not read audio');}},env:{AMCORE_MEETINGS_LIFF_ID:'123-test',AMCORE_MEETING_MANAGEMENT_ORIGIN:platform.publicBaseUrl},context:async()=>({tenant:{}}),tenantFor:()=>({config:{meetings:{liffId:'123-test'}}}),getConversation:async()=>row,ensureDatabase:async()=>({dbId:'synthetic'}),request:async(path,method='GET',body)=>{
 if(path.includes('/query'))return {results:[]};
 if(path==='/pages'){createdPage=body;return {id:'synthetic-text-page'};}
 if(path.includes('/children')&&method==='GET')return {results:blocks,has_more:false};
 if(path.includes('/children')&&method==='PATCH'){blocks.push(...body.children);return {};}
 throw Error('Unexpected Notion request');
},meetingModule:{generateWorkspace:async value=>{generated=value;return {parsed:{minutes:[{heading:'資料確認',points:['保留原文依據']}],todos:[],highlights:[],conclusions:[]},diarized:value.inputTranscript,segments:[]};}},logger:{warn(){}}});
async function call(id,area,input,token='host'){
 const req=Readable.from([Buffer.from(JSON.stringify(input))]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:platform.publicBaseUrl};let status=200,result;
 const res={setHeader(){},writeHead(s){status=s;},get headersSent(){return false;},set statusCode(s){status=s;},end(s){result=JSON.parse(s);}};
 await service.handle(req,res,new URL(platform.publicBaseUrl+'/meetings/review/work/'+id+'/'+area));return {status,...result};
}
try{
 const created=await service.store.create(key,{source:{type:'group',groupId:row.source_id,userId:host},message:{id:'text-input-fixture',type:'text'},timestamp:Date.now()},'','合成主持人');const id=created.id;
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='setup',fields=jsonb_set(fields,'{settings,topic}','\"合成逐字稿會議\"'::jsonb) WHERE id=$1",[id]);
 const hub=v=>call(id,'hub',v),work=v=>call(id,'api',v),text='[00:01] 同仁甲：請核對資料。\n[00:03] 同仁乙：明天回報。';
 const initial=await hub({action:'plan-read'});assert.equal(initial.status,200,JSON.stringify(initial));assert.equal(initial.plan??null,null,'Unscheduled meeting tools');
 const saved=await hub({action:'transcript-input',source:'transcript',text,version:0});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.input.text,text);
 assert.equal((await hub({action:'transcript-input',source:'transcript',text:'stale',version:0})).status,409);
 assert.equal((await call(id,'hub',{action:'transcript-input',source:'transcript',text,version:1},'guest')).status,403);
 assert.equal((await hub({action:'transcript-input',source:'transcript',text:' ',version:1})).status,400);
 assert.equal((await hub({action:'transcript-input',source:'transcript',text:'a'.repeat(300001),version:1})).status,400);
 let r=await service.store.get(id);const revision=Number(r.revision);
 assert.equal((await work({action:'start',revision:revision-1})).status,409);
 assert.equal((await work({action:'start',revision})).status,200);await service.drain();await service.settle();
 r=await service.store.get(id);assert.equal(r.state,'review');assert.equal(generated.inputTranscript,text);assert.equal(r.fields.transcript,text);assert.equal(r.receipt.generationSnapshot.input.version,1);assert.equal(originalReads,0);assert.equal(pushes,0);assert.equal((await hub({action:'transcript-input',source:'audio',text,version:1})).status,409);
 assert.equal((await work({action:'read'})).audioUrl,null);
 assert.equal((await work({action:'publish',revision:Number(r.revision)})).status,200);await service.drain();await service.settle();r=await service.store.get(id);
 assert.equal(r.state,'published');assert.equal(createdPage.properties['Google Drive 錄音'].url,null);assert.equal(createdPage.properties['錄音保存狀態'].rich_text[0].text.content,'逐字稿來源（無錄音）');assert(blocks.some(b=>JSON.stringify(b).includes('請核對資料')));assert.equal(originalReads,0);assert.equal(pushes,1,'One explicit synthetic publication');
 const edits=await pg.query("SELECT * FROM central_archive.meeting_workspace_edits WHERE workspace_id=$1 AND field='transcript_input'",[id]);assert.equal(edits.rows.length,1);assert.equal(edits.rows[0].after_value.text,text);
 await pg.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=true WHERE id=$1',[id]);const shared=await call(id,'api',{action:'read'},'outsider');assert.equal(shared.status,200);assert.equal(shared.audioUrl,null);assert(!JSON.stringify(shared).includes('transcriptInput'));
 console.log('Transcript intake: versioned source evidence, host-only writes, stale/oversized/empty refusal, immutable generation snapshot, text-only publication/readback and no audio access passed.');
}finally{await pg.close();}




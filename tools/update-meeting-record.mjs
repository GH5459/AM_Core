// Explicit, single-meeting maintenance through the normal revision queue.
// All source snapshots and input content must remain outside the repository.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {createWorkspaceStore} from '../modules/meetings/workspace-store.js';
import {checkField,todos} from '../modules/meetings/workspace-model.js';
import {parseDecisionRecord,DECISION_RECORD_CONTRACT} from '../modules/meetings/decision-record.js';
const [phase,envFile,connectionFile,id,folder,recordFile]=process.argv.slice(2);
assert(['snapshot','apply','verify'].includes(phase));assert(/^[a-f0-9]{64}$/.test(id||''));
const repo=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
for(const file of [envFile,connectionFile,folder,...recordFile?[recordFile]:[]]){assert(path.isAbsolute(file));const relative=path.relative(repo,path.resolve(file));assert(relative.startsWith('..')||path.isAbsolute(relative),'Private inputs and snapshots cannot be stored in AMCore');}
const env=parseEnv(fs.readFileSync(envFile,'utf8')),pool=new Pool({connectionString:fs.readFileSync(connectionFile,'utf8').trim(),ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:15000}),store=createWorkspaceStore(pool);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v),hash=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
const protectedState=r=>({fields:Object.fromEntries(Object.entries(r.fields).filter(([key])=>key!=='record')),id:r.id,conversation_key:r.conversation_key,message_id:r.message_id,source:r.source,filename:r.filename,host_id:r.host_id,result:r.result,sharing_enabled:r.sharing_enabled,shared_people:r.shared_people,sharing_version:r.sharing_version,notionId:r.receipt.notionId});
const write=(name,value)=>fs.writeFileSync(path.join(folder,name+'.private.json'),JSON.stringify(value,null,2));
try{
 fs.mkdirSync(folder,{recursive:true});const row=await store.get(id);assert(row?.state==='published','Select an already published meeting');
 const conversation=(await pool.query('SELECT * FROM central_archive.conversations WHERE key=$1',[row.conversation_key])).rows[0];assert.equal(conversation.bot_id,env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID);assert(conversation.enabled!==false);assert(!['left','blocked'].includes(conversation.connection_state));
 const sourceKind=conversation.source_kind,sourceId=conversation.source_id;
 if(sourceKind==='user')assert.equal(sourceId,row.host_id);
 const memberUrl=sourceKind==='user'?'/v2/bot/profile/'+row.host_id:`/v2/bot/${sourceKind}/${sourceId}/member/${row.host_id}`;
 const response=await fetch('https://api.line.me'+memberUrl,{headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});assert(response.ok,'Current host membership could not be verified');assert.equal((await response.json()).userId,row.host_id);
 const snapshotFile=path.join(folder,'before.private.json');
 if(phase==='snapshot'){
  assert(!fs.existsSync(snapshotFile),'Never overwrite the original snapshot');write('before',{workspace:row,protectedHash:hash(protectedState(row)),fieldsHash:hash(row.fields)});
  console.log(JSON.stringify({snapshot:true,revision:Number(row.revision),todos:todos(row.fields).length,transcriptCharacters:row.fields.transcript.length,published:true}));
 }else{
  const before=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));assert.equal(row.id,before.workspace.id);assert.equal(hash(protectedState(row)),before.protectedHash,'Source, tasks, transcript, sharing or other protected content changed');
  const record=fs.readFileSync(recordFile,'utf8').replace(/\r\n/g,'\n');checkField('record',record);assert(parseDecisionRecord(record)?.topics.length,'The approved merged format is required');
  if(phase==='apply'){
   assert.equal(Number(row.revision),Number(before.workspace.revision),'Meeting version changed; review the latest source');assert.equal(hash(row.fields),before.fieldsHash,'Meeting content changed; review instead of overwriting');
   const health=await(await fetch(env.AMCORE_PUBLIC_BASE_URL+'/health',{signal:AbortSignal.timeout(20000)})).json();assert.equal(health.conversationMeetings?.workspace?.recordFormat,DECISION_RECORD_CONTRACT,'Deploy and verify the reader before changing the official record');
   const pending=(await pool.query("SELECT revision FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending'",[id])).rows;assert.equal(pending.length,0,'An existing revision must finish first');
   await store.revise(id,{id:row.host_id,name:row.host_name+'（本人授權格式整理）'},{...row.fields,record},Number(row.revision),row.receipt.ownerNames||{});
   write('queued',{baseRevision:Number(row.revision),revision:Number(row.revision)+1,recordHash:hash(record),at:new Date().toISOString()});console.log(JSON.stringify({queued:true,revision:Number(row.revision)+1,todosPreserved:todos(row.fields).length,transcriptAndAudioPreserved:true}));
  }else{
   assert.equal(row.fields.record,record,'The formal reader has not finished synchronizing');const queued=JSON.parse(fs.readFileSync(path.join(folder,'queued.private.json'),'utf8'));
   const revision=(await pool.query("SELECT state,receipt FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND revision=$2",[id,queued.revision])).rows[0];assert.equal(revision?.state,'applied');assert(revision.receipt.notionSaved);
   const result={verified:true,revision:Number(row.revision),topics:parseDecisionRecord(record).topics.length,todos:todos(row.fields).length,originalTasksTranscriptAudioSourceSharingAndNotionPagePreserved:true};write('verified',result);console.log(JSON.stringify(result));
  }
 }
}finally{await pool.end();}

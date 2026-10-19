// Isolated synthetic benchmark: actual PostgreSQL/Drive, no production meetings.
// Config and all outputs MUST live outside the repository. Never log credentials.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {createDrive} from '../core/drive.js';
const cfg=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert(path.isAbsolute(cfg.output)&&!path.resolve(cfg.output).startsWith(path.resolve('.')),'Use a private output folder');
fs.mkdirSync(cfg.output,{recursive:true});
const env=parseEnv(fs.readFileSync(cfg.envFile,'utf8')),u=new URL(fs.readFileSync(cfg.databaseFile,'utf8').trim());if(!u.hostname.includes('.'))u.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const realPool=new Pool({connectionString:u.href,ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:15000}),realFetch=globalThis.fetch;
const suffix=crypto.randomBytes(6).toString('hex'),schema='bench_meeting_audio_'+suffix;assert(/^bench_meeting_audio_[a-f0-9]{12}$/.test(schema));
const translate=s=>s.replaceAll('central_archive.',schema+'.').replaceAll('SCHEMA IF NOT EXISTS central_archive','SCHEMA IF NOT EXISTS '+schema);
let sqlCount=0;const query=(s,...a)=>{sqlCount++;return realPool.query(translate(s),...a);};
const pool={query,connect:async()=>{const db=await realPool.connect();return {query:(s,...a)=>{sqlCount++;return db.query(translate(s),...a);},release:()=>db.release()};}};
const drive=createDrive({clientId:env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:env.GOOGLE_OAUTH_CLIENT_SECRET,refreshToken:env.GOOGLE_OAUTH_REFRESH_TOKEN,logger:{warn(){}}});
const bot='U'+'b'.repeat(32),host='U'+'1'.repeat(32),key='a'.repeat(64),group='C'+'c'.repeat(32),results=[],createdFiles=[];
let identityCalls=0,lineCalls=0,folder,server;
globalThis.fetch=async(url,o)=>{if(String(url).startsWith('https://api.line.me/oauth2/v2.1/verify')){lineCalls++;return Response.json({client_id:'123',expires_in:3600});}if(String(url)==='https://api.line.me/v2/profile'){lineCalls++;return Response.json({userId:host,displayName:'Synthetic benchmark'});}return realFetch(url,o);};
try{
 for(const file of ['core/central-archive/schema.sql','modules/meetings/conversations.sql','modules/meetings/workspace.sql'])await query(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 folder=await drive.ensureFolder('AM-synthetic-upload-benchmark-'+suffix,env.AMCORE_CENTRAL_ARCHIVE_DRIVE_ROOT_FOLDER_ID);assert(folder);
 await query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id,drive_folder_id) VALUES($1,$2,$3,$4,$5)',[key,bot,'group',group,folder]);await query("INSERT INTO central_archive.meeting_settings(conversation_key,enabled,connection_state) VALUES($1,true,'active')",[key]);
 const row={key,bot_id:bot,source_kind:'group',source_id:group,drive_folder_id:folder,enabled:true,connection_state:'active'},platform={publicBaseUrl:'http://127.0.0.1',publicLinkSecret:'synthetic-benchmark-only',drive,meetingShareIdentity:async()=>{identityCalls++;return {account:'111',name:'Synthetic',tenantKey:'fixture'};},lineGet:async()=>{lineCalls++;return {userId:host};}};
 const old=(await import(pathToFileURL(path.join(cfg.baseline,'modules/meetings/workspace-service.js')).href)).createMeetingWorkspace;
 const newer=(await import('../modules/meetings/workspace-service.js')).createMeetingWorkspace;
 function instance(factory){return factory({pool,botId:bot,platform,env:{AMCORE_MEETINGS_LIFF_ID:'123-test'},archive:{original:async()=>null},context:async()=>({tenant:{}}),tenantFor:()=>({config:{meetings:{liffId:'123-test'}}}),getConversation:async()=>row,request:async()=>{throw Error('Benchmark must not publish');},logger:{warn(){}},meetingModule:{}});}
 const services={old:instance(old),new:instance(newer)};
 server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');const service=url.searchParams.get('runtime')==='old'?services.old:services.new;await service.handle(req,res,url);}catch{res.writeHead(500);res.end('{}');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;platform.publicBaseUrl=base;
 // Valid 16kHz mono PCM WAV. The exact bytes are reused for all four cases.
 const audio=Buffer.alloc(16*1024*1024+44);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);for(let i=44;i<audio.length;i+=2)audio.writeInt16LE(Math.round(3000*Math.sin((i-44)/2*2*Math.PI*440/16000)),i);
 const digest=crypto.createHash('sha256').update(audio).digest('hex'),md5=crypto.createHash('md5').update(audio).digest('hex');fs.writeFileSync(cfg.output+'/synthetic-same-audio.wav',audio);
 for(const [runtime,kind]of (cfg.cases||[['old','file'],['new','file'],['new','recorder'],['old','recorder']])){
  const id=crypto.createHash('sha256').update(suffix+runtime+kind).digest('hex'),uploadId='benchmark-'+suffix+'-'+runtime+'-'+kind;
  await query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,source,filename,state,fields,receipt) VALUES($1,$2,$3,$4,'Synthetic','{}','','setup','{"settings":{"topic":"Synthetic benchmark"}}','{}')`,[id,key,uploadId,host]);await query(`INSERT INTO central_archive.meeting_plans(workspace_id,tenant_key,topic) VALUES($1,'fixture','Synthetic benchmark')`,[id]);
  let httpCount=0,wireBytes=0;const endpoint=base+'/meetings/review/work/'+id+'/hub?runtime='+runtime;
  async function call(v,binary,offset){const body=binary||JSON.stringify(v);httpCount++;wireBytes+=Buffer.byteLength(body);const r=await realFetch(endpoint+(binary?'&uploadId='+uploadId+'&offset='+offset:''),{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':binary?'application/octet-stream':'application/json',...binary?{'X-Audio-SHA256':crypto.createHash('sha256').update(binary).digest('hex')}:{}},body});const result=await r.json();assert(r.ok,JSON.stringify({status:r.status,error:result.error,action:v.action||'binary',offset,runtime,kind}));return result;}
  sqlCount=identityCalls=lineCalls=0;const start=performance.now();let transferMs,finishMs;
  if(runtime==='old'){
   await call({action:'audio-begin',uploadId,mime:'audio/wav',filename:'synthetic-same-audio.wav'});const size=kind==='file'?2097152:320000;let parts=0;for(let at=0;at<audio.length;at+=size){await call({action:'audio-part',uploadId,part:parts++,bytes:audio.subarray(at,at+size).toString('base64')});}
   transferMs=performance.now()-start;const end=performance.now();await call({action:'audio-finish',uploadId,parts});finishMs=performance.now()-end;
  }else{
   await call({action:'audio-fast-begin',uploadId,mime:'audio/wav',filename:'synthetic-same-audio.wav',total:audio.length,manifest:digest});for(let at=0;at<audio.length;at+=8388608)await call({uploadId},audio.subarray(at,at+8388608),at);
   transferMs=performance.now()-start;const end=performance.now();await call({action:'audio-fast-finish',uploadId});finishMs=performance.now()-end;
  }
  const result={runtime,kind,totalSeconds:(performance.now()-start)/1000,transferSeconds:transferMs/1000,finalizeSeconds:finishMs/1000,httpRequests:httpCount,httpBodyBytes:wireBytes,databaseQueries:sqlCount,identityLookups:identityCalls,lineChecks:lineCalls};
  const file=(await query('SELECT receipt FROM central_archive.meeting_workspaces WHERE id=$1',[id])).rows[0].receipt.hubAudio;assert(file?.id);createdFiles.push(file.id);const token=await drive.getAccessToken(),meta=await(await realFetch('https://www.googleapis.com/drive/v3/files/'+file.id+'?fields=id,size,md5Checksum,parents,permissions',{headers:{Authorization:'Bearer '+token}})).json();assert.equal(Number(meta.size),audio.length);assert.equal(meta.md5Checksum,md5);assert(meta.parents.includes(folder));assert(!meta.permissions?.some(p=>p.type==='anyone'));results.push(result);fs.writeFileSync(cfg.output+'/results.private.json',JSON.stringify({at:new Date().toISOString(),bytes:audio.length,sha256:digest,method:'Same local HTTP client, same actual remote PostgreSQL and Google Drive, isolated synthetic schema/folder, synthetic LINE/personnel authorization (no latency added), sequential transfers; preparation/preview not included',results},null,2));console.log(JSON.stringify(result));
 }
}finally{
 if(server)await new Promise(r=>server.close(r));globalThis.fetch=realFetch;
 // Only this run's synthetic artifacts. Google trash is recoverable.
 const token=await drive.getAccessToken();for(const id of [...createdFiles,...folder?[folder]:[]]){const r=await realFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id),{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{"trashed":true}'});assert(r.ok,'Synthetic cleanup incomplete');}
 await realPool.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await realPool.end();
}

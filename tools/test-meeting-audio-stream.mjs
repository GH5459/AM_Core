import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable,Writable} from 'node:stream';
import {once} from 'node:events';
process.env.MEETING_HUB_PREVIEW='1';
const originalFetch=globalThis.fetch;
const {fixture}=await import('./test-meeting-hub.mjs');
const {pg,service,platform,row,key,host}=fixture,legacyFetch=globalThis.fetch;
const block=8*1024*1024,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sessions=new Map(),files=new Map();let serial=0,lose=false,partial=false,identityCalls=0,deny=false;
const originalIdentity=platform.meetingShareIdentity;platform.meetingShareIdentity=async(...a)=>{identityCalls++;return deny?null:originalIdentity(...a);};
globalThis.fetch=async(url,o={})=>{
 url=String(url);
 if(url.includes('files/generateIds'))return Response.json({ids:['fixture-stream-'+(++serial)]});
 if(url.includes('/upload/drive/v3/files?')){const meta=JSON.parse(o.body),session='https://www.googleapis.com/upload/drive/v3/session/'+serial;sessions.set(session,{meta,size:Number(o.headers['X-Upload-Content-Length']),bytes:Buffer.alloc(0),puts:0});return new Response(null,{status:200,headers:{location:session}});}
 if(sessions.has(url)){
  const s=sessions.get(url),range=o.headers['Content-Range'];if(s.expired)return new Response(null,{status:404});
  if(range.startsWith('bytes */'))return s.bytes.length===s.size?Response.json(s.meta):new Response(null,{status:308,headers:s.bytes.length?{range:'bytes=0-'+(s.bytes.length-1)}:{}});
  const m=range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);assert(m);assert.equal(Number(m[1]),s.bytes.length);const bytes=Buffer.from(o.body);assert.equal(Number(m[2])+1-Number(m[1]),bytes.length);s.puts++;
  if(partial){partial=false;s.bytes=Buffer.concat([s.bytes,bytes.subarray(0,262144)]);return new Response(null,{status:503});}
  s.bytes=Buffer.concat([s.bytes,bytes]);if(s.bytes.length===s.size)files.set(s.meta.id,{...s.meta,size:String(s.size),trashed:false});
  if(lose){lose=false;throw Error('synthetic lost response');}
  return s.bytes.length===s.size?Response.json(s.meta):new Response(null,{status:308,headers:{range:'bytes=0-'+(s.bytes.length-1)}});
 }
 if(url.includes('/drive/v3/files/fixture-stream-')){
  const id=new URL(url).pathname.split('/').pop();
  if(url.includes('alt=media')){
   const source=[...sessions.values()].find(item=>item.meta.id===id);
   return source?new Response(source.bytes,{status:206,headers:{'content-type':'audio/wav'}}):new Response(null,{status:404});
  }
  return files.has(id)?Response.json(files.get(id)):new Response(null,{status:404});
 }
 return legacyFetch(url,o);
};
const id='d'.repeat(64),fields={settings:{topic:'合成速度測試',date:'2026-10-19',type:'工作會議',prompt:'',speakers:[]},record:'',todos:[],transcript:''};
await pg.query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,source,filename,state,fields,receipt) VALUES($1,$2,'stream-fixture',$3,'合成主持人','{}','','setup',$4::jsonb,'{}')`,[id,key,host,JSON.stringify(fields)]);
await pg.query(`INSERT INTO central_archive.meeting_plans(workspace_id,tenant_key,topic) VALUES($1,'fixture','合成速度測試')`,[id]);
async function call(v,{token='host',bytes,offset=0,hash,origin='https://meeting.example.test',endpoint='hub'}={}){
 let status=200,output;const req=Readable.from([bytes||Buffer.from(JSON.stringify(v))]);req.method='POST';req.headers={...token?{authorization:'Bearer '+token}:{},origin,...bytes?{'content-type':'application/octet-stream','x-audio-sha256':hash||sha(bytes)}:{'content-type':'application/json'}};
 const res={writeHead(v){status=v;},setHeader(){},get headersSent(){return false;},set statusCode(v){status=v;},get statusCode(){return status;},end(s){output=JSON.parse(s);}};
 const url=new URL('https://meeting.example.test/meetings/review/work/'+id+'/'+endpoint);if(bytes){url.searchParams.set('uploadId',v.uploadId);url.searchParams.set('offset',String(offset));if(v.stage)url.searchParams.set('stage','1');}
 await service.handle(req,res,url);return {status,...output};
}
const uploadId='synthetic-stream-main',audio=Buffer.alloc(block*2+1048576,71),input={action:'audio-fast-begin',uploadId,mime:'audio/wav',filename:'synthetic.wav',total:audio.length,manifest:sha(audio)};
try{
 let r=await call(input);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.transport,'drive-binary-resume-v2');assert.equal(r.offset,0);assert(!JSON.stringify(r).includes('session/'));
 assert.equal((await call({...input,total:input.total+1})).status,409);
 assert.equal((await call(input,{token:'guest'})).status,403);
 assert.equal((await call(input,{origin:'https://other.example'})).status,403);
 identityCalls=0;lose=true;r=await call({uploadId},{bytes:audio.subarray(0,block)});assert.equal(r.status,503);assert.equal(identityCalls,1,'One current identity lookup per raw request');
 r=await call({uploadId},{bytes:audio.subarray(0,block)});assert.equal(r.offset,block);assert.equal([...sessions.values()][0].puts,1,'No duplicate remote PUT after lost response');
 partial=true;r=await call({uploadId},{bytes:audio.subarray(block,block*2),offset:block});assert.equal(r.status,503);
 r=await call({uploadId},{bytes:audio.subarray(block,block*2),offset:block});assert.equal(r.offset,block*2,'Resume after partially accepted chunk');
 assert.equal((await call({uploadId},{bytes:Buffer.alloc(block,72),offset:block})).status,409,'Reject conflicting acknowledged chunk');
 deny=true;assert.equal((await call({uploadId},{bytes:audio.subarray(block*2),offset:block*2})).status,403);deny=false;
 r=await call({uploadId},{bytes:audio.subarray(block*2),offset:block*2});assert.equal(r.offset,audio.length);
 assert.deepEqual([...sessions.values()][0].bytes,audio);
 r=await call({action:'audio-fast-finish',uploadId});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.audio,true);
 const first=await service.store.get(id);r=await call({action:'audio-fast-finish',uploadId});assert.equal(r.status,200);assert.equal((await service.store.get(id)).revision,first.revision);
 assert.equal((await call(input)).saved,true);assert.equal((await pg.query('SELECT count(*) AS n FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1',[id])).rows[0].n,0,'No raw audio rows for new transport');
 // Expired incomplete sessions restart using the same reserved file ID.
 const exp={...input,uploadId:'synthetic-stream-expiry'};await call(exp);const expired=[...sessions.values()].at(-1);expired.expired=true;const oldId=expired.meta.id;serial++;r=await call(exp);assert.equal(r.offset,0);assert.equal([...sessions.values()].at(-1).meta.id,oldId);
 // A late upload cannot replace a different recording saved after it began.
 const late={...input,uploadId:'synthetic-stream-late',total:1};await call(late);await call({uploadId:late.uploadId},{bytes:Buffer.from('G')});await pg.query(`UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{hubAudio}','{"id":"newer-file"}') WHERE id=$1`,[id]);assert.equal((await call({action:'audio-fast-finish',uploadId:late.uploadId})).status,409);
 // Pending legacy uploads retain their original bytes and old route.
 const old={...input,uploadId:'synthetic-legacy-keep'};await call({...old,action:'audio-begin'});await call({action:'audio-part',uploadId:old.uploadId,part:0,bytes:Buffer.from('legacy').toString('base64')});assert.equal((await call(old)).transport,'legacy');assert.equal((await pg.query('SELECT count(*) AS n FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1',[id])).rows[0].n,1);
 assert.equal((await call({...input,uploadId:'synthetic-limit-test',total:536870913})).status,400);
 console.log('Binary Drive uploads: raw bytes, current host/identity/origin, one identity lookup/request, digest conflicts, lost/partial responses, expired session, final verification, replay, newer-recording protection and untouched legacy chunks passed.');

 // Build a new ordered collection without changing the original single-file receipt.
 await pg.query(`UPDATE central_archive.meeting_workspaces SET receipt=$2::jsonb WHERE id=$1`,[id,JSON.stringify(first.receipt)]);
 const append=async(name,contents)=>{
  const bytes=Buffer.from(contents),uploadId='synthetic-multi-'+name;
  const init={action:'audio-fast-begin',uploadId,mime:'audio/wav',filename:name+'.wav',total:bytes.length,manifest:sha(bytes),stage:true};
  assert.equal((await call(init)).status,200);
  assert.equal((await call({uploadId,stage:true},{bytes})).offset,bytes.length);
  assert.equal((await call({action:'audio-fast-finish',uploadId,stage:true})).saved,true);
  assert.equal((await call(init)).saved,true);
  return uploadId;
 };
 const b=await append('second','second recording'),c=await append('third','third recording'),duplicate=await append('duplicate','second recording');
 const base=await call({action:'plan-read'});
 assert.deepEqual(base.recordings.map(x=>x.id),['original']);
 assert.equal((await call({action:'audio-list-save',ids:['original',b],revision:base.audioRevision-1})).status,409);
 assert.equal((await call({action:'audio-list-save',ids:['original',b],revision:base.audioRevision},{token:'guest'})).status,403);
 assert.equal((await call({action:'audio-list-save',ids:[b,duplicate],revision:base.audioRevision})).status,409);
 assert.equal((await call({action:'audio-list-save',ids:[late.uploadId],revision:base.audioRevision})).status,409,'An unfinished upload must not enter the collection');
 const list={action:'audio-list-save',ids:[c,'original',b],revision:base.audioRevision};
 const confirmed=await call(list);
 assert.equal(confirmed.status,200,JSON.stringify(confirmed));
 assert.deepEqual(confirmed.recordings.map(x=>x.id),list.ids);
 assert.equal((await call(list)).audioRevision,confirmed.audioRevision,'Replay after a lost list response');
 const savedRow=await service.store.get(id);
 assert.deepEqual(savedRow.receipt.hubAudio,first.receipt.hubAudio);
 assert.equal((await call({action:'audio-fast-finish',uploadId:b})).status,409,'Old client cannot replace a collection');
 assert.equal((await call({action:'read'},{endpoint:'api',token:''})).status,401,'Draft is private');

 await pg.query(`UPDATE central_archive.meeting_workspaces SET state='published',sharing_enabled=true,shared_people=$2::jsonb,
   receipt=jsonb_set(receipt,'{generationSnapshot}',jsonb_build_object('recordings',receipt->'audioManifest')) WHERE id=$1`,
  [id,JSON.stringify([{tenantKey:'fixture',account:'222',name:'指定同仁'}])]);
 const publicRead=await call({action:'read'},{endpoint:'api',token:''});
 assert.equal(publicRead.access,'public');
 assert.deepEqual(publicRead.audioRecordings.map(x=>x.filename),['third.wav','synthetic.wav','second.wav']);
 const named=await call({action:'read'},{endpoint:'api',token:'guest'});
 assert.equal(named.access,'recipient');
 assert.equal(named.audioRecordings.length,3);
 async function play(path){
  const req=Readable.from([]);req.method='GET';req.headers={range:'bytes=0-'};
  const output=[],response=new Writable({write(chunk,encoding,done){output.push(chunk);done();}});
  response.statusCode=200;response.setHeader=()=>{};response.writeHead=status=>{response.statusCode=status;};
  const complete=once(response,'finish');
  await service.handle(req,response,new URL(path,platform.publicBaseUrl));await complete;
  return {status:response.statusCode,text:Buffer.concat(output).toString()};
 }
 const last=publicRead.audioRecordings.at(-1).url;
 assert.deepEqual(await play(last),{status:206,text:'second recording'});
 assert.deepEqual(await play(named.audioRecordings[0].url),{status:206,text:'third recording'});
 const changed=new URL(last,platform.publicBaseUrl);changed.searchParams.set('recording',c);
 assert.equal((await play(changed.href)).status,403);
 await pg.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=false,shared_people=\'[]\'::jsonb,sharing_version=sharing_version+1 WHERE id=$1',[id]);
 assert.equal((await play(last)).status,403);
 assert.equal((await play(named.audioRecordings[0].url)).status,403);
 assert.equal((await call(list)).status,409,'Published source list is locked');
 console.log('Multi-recording HTTP flow: staged append, order, duplicate and stale-write rejection, existing original receipt, file-specific public and named playback, and revoked access passed.');
}finally{globalThis.fetch=originalFetch;await pg.close();delete process.env.MEETING_HUB_PREVIEW;}

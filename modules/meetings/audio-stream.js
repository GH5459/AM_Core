import crypto from 'node:crypto';
import {failure} from './workspace-model.js';
import {audioInput} from './hub-model.js';
export const AUDIO_TRANSPORT='drive-binary-resume-v2',AUDIO_BLOCK=8*1024*1024;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const validId=id=>typeof id==='string'&&/^[-_a-zA-Z0-9]{1,200}$/.test(id);
// A session capability never leaves the server. No raw audio enters PostgreSQL.
export function meetingAudioStream({pool,store,platform,env,check}){
 const get=async(r,id)=>(await pool.query(`SELECT s.*,u.actor_id,u.mime,u.filename,u.state FROM central_archive.meeting_audio_streams s JOIN central_archive.meeting_audio_uploads u USING(workspace_id,upload_id) WHERE s.workspace_id=$1 AND s.upload_id=$2`,[r.id,id])).rows[0];
 function mutable(r){if(!['setup','failed'].includes(r.state))throw failure(409,'此階段不能替換錄音。');}
 function session(url){let u;try{u=new URL(url);}catch{}if(!u||u.protocol!=='https:'||u.hostname!=='www.googleapis.com'||!u.pathname.startsWith('/upload/drive/')||u.username||u.password)throw failure(503,'雲端上傳連線無法確認，裝置暫存仍保留。');return u.href;}
 async function drive(url,options={}){return fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(180000)});}
 async function metadata(u){
  const token=await platform.drive.getAccessToken(),r=await drive('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(u.drive_id)+'?'+new URLSearchParams({fields:'id,size,trashed,parents,appProperties,webViewLink',supportsAllDrives:'true'}),{headers:{Authorization:'Bearer '+token}});
  if(r.status===404)return null;if(!r.ok)throw failure(503,'雲端錄音暫時無法核對，請稍後接續。');
  const f=await r.json();if(f.trashed||f.id!==u.drive_id||Number(f.size)!==Number(u.total_bytes)||!f.parents?.includes(u.folder_id)||f.appProperties?.meetingUpload!==sha(u.workspace_id+':'+u.upload_id))throw failure(409,'雲端錄音與本次上傳不一致，請保留原音檔並聯絡管理者。');return f;
 }
 async function init(u){
  const token=await platform.drive.getAccessToken(),r=await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Upload-Content-Type':u.mime,'X-Upload-Content-Length':String(u.total_bytes)},body:JSON.stringify({id:u.drive_id,name:u.filename,parents:[u.folder_id],appProperties:{meetingUpload:sha(u.workspace_id+':'+u.upload_id)}})});
  if(!r.ok)throw failure(503,'雲端錄音上傳尚未準備完成，請稍後接續。');const url=session(r.headers.get('location'));
  await pool.query(`UPDATE central_archive.meeting_audio_streams SET session_url=$3,bytes_saved=0,uncertain=false,receipts='{}',pending_offset=NULL,pending_length=NULL,pending_hash=NULL,updated_at=now() WHERE workspace_id=$1 AND upload_id=$2`,[u.workspace_id,u.upload_id,url]);
  return {...u,session_url:url,bytes_saved:0,uncertain:false,receipts:{},pending_offset:null,pending_length:null,pending_hash:null};
 }
 async function remote(u){
  const completed=await metadata(u);if(completed)return {...u,bytes_saved:Number(u.total_bytes),completed};
  if(!u.session_url)return init(u);
  const r=await drive(session(u.session_url),{method:'PUT',headers:{'Content-Length':'0','Content-Range':'bytes */'+u.total_bytes}});
  if(r.status===404||r.status===410)return init(u);
  if(r.status===200||r.status===201){const f=await metadata(u);if(!f)throw failure(503,'雲端保存回覆尚未確認，請稍後接續。');return {...u,bytes_saved:Number(u.total_bytes),completed:f};}
  if(r.status!==308)throw failure(503,'雲端上傳進度暫時無法確認，裝置暫存仍保留。');
  const range=r.headers.get('range'),match=range?.match(/^bytes=0-(\d+)$/),offset=range?match?Number(match[1])+1:NaN:0;
  if(!Number.isSafeInteger(offset)||offset<Number(u.bytes_saved)||offset>Number(u.total_bytes))throw failure(409,'雲端分段進度不一致，請保留原音檔並聯絡管理者。');
  await pool.query('UPDATE central_archive.meeting_audio_streams SET bytes_saved=$3,updated_at=now() WHERE workspace_id=$1 AND upload_id=$2',[u.workspace_id,u.upload_id,offset]);return {...u,bytes_saved:offset};
 }
 async function exclusive(r,id,actor,work){
  const lease=crypto.randomUUID(),q=await pool.query(`UPDATE central_archive.meeting_audio_streams s SET lease_token=$3,lease_until=now()+interval '4 minutes' FROM central_archive.meeting_audio_uploads u WHERE s.workspace_id=$1 AND s.upload_id=$2 AND u.workspace_id=s.workspace_id AND u.upload_id=s.upload_id AND u.actor_id=$4 AND (s.lease_until IS NULL OR s.lease_until<now()) RETURNING s.upload_id`,[r.id,id,lease,actor.id]);
  if(!q.rows.length)throw failure(429,'這份錄音正在上傳，請稍候自動接續。');
  try{const u=await get(r,id);if(!u||u.actor_id!==actor.id)throw failure(403,'找不到本人的錄音上傳。');return await work(u);}finally{await pool.query('UPDATE central_archive.meeting_audio_streams SET lease_token=NULL,lease_until=NULL WHERE workspace_id=$1 AND upload_id=$2 AND lease_token=$3',[r.id,id,lease]);}
 }
 const receipt=u=>({ok:true,transport:AUDIO_TRANSPORT,uploadId:u.upload_id,offset:Number(u.bytes_saved),total:Number(u.total_bytes),blockSize:AUDIO_BLOCK,saved:u.state==='saved'});
 async function begin(r,row,actor,v){
  audioInput({...v,action:'audio-begin'});mutable(r);
  if(!Number.isSafeInteger(v.total)||v.total<1||v.total>512*1024*1024||!(/^[a-f0-9]{64}$/).test(v.manifest||''))throw failure(400,'錄音大小或內容識別不正確。');
  const prior=(await pool.query('SELECT * FROM central_archive.meeting_audio_uploads WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId])).rows[0];
  if(prior&&(prior.actor_id!==actor.id||prior.filename!==v.filename||prior.mime!==v.mime))throw failure(409,'上傳識別已用於其他錄音。');
  let u=await get(r,v.uploadId);
  if(!u&&prior){const chunks=(await pool.query('SELECT count(*) AS n FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId])).rows[0];if(prior.state==='saved'||Number(chunks.n))return {ok:true,transport:'legacy'};}
  if(!u){
   const folder=row.drive_folder_id||await platform.drive.ensureFolder((row.display_name||'會議')+' · '+row.key.slice(0,12),env.AMCORE_CENTRAL_ARCHIVE_DRIVE_ROOT_FOLDER_ID);if(!validId(folder))throw failure(503,'原錄音資料夾尚未可用。');
   const token=await platform.drive.getAccessToken(),response=await drive('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw failure(503,'雲端上傳識別暫時無法建立。');const id=(await response.json()).ids?.[0];if(!validId(id))throw failure(503,'雲端上傳識別無法確認。');
   await pool.query(`INSERT INTO central_archive.meeting_audio_uploads(workspace_id,upload_id,actor_id,mime,filename) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[r.id,v.uploadId,actor.id,v.mime,v.filename]);
   await pool.query(`INSERT INTO central_archive.meeting_audio_streams(workspace_id,upload_id,total_bytes,manifest_hash,folder_id,drive_id,base_file_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[r.id,v.uploadId,v.total,v.manifest,folder,id,r.receipt?.hubAudio?.id||'']);u=await get(r,v.uploadId);
  }
  if(u.actor_id!==actor.id||Number(u.total_bytes)!==v.total||u.manifest_hash!==v.manifest||u.mime!==v.mime||u.filename!==v.filename)throw failure(409,'音檔內容與原續傳不一致，請保留原音檔。');
  return exclusive(r,v.uploadId,actor,async current=>receipt(current.state==='saved'?current:await remote(current)));
 }
 async function finish(r,row,actor,v){
  audioInput(v);mutable(r);const u=await get(r,v.uploadId);if(!u||u.actor_id!==actor.id)throw failure(403,'找不到本人的錄音上傳。');
  return exclusive(r,v.uploadId,actor,async current=>{
   if(row.drive_folder_id&&row.drive_folder_id!==current.folder_id)throw failure(409,'原錄音資料夾已變更，請先核對來源。');
   const f=await metadata(current);if(!f)throw failure(409,'錄音尚未完整保存，請繼續上傳。');
   await check(await store.get(r.id),row,actor,true);
   await store.locked(r.id,async(fresh,db)=>{mutable(fresh);if(fresh.host_id!==actor.id||fresh.conversation_key!==r.conversation_key)throw failure(403,'原會議主持人或來源已變更，請重新確認。');const existing=fresh.receipt?.hubAudio?.id||'';if(existing!==current.base_file_id&&existing!==f.id)throw failure(409,'會議已有另一份新錄音，不能由較早上傳覆蓋。');f.webViewLink||='https://drive.google.com/file/d/'+f.id+'/view';await db.query(`UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{hubAudio}',$2::jsonb),filename=$3,revision=revision+CASE WHEN receipt->'hubAudio'->>'id'=$4 THEN 0 ELSE 1 END WHERE id=$1`,[r.id,JSON.stringify(f),current.filename,f.id]);await db.query(`UPDATE central_archive.meeting_audio_uploads SET state='saved',drive_file=$3::jsonb WHERE workspace_id=$1 AND upload_id=$2`,[r.id,v.uploadId,JSON.stringify(f)]);await db.query(`UPDATE central_archive.meeting_audio_streams SET bytes_saved=total_bytes,uncertain=false,session_url=NULL,updated_at=now() WHERE workspace_id=$1 AND upload_id=$2`,[r.id,v.uploadId]);});
   return {ok:true,audio:true,saved:true,transport:AUDIO_TRANSPORT};
  });
 }
 async function chunk(req,r,row,actor,url){
  await check(r,row,actor,true);mutable(r);const id=url.searchParams.get('uploadId'),offset=Number(url.searchParams.get('offset')),hash=String(req.headers['x-audio-sha256']||'');audioInput({uploadId:id});
  if(!url.searchParams.has('offset')||!Number.isSafeInteger(offset)||offset<0||offset%AUDIO_BLOCK!==0||!(/^[a-f0-9]{64}$/).test(hash))throw failure(400,'錄音分段識別不正確。');
  const own=await get(r,id);if(!own||own.actor_id!==actor.id)throw failure(403,'找不到本人的錄音上傳。');
  let length=0,parts=[];for await(const b of req){length+=b.length;if(length>AUDIO_BLOCK)throw failure(413,'錄音分段過大。');parts.push(Buffer.from(b));}const bytes=Buffer.concat(parts);parts=null;
  if(!length||offset+length>Number(own.total_bytes)||length!==Math.min(AUDIO_BLOCK,Number(own.total_bytes)-offset)||sha(bytes)!==hash)throw failure(409,'錄音分段內容不一致，裝置暫存仍保留。');
  return exclusive(r,id,actor,async u=>{
   if(u.uncertain){if(Number(u.pending_offset)!==offset||u.pending_hash!==hash||Number(u.pending_length)!==length)throw failure(409,'前一段上傳尚未確認，請保留原音檔並重試。');u=await remote(u);}
   const acknowledged=u.receipts[String(offset)];if(acknowledged){if(acknowledged.hash!==hash||acknowledged.length!==length)throw failure(409,'同一分段內容不同，請保留原音檔。');return receipt(u);}
   if(u.state==='saved')return receipt(u);
   const saved=Number(u.bytes_saved);if(saved<offset||saved>offset+length)throw failure(409,'上傳進度已變更，請重新接續。');
   await pool.query(`UPDATE central_archive.meeting_audio_streams SET uncertain=true,pending_offset=$3,pending_length=$4,pending_hash=$5 WHERE workspace_id=$1 AND upload_id=$2`,[r.id,id,offset,length,hash]);
   let accepted=saved;
   if(saved<offset+length){const response=await drive(session(u.session_url),{method:'PUT',headers:{'Content-Type':u.mime,'Content-Length':String(offset+length-saved),'Content-Range':'bytes '+saved+'-'+(offset+length-1)+'/'+u.total_bytes},body:bytes.subarray(saved-offset)});
    if(response.status===200||response.status===201)accepted=Number(u.total_bytes);
    else if(response.status===308){const match=response.headers.get('range')?.match(/^bytes=0-(\d+)$/);accepted=match?Number(match[1])+1:0;}
    else throw failure(503,'雲端上傳暫時中斷，會自動核對並接續。');
   }
   if(accepted!==offset+length)throw failure(503,'此片段尚未傳完，會自動接續。');
   const receipts={...u.receipts,[String(offset)]:{hash,length}};await pool.query(`UPDATE central_archive.meeting_audio_streams SET bytes_saved=$3,uncertain=false,receipts=$4::jsonb,updated_at=now() WHERE workspace_id=$1 AND upload_id=$2`,[r.id,id,accepted,JSON.stringify(receipts)]);
   return receipt({...u,bytes_saved:accepted});
  });
 }
 return {begin,finish,chunk};
}

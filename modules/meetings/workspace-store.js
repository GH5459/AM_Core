import crypto from 'node:crypto';
import {failure,initialFields,checkField,checkPublication} from './workspace-model.js';
export function createWorkspaceStore(pool){
 async function transaction(work){const db=await pool.connect();try{await db.query('BEGIN');const r=await work(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 const get=async(id,db=pool)=>(await db.query('SELECT * FROM central_archive.meeting_workspaces WHERE id=$1',[id])).rows[0];
 async function locked(id,fn){return transaction(async db=>{await db.query('SELECT id FROM central_archive.meeting_workspaces WHERE id=$1 FOR UPDATE',[id]);const row=await get(id,db);if(!row)throw failure(404,'找不到這場會議。');return fn(row,db);});}
 async function create(key,event,filename,hostName){
  const id=crypto.createHash('sha256').update('meeting-workspace:'+key+':'+event.message.id).digest('hex');
  await pool.query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,source,filename,fields)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb) ON CONFLICT(conversation_key,message_id) DO NOTHING`,[id,key,event.message.id,event.source.userId,hostName,JSON.stringify({type:'message',source:event.source,message:{id:event.message.id,type:event.message.type,fileName:filename},timestamp:event.timestamp}),filename,JSON.stringify(initialFields(event))]);return get(id);
 }
 async function edit(id,actor,{field,value,version}){checkField(field,value);return locked(id,async(r,db)=>{
  if(!['setup','review','failed'].includes(r.state)||field==='settings'&&r.state==='review')throw failure(409,'此階段不可修改這個欄位。');
  const current=Number(r.field_versions[field]||0);
  if(version!==current)throw failure(409,'這個欄位已被其他人修改，請比較最新內容後再儲存；你的輸入仍保留在畫面。');
  const fields={...r.fields,[field]:value},revision=Number(r.revision)+1;
  await db.query(`UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb,field_versions=$3::jsonb,revision=$4,updated_at=now() WHERE id=$1`,[id,JSON.stringify(fields),JSON.stringify({...r.field_versions,[field]:current+1}),revision]);
  await db.query(`INSERT INTO central_archive.meeting_workspace_edits(workspace_id,revision,actor_id,actor_name,field,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,[id,revision,actor.id,actor.name,field,JSON.stringify(r.fields[field]??null),JSON.stringify(value)]);return get(id,db);
 });}
 async function transition(id,actor,action,revision){return locked(id,async(r,db)=>{
  if(actor.id!==r.host_id)throw failure(403,'只有錄音上傳者可以開始製作或發布。');
  if(['publish','retry-publish'].includes(action)&&['publishing','published'].includes(r.state))return r;
  if(Number(r.revision)!==revision)throw failure(409,'內容剛有修改，請重新查看後再確認。');
  let state;
  if(action==='start'&&['setup','failed'].includes(r.state)){
   if(!r.fields.settings.topic.trim()||!r.fields.settings.type.trim()||!r.fields.settings.prompt.trim())throw failure(400,'請填寫主題、會議類型與整理重點。');state='processing';
  }else if(action==='publish'&&r.state==='review'){checkPublication(r);state='publishing';}
  else throw failure(409,'目前無法進行此操作。');
  return(await db.query(`UPDATE central_archive.meeting_workspaces SET state=$2,revision=revision+1,error_code='',lease_until=NULL,updated_at=now() WHERE id=$1 RETURNING *`,[id,state])).rows[0];
 });}
 async function presence(id,actor,field=''){await pool.query(`INSERT INTO central_archive.meeting_workspace_presence(workspace_id,actor_id,actor_name,field) VALUES($1,$2,$3,$4)
  ON CONFLICT(workspace_id,actor_id) DO UPDATE SET actor_name=EXCLUDED.actor_name,field=EXCLUDED.field,seen_at=now()`,[id,actor.id,actor.name,String(field).slice(0,100)]);}
 async function people(id){return(await pool.query(`SELECT actor_id AS id,actor_name AS name,field FROM central_archive.meeting_workspace_presence WHERE workspace_id=$1 AND seen_at>now()-interval '20 seconds'`,[id])).rows;}
 async function history(id){return(await pool.query("SELECT revision,actor_name,field,before_value,after_value,created_at FROM central_archive.meeting_workspace_edits WHERE workspace_id=$1 UNION ALL SELECT version AS revision,actor_name,'sharing' AS field,to_jsonb(before_enabled) AS before_value,to_jsonb(enabled) AS after_value,created_at FROM central_archive.meeting_workspace_access_changes WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[id])).rows;}
 async function share(id,actor,enabled,revision,sharingVersion){return locked(id,async(r,db)=>{
  if(actor.id!==r.host_id)throw failure(403,'只有主持人可以設定連結分享。');
  if(!['setup','review','failed','published'].includes(r.state))throw failure(409,'目前暫時不能變更分享設定。');
  if(typeof enabled!=='boolean'||Number(r.revision)!==revision||Number(r.sharing_version)!==sharingVersion)throw failure(409,'設定已更新，請重新讀取後再設定分享。');
  const next=Number(r.sharing_version)+1;
  await db.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=$2,sharing_version=$3 WHERE id=$1',[id,enabled,next]);
  await db.query(`INSERT INTO central_archive.meeting_workspace_access_changes(workspace_id,version,actor_id,actor_name,before_enabled,enabled) VALUES($1,$2,$3,$4,$5,$6)`,[id,next,actor.id,actor.name,!!r.sharing_enabled,enabled]);
  return get(id,db);
 });}
 async function revise(id,actor,fields,revision,ownerNames){return locked(id,async(r,db)=>{
  if(actor.id!==r.host_id)throw failure(403,'只有主持人可以修訂正式會議。');
  if(r.state!=='published'||Number(r.revision)!==revision)throw failure(409,'正式版本已更新，請比較最新內容再儲存。');
  const pending=(await db.query("SELECT fields=$2::jsonb AS matches FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending'",[id,JSON.stringify(fields)])).rows[0];
  if(pending){if(pending.matches)return r;throw failure(409,'已有修訂正在同步，請稍後查看結果。');}
  const next=Number(r.revision)+1;
  await db.query(`INSERT INTO central_archive.meeting_workspace_revisions(workspace_id,revision,base_revision,fields,owner_names,actor_id,actor_name) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,[id,next,revision,JSON.stringify(fields),JSON.stringify(ownerNames),actor.id,actor.name]);return r;
 });}
 return {get,create,edit,transition,locked,presence,people,history,share,revise};
}

import crypto from 'node:crypto';
import {failure,initialFields,checkField,checkPublication} from './workspace-model.js';
import {applyPart,recordBlocks} from './workspace-collaboration.js';
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
 const auditSql=`SELECT revision,actor_id,actor_name,field,before_value,after_value,created_at FROM central_archive.meeting_workspace_edits WHERE workspace_id=$1
 UNION ALL SELECT version AS revision,actor_id,actor_name,'sharing' AS field,jsonb_build_object('enabled',before_enabled,'people',before_people) AS before_value,jsonb_build_object('enabled',enabled,'people',people) AS after_value,created_at FROM central_archive.meeting_workspace_access_changes WHERE workspace_id=$1
 UNION ALL SELECT revision,actor_id,actor_name,patch->>'field' AS field,patch->'before' AS before_value,patch->'value' AS after_value,created_at FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending' AND patch?'field'`;
 async function colored(id,rows){const actors=(await pool.query(`SELECT actor_id,MIN(created_at) AS first_seen FROM (${auditSql}) h GROUP BY actor_id ORDER BY first_seen,actor_id`,[id])).rows;const palette=['#1d4ed8','#b91c1c','#166534','#6b21a8','#92400e','#0e7490','#9d174d','#374151'];return rows.map(r=>({...r,color:palette[Math.max(0,actors.findIndex(a=>a.actor_id===r.actor_id))%palette.length]}));}
 async function history(id,offset=0){return colored(id,(await pool.query(`SELECT * FROM (${auditSql}) h ORDER BY created_at DESC,revision DESC LIMIT 100 OFFSET $2`,[id,Math.max(0,Math.min(100000,Number(offset)||0))])).rows);}
 async function changes(id){return colored(id,(await pool.query(`SELECT DISTINCT ON(field) * FROM (${auditSql}) h WHERE field<>'sharing' ORDER BY field,created_at DESC,revision DESC`,[id])).rows);}
 async function effective(r,db=pool){const latest=(await db.query("SELECT * FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending' ORDER BY revision DESC LIMIT 1",[r.id])).rows[0];if(!latest)return r;const versions={...r.field_versions};for(const key of new Set([...Object.keys(r.fields),...Object.keys(latest.fields)]))if(JSON.stringify(r.fields[key])!==JSON.stringify(latest.fields[key]))versions[key]=Number(versions[key]||0)+1;return {...r,fields:latest.fields,revision:latest.revision,record_blocks:latest.patch.blocks||recordBlocks({...r,fields:latest.fields,record_blocks:[]}),field_versions:latest.patch.versions||versions};}
 async function part(id,actor,input,validate){return locked(id,async(original,db)=>{
  if(!['review','published'].includes(original.state))throw failure(409,'此階段不可修改內容。');
  const r=await effective(original,db),next=applyPart(r,input),ownerNames=await validate?.({...r,...next})||original.receipt.ownerNames||{};
  if(JSON.stringify(next.patch.before)===JSON.stringify(next.patch.value))return original;
  const revision=Number(r.revision)+1;
  if(r.state==='published')await db.query(`INSERT INTO central_archive.meeting_workspace_revisions(workspace_id,revision,base_revision,fields,owner_names,actor_id,actor_name,patch) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb)`,[id,revision,r.revision,JSON.stringify(next.fields),JSON.stringify(ownerNames),actor.id,actor.name,JSON.stringify(next.patch)]);
  else{
   await db.query(`UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb,field_versions=$3::jsonb,record_blocks=$4::jsonb,revision=$5,updated_at=now() WHERE id=$1`,[id,JSON.stringify(next.fields),JSON.stringify(next.field_versions),JSON.stringify(next.record_blocks),revision]);
   await db.query("UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{ownerNames}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(ownerNames)]);
   await db.query(`INSERT INTO central_archive.meeting_workspace_edits(workspace_id,revision,actor_id,actor_name,field,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,[id,revision,actor.id,actor.name,input.field,JSON.stringify(next.patch.before),JSON.stringify(next.patch.value)]);
  }return get(id,db);
 });}
 async function share(id,actor,enabled,revision,sharingVersion,people){return locked(id,async(r,db)=>{
  if(actor.id!==r.host_id)throw failure(403,'只有主持人可以設定連結分享。');
  if(!['setup','review','failed','published'].includes(r.state))throw failure(409,'目前暫時不能變更分享設定。');
  if(typeof enabled!=='boolean'||Number(r.revision)!==revision||Number(r.sharing_version)!==sharingVersion)throw failure(409,'設定已更新，請重新讀取後再設定分享。');
  const next=Number(r.sharing_version)+1;
  const recipients=people===undefined?r.shared_people:people;
  await db.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=$2,sharing_version=$3,shared_people=$4::jsonb WHERE id=$1',[id,enabled,next,JSON.stringify(recipients)]);
  await db.query(`INSERT INTO central_archive.meeting_workspace_access_changes(workspace_id,version,actor_id,actor_name,before_enabled,enabled,before_people,people) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[id,next,actor.id,actor.name,!!r.sharing_enabled,enabled,JSON.stringify(r.shared_people),JSON.stringify(recipients)]);
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
 return {get,create,edit,transition,locked,presence,people,history,changes,effective,part,share,revise};
}

import {todos} from './workspace-model.js';

// Keep the prior published snapshot readable until the revision's Notion and
// task receipts have completed. Source pages, recordings and task IDs persist.
export function workspaceRevisions({pool,store,conversation,assertMember,validateAssignees,platform,request,link,logger,taskDispatch}){
 async function pending(id){return(await pool.query("SELECT revision,error_code FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending' ORDER BY revision LIMIT 1",[id])).rows[0]||null;}
 async function apply(job){const workspaceId=job.workspace_id,revision=job.revision,db=await pool.connect();let lock=false;try{
  lock=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',['revise-meeting:'+job.workspace_id])).rows[0].ok;if(!lock)return;
  job=(await pool.query("SELECT * FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND revision=$2 AND state='pending'",[job.workspace_id,job.revision])).rows[0];if(!job)return;
  const r=await store.get(job.workspace_id),row=await conversation(r);if(!row.enabled||['left','blocked'].includes(row.connection_state))throw Error('meeting_feature_disabled');await assertMember(row,r.host_id);await assertMember(row,job.actor_id);await validateAssignees({...r,fields:job.fields},row);
  if(Number(r.revision)!==Number(job.base_revision)||r.state!=='published')throw Error('published_revision_changed');
  let receipt={...job.receipt};const save=()=>pool.query(`UPDATE central_archive.meeting_workspace_revisions SET receipt=$3::jsonb,error_code='',lease_until=now()+interval '2 minutes' WHERE workspace_id=$1 AND revision=$2`,[r.id,job.revision,JSON.stringify(receipt)]);
  if(!receipt.tasksSaved){await taskDispatch.enqueue(r);receipt.tasks=r.receipt.tasks||[];receipt.taskTenant=r.receipt.taskTenant||'';receipt.knownTaskIds=r.receipt.knownTaskIds||[];receipt.tasksSaved=true;await save();}
  if(!receipt.notionSaved){
   const marker='會議修訂 '+job.revision+' · '+r.id,lines=[marker,'修訂者：'+job.actor_name,'會議記錄',job.fields.record,'待辦事項',...todos(job.fields).map((t,i)=>`任務 ${i+1}：${t.content}\n負責人：${t.ownerId?job.owner_names[t.ownerId]||'待確認':'未分派'}；截止日期：${t.due||'未設定'}\n依據：${t.evidence}`),'逐字稿',job.fields.transcript||'未提供','來源：'+link(r.id)];
   const chunks=[];for(const line of lines)for(let i=0;i<line.length||i===0;i+=1800)chunks.push(line.slice(i,i+1800));
   const existing=[];let cursor='';do{const d=await request('/blocks/'+r.receipt.notionId+'/children?page_size=100'+(cursor?'&start_cursor='+cursor:''));existing.push(...d.results);cursor=d.has_more?d.next_cursor:'';}while(cursor);
   const text=existing.map(b=>(b.paragraph?.rich_text||[]).map(x=>x.plain_text||x.text?.content||'').join('')),start=text.indexOf(marker),done=start<0?[]:text.slice(start);
   if(done.length>chunks.length||done.some((v,i)=>v!==chunks[i]))throw Error('notion_revision_content_changed');
   for(let i=done.length;i<chunks.length;i+=50)await request('/blocks/'+r.receipt.notionId+'/children','PATCH',{children:chunks.slice(i,i+50).map(s=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:s}}]}}))});receipt.notionSaved=true;await save();
  }
  await store.locked(r.id,async(current,tx)=>{
   if(Number(current.revision)!==Number(job.base_revision))throw Error('published_revision_changed');
   const versions={...current.field_versions};for(const key of new Set([...Object.keys(current.fields),...Object.keys(job.fields)]))if(JSON.stringify(current.fields[key])!==JSON.stringify(job.fields[key]))versions[key]=Number(versions[key]||0)+1;
   if(job.patch?.field)Object.assign(versions,job.patch.versions);
   await tx.query(`UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb,field_versions=$3::jsonb,receipt=$4::jsonb,revision=$5,updated_at=now() WHERE id=$1`,[r.id,JSON.stringify(job.fields),JSON.stringify(versions),JSON.stringify({...current.receipt,ownerNames:job.owner_names,taskDispatch:true,tasks:receipt.tasks,taskTenant:receipt.taskTenant,knownTaskIds:receipt.knownTaskIds,latestRevision:Number(job.revision)}),job.revision]);
   if(job.patch?.blocks)await tx.query('UPDATE central_archive.meeting_workspaces SET record_blocks=$2::jsonb WHERE id=$1',[r.id,JSON.stringify(job.patch.blocks)]);
   await tx.query(`INSERT INTO central_archive.meeting_workspace_edits(workspace_id,revision,actor_id,actor_name,field,before_value,after_value,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,[r.id,job.revision,job.actor_id,job.actor_name,job.patch?.field||'published_revision',JSON.stringify(job.patch?.field?job.patch.before:current.fields),JSON.stringify(job.patch?.field?job.patch.value:job.fields),job.created_at]);
   await tx.query("UPDATE central_archive.meeting_workspace_revisions SET state='applied',applied_at=now(),lease_until=NULL,error_code='' WHERE workspace_id=$1 AND revision=$2",[r.id,job.revision]);
  });
 }catch{await pool.query(`UPDATE central_archive.meeting_workspace_revisions SET error_code='修訂已保存，正式記錄或任務同步尚未完成，系統會重試；請勿重建任務。',lease_until=now()+interval '60 seconds' WHERE workspace_id=$1 AND revision=$2`,[workspaceId,revision]);logger.warn('Meeting revision deferred; prior published snapshot and receipts retained.');}
 finally{if(lock)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['revise-meeting:'+workspaceId]);db.release();}}
 return {pending,apply};
}

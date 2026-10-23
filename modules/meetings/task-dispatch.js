import {todos} from './workspace-model.js';
export function dispatchFailure(error,workspace,dispatch,now=Date.now()){
 const date=error.code==='截止日不能早於執行日期。'||error.message==='截止日不能早於執行日期。',identity=['identity_changed','service_changed'].includes(error.message),today=new Date(now+8*3600000).toISOString().slice(0,10);
 const items=date?(dispatch?.payload?.tasks||[]).filter(t=>t.due<today).map(t=>({todoId:t.id,meetingDate:dispatch.payload.date,defaultStartDate:today,dueDate:t.due})):[];
 return {code:date?'START_AFTER_DUE':identity?'IDENTITY_CHANGED':'DELIVERY_UNAVAILABLE',retryable:!date&&!identity,at:new Date(now).toISOString(),items,message:date?'會議任務的開始日晚於截止日，這次整批尚未建立。請由系統維護人員查明日期處理，保留原日期並提出修正方案。':identity?'工作身分或服務已變更，暫停派發；請主持人核對原負責人。':'任務派發暫未完成，系統會重試；會議已發布，請勿重建任務。'};
}

// Publication and task delivery have separate durable receipts. A payload is
// frozen before the remote call, including identities, so a lost reply is replayed
// byte-for-byte. Waiting items are always rebuilt from the latest published text.
export function meetingTaskDispatch({pool,store,botId,platform,conversation,assertMember,link,logger=console}){
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const same=(a,b)=>canonical(a)===canonical(b);
 const identityEqual=(a,b)=>!!a&&!!b&&['userId','account','bindingId','tenantKey'].every(k=>a[k]===b[k]);
 async function enqueue(r){
  const legacy=!!r.receipt.tasksSaved&&!r.receipt.taskDispatch;
  await pool.query(`INSERT INTO central_archive.meeting_task_dispatches(workspace_id,applied_fields,task_tenant,known_task_ids)
   VALUES($1,$2::jsonb,$3,$4::jsonb) ON CONFLICT(workspace_id) DO NOTHING`,[r.id,JSON.stringify(legacy?r.fields:{}),r.receipt.taskTenant||'',JSON.stringify(r.receipt.knownTaskIds||(r.receipt.tasks||[]).map(t=>t.id).filter(Boolean))]);
 }
 async function status(r){
  const q=(await pool.query('SELECT * FROM central_archive.meeting_task_dispatches WHERE workspace_id=$1',[r.id])).rows[0];if(!q)return null;
  return {items:todos(r.fields).filter(t=>t.ownerId).map(t=>({id:t.id,state:same(q.applied_fields[t.id],r.fields[t.id])?'delivered':'pending'})),message:q.error_code||'',lastCheckedAt:q.updated_at};
 }
 async function run(id){const db=await pool.connect();let locked=false,r,q;try{
  locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',['meeting-task-dispatch:'+id])).rows[0].ok;if(!locked)return;
  r=await store.get(id);if(!r||r.state!=='published')return;
  if((await pool.query("SELECT 1 FROM central_archive.meeting_workspace_revisions WHERE workspace_id=$1 AND state='pending' LIMIT 1",[id])).rows.length)return;
  const row=await conversation(r);if(!row.enabled||['left','blocked'].includes(row.connection_state))return;
  await assertMember(row,r.host_id);
  q=(await pool.query('SELECT * FROM central_archive.meeting_task_dispatches WHERE workspace_id=$1',[id])).rows[0];if(!q)return;
  if(!q.payload&&!todos(r.fields).some(t=>t.ownerId)&&!todos(q.applied_fields).some(t=>t.ownerId)){await wait(id,'');return;}
  const identities=new Map(),resolve=async userId=>{if(!identities.has(userId)){await assertMember(row,userId);identities.set(userId,await platform.meetingTaskIdentity?.(userId));}return identities.get(userId);};
  const host=await resolve(r.host_id);
  if(!host){await wait(id,'待主持人完成 UOF／LINE 與工作日誌連線；會議已發布。');return;}
  if(q.host_identity&&!identityEqual(q.host_identity,host)||q.task_tenant&&q.task_tenant!==host.tenantKey)throw Error('identity_changed');
  if(!q.payload){
   const fields={settings:r.fields.settings},assigned=todos(r.fields).filter(t=>t.ownerId),ready=[],waiting=[];
   for(const t of assigned){const owner=await resolve(t.ownerId);
    if(!owner){waiting.push(t.id);continue;}
    if(owner.tenantKey!==host.tenantKey)throw Error('service_changed');
    const prior=q.applied_identities[t.id];if(prior?.userId===owner.userId&&!identityEqual(prior,owner))throw Error('identity_changed');
    fields[t.id]=r.fields[t.id];ready.push({...t,owner});
   }
   const removed=todos(q.applied_fields).filter(t=>t.ownerId&&!fields[t.id]?.ownerId).map(t=>t.id);
   if(same(fields,q.applied_fields)){await wait(id,waiting.length?'部分任務待負責人完成 UOF／LINE 與工作日誌連線，完成後自動補派。':'');return;}
   if(!ready.length&&!removed.length){await wait(id,waiting.length?'待負責人完成 UOF／LINE 與工作日誌連線，完成後自動補派。':'');return;}
   // A colleague connecting must not re-edit other already delivered tasks:
   // their later work-log changes, due dates and progress remain authoritative.
   const changed=ready.filter(t=>!same(q.applied_fields[t.id],r.fields[t.id])||q.applied_fields.settings?.date!==r.fields.settings.date||q.applied_fields.settings?.projectGoal!==r.fields.settings.projectGoal);
   const sequence=Number(q.sequence)+1,payload={id:r.id,revision:Number(r.revision),deliverySequence:sequence,host,tasks:changed.map(t=>({id:t.id,content:t.content,due:t.due,evidence:t.evidence,owner:t.owner})),removed,knownTaskIds:q.known_task_ids,url:link(r.id),notionId:r.receipt.notionId,date:r.fields.settings.date,goal:r.fields.settings.projectGoal,source:{kind:row.source_kind,conversationKey:row.key,messageId:r.source.message.id,timestamp:r.source.timestamp,filename:r.source.message.fileName||r.filename||''}};
   await pool.query(`UPDATE central_archive.meeting_task_dispatches SET payload=$2::jsonb,payload_fields=$3::jsonb,sequence=$4,host_identity=$5::jsonb,task_tenant=$6,updated_at=now() WHERE workspace_id=$1`,[id,JSON.stringify(payload),JSON.stringify(fields),sequence,JSON.stringify(host),host.tenantKey]);
   // Read back JSONB's canonical key order before the very first network call.
   // Both the first attempt and every replay must hash the same serialized body.
   q=(await pool.query('SELECT * FROM central_archive.meeting_task_dispatches WHERE workspace_id=$1',[id])).rows[0];
  }
  if(!identityEqual(q.payload.host,host))throw Error('identity_changed');
  for(const t of q.payload.tasks)if(!identityEqual(await resolve(t.owner.userId),t.owner))throw Error('identity_changed');
  const result=await platform.publishMeetingTasks({preparedPayload:q.payload,taskTenant:q.task_tenant});
  if(!result||!Array.isArray(result.tasks))throw Error('invalid_delivery_receipt');
  const known=[...new Set([...q.known_task_ids,...result.tasks.map(t=>t.id).filter(Boolean)])];
  await pool.query(`UPDATE central_archive.meeting_task_dispatches SET applied_fields=payload_fields,applied_identities=$2::jsonb,known_task_ids=$3::jsonb,result=$4::jsonb,payload=NULL,payload_fields=NULL,error_code='',next_attempt_at=now()+interval '60 seconds',updated_at=now() WHERE workspace_id=$1`,[id,JSON.stringify({...q.applied_identities,...Object.fromEntries(q.payload.tasks.map(t=>[t.id,t.owner]))}),JSON.stringify(known),JSON.stringify({...result,...q.result?.lastFailure?{lastFailure:q.result.lastFailure}:{}})]);
 }catch(e){const failure=dispatchFailure(e,r,q);await pool.query("UPDATE central_archive.meeting_task_dispatches SET result=jsonb_set(COALESCE(result,'{}'::jsonb),'{lastFailure}',$2::jsonb,true) WHERE workspace_id=$1",[id,JSON.stringify(failure)]);await wait(id,failure.message,failure.retryable?60:3600);logger.warn('Meeting task delivery deferred; reason recorded.',{code:failure.code});}
 finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['meeting-task-dispatch:'+id]);db.release();}}
 async function wait(id,message,seconds=60){await pool.query(`UPDATE central_archive.meeting_task_dispatches SET error_code=$2,next_attempt_at=now()+$3::integer*interval '1 second',updated_at=now() WHERE workspace_id=$1`,[id,message,seconds]);}
 async function drain(){const rows=(await pool.query(`SELECT d.workspace_id FROM central_archive.meeting_task_dispatches d JOIN central_archive.meeting_workspaces w ON w.id=d.workspace_id JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE c.bot_id=$1 AND w.state='published' AND d.next_attempt_at<=now() ORDER BY d.next_attempt_at LIMIT 5`,[botId])).rows;for(const r of rows)await run(r.workspace_id);}
 return {enqueue,status,drain,run};
}

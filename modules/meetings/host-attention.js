import crypto from 'node:crypto';
import {failure} from './workspace-model.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const same=(a,b)=>a&&b&&['userId','account','tenantKey','bindingId'].every(k=>a[k]===b[k]);
export function meetingHostAttention({pool,store,platform,botId,check,getConversation,origin,now=Date.now}){
 const summary=r=>r?{state:r.state}:null;
 const pending=(r,p)=>!r.receipt?.deletion?.active&&!p?.cancelled&&['setup','failed','review'].includes(r.state)&&Date.parse(p?.end_at||r.fields.settings.date)<now();
 async function identities(r,actor,p){
  const [requester,host]=await Promise.all([platform.meetingShareIdentity(actor.id),platform.meetingShareIdentity(r.host_id)]);
  if(!requester||!host||requester.tenantKey!==host.tenantKey||p&&p.tenant_key!==host.tenantKey)throw failure(403,'無法核對主持人的原工作帳號，請聯絡管理者確認。');
  return {requester,host};
 }
 async function request(actor,v){
  if(!/^[a-f0-9]{64}$/.test(v.id||'')||!Number.isSafeInteger(v.revision))throw failure(400,'請重新讀取會議清單。');
  await store.locked(v.id,async(r,db)=>{
   await check(r,await getConversation(r.conversation_key),actor);
   if(r.host_id===actor.id)throw failure(403,'這是你主持的會議，請直接開啟處理。');
   const p=(await db.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1',[r.id])).rows[0];
   if(!pending(r,p))throw failure(409,'這場會議已變更，請重新讀取未完成會議。');
   const {requester,host}=await identities(r,actor,p);
   const prior=(await db.query('SELECT * FROM central_archive.meeting_host_attention WHERE workspace_id=$1',[r.id])).rows[0];
   if(prior&&prior.state!=='cancelled')return;
   if(Number(r.revision)!==v.revision)throw failure(409,'會議剛有修改，請重新讀取後確認。');
   const work=await platform.meetingTaskIdentity?.(actor.id);
   if(!work||work.account!==requester.account||work.tenantKey!==requester.tenantKey)throw failure(403,'請先完成本人工作日誌連線，再建立主持人待辦。');
   const snapshot={requester:work,host,topic:p?.topic||r.fields.settings.topic,date:r.fields.settings.date,source:r.source,goal:r.fields.settings.projectGoal||'',url:origin()+'/meetings/review/work/'+r.id};
   await db.query(`INSERT INTO central_archive.meeting_host_attention(workspace_id,bot_id,snapshot) VALUES($1,$2,$3::jsonb) ON CONFLICT(workspace_id) DO UPDATE SET state='pending',snapshot=$3::jsonb,created_at=now(),next_attempt_at=now(),updated_at=now() WHERE meeting_host_attention.state='cancelled' AND meeting_host_attention.payload IS NULL`,[r.id,botId,JSON.stringify(snapshot)]);
  });
  // Commit the request before any remote call. A restart or lost response can
  // replay the frozen payload using the task service's original receipt.
  await deliver(v.id);
  return {ok:true,attention:summary((await pool.query('SELECT state FROM central_archive.meeting_host_attention WHERE workspace_id=$1',[v.id])).rows[0])};
 }
 async function deliver(id){
  return store.locked(id,async(r,db)=>{
   let job=(await db.query('SELECT * FROM central_archive.meeting_host_attention WHERE workspace_id=$1 FOR UPDATE',[id])).rows[0];
   if(!job||job.bot_id!==botId||!['pending','waiting'].includes(job.state))return;
   try{
    const snapshot=job.snapshot,p=(await db.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1',[id])).rows[0];
    if(!job.payload&&!pending(r,p)){await db.query("UPDATE central_archive.meeting_host_attention SET state='cancelled',updated_at=now() WHERE workspace_id=$1",[id]);return;}
    const actor={id:snapshot.requester.userId};
    // Prepared delivery may already exist remotely. Replaying it after deletion
    // recovers the receipt without changing the host's existing task progress.
    await check(r,await getConversation(r.conversation_key),actor,false,!!job.payload);
    const identitiesNow=await identities(r,actor,p);
    if(identitiesNow.host.account!==snapshot.host.account||identitiesNow.host.tenantKey!==snapshot.host.tenantKey)throw Object.assign(Error('identity changed'),{attentionCode:'blocked'});
    const [requester,host]=await Promise.all([platform.meetingTaskIdentity?.(actor.id),platform.meetingTaskIdentity?.(r.host_id)]);
    if(!requester||!host)throw Object.assign(Error('work connection required'),{attentionCode:'waiting'});
    if(!same(requester,snapshot.requester)||host.account!==snapshot.host.account||host.tenantKey!==snapshot.host.tenantKey||job.payload&&!same(host,job.payload.tasks[0].owner))throw Object.assign(Error('identity changed'),{attentionCode:'blocked'});
    if(!job.payload){
     const created=new Date(job.created_at),date=new Date(+created+8*3600000).toISOString().slice(0,10),due=new Date(+created+8*3600000+86400000).toISOString().slice(0,10),raw=hash('meeting-host-attention:'+botId+':'+id),uuid=[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-');
     const evidence='由 '+(requester.name||'會議參與者')+' 於 '+created.toISOString()+' 請主持人處理共用未完成會議。原會議日期：'+snapshot.date+'。請確認要繼續整理並發布，或刪除不再需要的會議；正式發布或刪除後，這筆處理提醒會自動完成。這是會議清理請求，並非會議決議。';
     const payload={id:raw,host:requester,revision:1,deliverySequence:1,removed:[],knownTaskIds:[],date,url:snapshot.url,goal:snapshot.goal||'整理未完成會議，維持共用清單清楚',source:{kind:'meeting-cleanup-request',conversationKey:r.conversation_key,messageId:r.message_id,timestamp:job.created_at,filename:r.filename,originalWorkspaceId:id},tasks:[{id:'todo:'+uuid,content:'處理未完成會議：'+snapshot.topic,due,evidence,owner:host}]};
     await db.query('UPDATE central_archive.meeting_host_attention SET payload=$2::jsonb WHERE workspace_id=$1',[id,JSON.stringify(payload)]);
     // Persist separately BEFORE delivery; this transaction returns a prepared
     // job, and the next pass sends exactly the JSONB representation stored.
     return {prepared:true};
    }
    const result=await platform.publishMeetingTasks({preparedPayload:job.payload,taskTenant:snapshot.host.tenantKey});
    if(result?.tasks?.length!==1||result.tasks[0].owner!==snapshot.host.account||result.tenantKey!==snapshot.host.tenantKey)throw Error('task receipt unavailable');
    await db.query("UPDATE central_archive.meeting_host_attention SET state='delivered',result=$2::jsonb,delivered_at=now(),updated_at=now() WHERE workspace_id=$1",[id,JSON.stringify(result)]);
   }catch(e){
    const state=e.attentionCode||((e.status===403||e.status===410)?'blocked':'waiting');
    await db.query("UPDATE central_archive.meeting_host_attention SET state=$2,next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE workspace_id=$1",[id,state]);
   }
  }).then(async result=>{if(result?.prepared)return deliver(id);});
 }
 async function complete(id){
  return store.locked(id,async(r,db)=>{
   const job=(await db.query('SELECT * FROM central_archive.meeting_host_attention WHERE workspace_id=$1 FOR UPDATE',[id])).rows[0];
   if(!job||job.bot_id!==botId||job.state!=='delivered'||job.completed_at)return;
   const deleted=r.receipt?.deletion?.active&&r.receipt.deletion.actorId===r.host_id,reason=deleted?'deleted':r.state==='published'?'published':null;
   if(!reason&&!job.completion_payload)return;
   try{
    const row=await getConversation(r.conversation_key),host=await platform.meetingTaskIdentity?.(r.host_id);
    if(row?.bot_id!==botId||!same(host,job.payload?.tasks[0]?.owner))throw Error('Original host work identity changed');
    if(!job.completion_payload){
     const payload={id:job.payload.id,host:job.payload.host,url:job.snapshot.url,cleanupCompletion:{workspaceId:id,todoId:job.payload.tasks[0].id,taskId:job.result.tasks[0].id,actor:job.payload.tasks[0].owner,reason,meetingRevision:Number(r.revision),at:new Date(deleted?r.receipt.deletion.at:r.updated_at).toISOString()}};
     await db.query('UPDATE central_archive.meeting_host_attention SET completion_payload=$2::jsonb WHERE workspace_id=$1',[id,JSON.stringify(payload)]);return {prepared:true};
    }
    const result=await platform.publishMeetingTasks({preparedPayload:job.completion_payload,taskTenant:host.tenantKey});
    if(result?.taskId!==job.result.tasks[0].id||!['completed','already-done','already-cancelled'].includes(result.outcome)||result.tenantKey!==host.tenantKey)throw Error('Completion receipt unavailable');
    await db.query('UPDATE central_archive.meeting_host_attention SET completion_result=$2::jsonb,completed_at=now(),updated_at=now() WHERE workspace_id=$1',[id,JSON.stringify(result)]);
   }catch{
    await db.query("UPDATE central_archive.meeting_host_attention SET completion_next_at=now()+interval '5 minutes',updated_at=now() WHERE workspace_id=$1",[id]);
   }
  }).then(async result=>{if(result?.prepared)return complete(id);});
 }
 let draining=false;
 async function drain(){if(draining)return;draining=true;try{const jobs=(await pool.query("SELECT workspace_id FROM central_archive.meeting_host_attention WHERE bot_id=$1 AND state IN ('pending','waiting') AND next_attempt_at<=now() ORDER BY created_at LIMIT 3",[botId])).rows;for(const job of jobs)await deliver(job.workspace_id);
  const resolved=(await pool.query("SELECT a.workspace_id FROM central_archive.meeting_host_attention a JOIN central_archive.meeting_workspaces w ON w.id=a.workspace_id WHERE a.bot_id=$1 AND a.state='delivered' AND a.completed_at IS NULL AND a.completion_next_at<=now() AND (w.state='published' OR w.receipt->'deletion'->>'active'='true' OR a.completion_payload IS NOT NULL) ORDER BY a.created_at LIMIT 3",[botId])).rows;for(const job of resolved)await complete(job.workspace_id);
 }finally{draining=false;}}
 return {request,drain,deliver,complete};
}

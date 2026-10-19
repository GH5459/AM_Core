import crypto from 'node:crypto';
const key=j=>[j.workspace_id,j.tenant_key,j.account,j.grant_version];
const where='workspace_id=$1 AND tenant_key=$2 AND account=$3 AND grant_version=$4';
export function meetingShareNotices({pool,store,botId,platform,link,logger=console}){
 let running;
 async function status(r){
  const jobs=(await pool.query('SELECT DISTINCT ON(tenant_key,account) tenant_key,account,state,error_code,sent_at FROM central_archive.meeting_share_notices WHERE workspace_id=$1 ORDER BY tenant_key,account,grant_version DESC',[r.id])).rows;
  return (r.shared_people||[]).map(p=>{const j=jobs.find(j=>j.tenant_key===p.tenantKey&&j.account===p.account);return {account:p.account,name:p.name,state:j?.state||'not_requested',reason:j?.error_code||'',sentAt:j?.sent_at||null,waitingForPublication:!!j&&j.state==='pending'&&r.state!=='published'};});
 }
 async function process(job){
  try{
   await store.locked(job.workspace_id,async(r,db)=>{
    const j=(await db.query('SELECT * FROM central_archive.meeting_share_notices WHERE '+where,key(job))).rows[0];
    if(!j||j.state!=='pending')return;
    const update=async(sql,args=[])=>db.query('UPDATE central_archive.meeting_share_notices SET '+sql+' WHERE '+where,[...key(j),...args]);
    if(!r.shared_people.some(p=>p.tenantKey===j.tenant_key&&p.account===j.account))return update("state='cancelled',error_code='removed',lease_until=NULL");
    if(r.state!=='published')return update("lease_until=NULL,next_attempt_at=now()+interval '1 minute'");
    // LINE retains retry keys for 24h. Stop before that boundary after an
    // uncertain response, rather than risk sending the same grant twice.
    if(j.first_attempt_at&&Date.now()-Date.parse(j.first_attempt_at)>=23*3600000)return update("state='failed',error_code='retry_window_ended',lease_until=NULL");
    const who=await platform.meetingShareRecipient?.({tenantKey:j.tenant_key,account:j.account});
    if(!who||who.tenantKey!==j.tenant_key||who.account!==j.account||!/^U[a-f0-9]{32}$/i.test(who.userId||''))return update("error_code='line_not_linked',next_attempt_at=now()+interval '15 minutes',lease_until=NULL");
    if(j.target_id&&j.target_id!==who.userId)return update("state='failed',error_code='identity_changed',lease_until=NULL");
    // Commit the first-attempt timestamp before sending. Its durable retry key
    // survives process death even if LINE accepted but the response was lost.
    const text='葉小蝸 AI 小助手｜會議記錄分享\n'+String(r.host_name||'主持人')+' 分享了一份會議記錄給你。\n\n會議主題：'+String(r.fields.settings.topic||'會議記錄').slice(0,300)+'\n閱讀連結：'+link(r.id)+'\n\n請使用本人的 LINE 登入，即可閱讀與收聽錄音。';
    await update("target_id=$5,message_text=COALESCE(message_text,$6),first_attempt_at=COALESCE(first_attempt_at,now()),attempts=attempts+1",[who.userId,text]);
   });
   // The send transaction locks the same workspace as share/revoke. Removal
   // cannot finish and then be followed by a stale notice from this worker.
   await store.locked(job.workspace_id,async(r,db)=>{
    const j=(await db.query('SELECT * FROM central_archive.meeting_share_notices WHERE '+where,key(job))).rows[0];
    if(j?.state!=='pending'||!j.target_id||r.state!=='published'||!r.shared_people.some(p=>p.tenantKey===j.tenant_key&&p.account===j.account))return;
    const who=await platform.meetingShareRecipient?.({tenantKey:j.tenant_key,account:j.account});
    if(who?.userId!==j.target_id||who?.tenantKey!==j.tenant_key||who?.account!==j.account){await db.query("UPDATE central_archive.meeting_share_notices SET state='failed',error_code='identity_changed',lease_until=NULL WHERE "+where,key(j));return;}
    const retryKey='meeting-share:'+crypto.createHash('sha256').update(JSON.stringify([...key(j),j.target_id])).digest('hex');
    await platform.pushLineMessage(j.target_id,j.message_text,undefined,{retryKey,suppressEvidenceLogs:true,timeoutMs:8000});
    await db.query("UPDATE central_archive.meeting_share_notices SET state='sent',error_code='',sent_at=now(),lease_until=NULL WHERE "+where,key(j));
   });
  }catch(e){
   const rejected=e.lineStatus>=400&&e.lineStatus<500;
   await pool.query("UPDATE central_archive.meeting_share_notices SET state=$5,error_code=$6,lease_until=NULL,next_attempt_at=now()+interval '1 second'*LEAST(3600,30*power(2,LEAST(attempts,7))) WHERE "+where+" AND state='pending'",[...key(job),rejected?'failed':'pending',rejected?'line_rejected':'delivery_pending']);
   logger.warn?.('Meeting share notice deferred; durable retry retained.');
  }
 }
 function drain(){if(running)return running;running=(async()=>{
  const jobs=(await pool.query(`SELECT n.* FROM central_archive.meeting_share_notices n JOIN central_archive.meeting_workspaces w ON w.id=n.workspace_id JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE c.bot_id=$1 AND w.state='published' AND n.state='pending' AND n.next_attempt_at<=now() AND (n.lease_until IS NULL OR n.lease_until<now()) ORDER BY n.next_attempt_at LIMIT 10`,[botId])).rows;
  for(const j of jobs){const claimed=await pool.query("UPDATE central_archive.meeting_share_notices SET lease_until=now()+interval '2 minutes' WHERE "+where+" AND state='pending' AND (lease_until IS NULL OR lease_until<now()) RETURNING account",key(j));if(claimed.rows.length)await process(j);}
 })().finally(()=>running=null);return running;}
 return {status,drain};
}

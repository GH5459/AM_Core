// Resolves recipients only. No LINE sending and no task writes.
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const uid=/^U[a-f0-9]{32}$/i;
async function mapLimit(items,fn){const result=[];for(let i=0;i<items.length;i+=5)result.push(...await Promise.all(items.slice(i,i+5).map(fn)));return result;}
export function createJournalSharing({authorize,pool,line,recipient,identity,botId}){
 async function member(row,id){if(!uid.test(id||''))throw fail('請先連接本人的 LINE 身分。',403);const r=await line.lineGet(`/v2/bot/${row.source_kind}/${row.source_id}/member/${id}`,{timeoutMs:8000});if(r.userId!==id)throw fail('無法確認目前群組成員。',403);}
 async function group(key,actor){const row=(await pool.query("SELECT c.key,c.source_kind,c.source_id,c.display_name,s.connection_state FROM central_archive.conversations c LEFT JOIN central_archive.meeting_settings s ON s.conversation_key=c.key WHERE c.key=$1 AND c.bot_id=$2 AND c.source_kind IN ('group','room')",[key,botId])).rows[0];if(!row||['left','blocked'].includes(row.connection_state))throw fail('找不到可用的 LINE 群組。',404);await member(row,actor.userId);return row;}
 return async function resolve(input,bearer){
  const org=await authorize(input,bearer),valid=new Set(org.people.map(p=>p.account)),warnings=[],sources=[],accounts=new Set();
  if(input.action==='health')return {ok:true,contract:'journal-sharing-no-push-v1'};
  if(input.action==='groups'){
   const actor=await recipient({tenantKey:input.tenantKey,account:input.account});if(!actor)throw fail('請先在工作日誌連接 LINE，再選擇群組。',403);
   const offset=input.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw fail('頁次不正確。',400);
   const rows=(await pool.query("SELECT c.key,c.source_kind,c.source_id,c.display_name FROM central_archive.conversations c LEFT JOIN central_archive.meeting_settings s ON s.conversation_key=c.key WHERE c.bot_id=$1 AND c.source_kind IN ('group','room') AND COALESCE(s.connection_state,'unknown') NOT IN ('left','blocked') ORDER BY c.key LIMIT 21 OFFSET $2",[botId,offset])).rows;
   const groups=(await mapLimit(rows.slice(0,20),async r=>{try{await member(r,actor.userId);return {key:r.key,name:r.display_name||'未命名群組'};}catch{return null;}})).filter(Boolean);
   return {ok:true,groups,next:rows.length>20?offset+20:null,notice:'只列出目前可確認本人仍在的群組。選擇後會核對實際可分享的公司同仁。'};
  }
  if(input.action!=='resolve')throw fail('不支援此名單操作。',400);
  if(input.groupKey){
   const actor=await recipient({tenantKey:input.tenantKey,account:input.account});if(!actor)throw fail('請先連接 LINE，再選擇群組。',403);
   const row=await group(input.groupKey,actor),ids=new Set(),seen=new Set();let cursor='';
   try{do{const page=await line.lineGet(`/v2/bot/${row.source_kind}/${row.source_id}/members/ids`+(cursor?'?start='+encodeURIComponent(cursor):''),{timeoutMs:10000});if(!Array.isArray(page.memberIds)||page.memberIds.some(id=>!uid.test(id)))throw Error();page.memberIds.forEach(id=>ids.add(id));cursor=page.next||'';if(ids.size>2000||seen.has(cursor)&&cursor)throw Error();seen.add(cursor);}while(cursor);}catch{throw fail('LINE 暫時無法提供完整群組名單。請改從公司組織選人，這次尚未分享。');}
   const people=await mapLimit([...ids],id=>identity(id,input.tenantKey));let missing=0;
   for(const p of people){if(p&&p.tenantKey===input.tenantKey&&valid.has(p.account))accounts.add(p.account);else missing++;}
   await mapLimit(people.filter(Boolean),p=>member(row,p.userId));await member(row,actor.userId);
   sources.push('LINE 群組：'+(row.display_name||'未命名群組'));
   if(missing)warnings.push('群組共 '+ids.size+' 人，其中 '+missing+' 人尚無可確認的公司帳號，這些人不會收到。');
  }
  if(input.meetingId){
   if(!/^[a-f0-9]{64}$/.test(input.meetingId))throw fail('會議識別不正確。',400);
   const row=(await pool.query('SELECT w.*,p.participants,p.tenant_key,p.cancelled FROM central_archive.meeting_workspaces w JOIN central_archive.conversations c ON c.key=w.conversation_key LEFT JOIN central_archive.meeting_plans p ON p.workspace_id=w.id WHERE w.id=$1 AND c.bot_id=$2',[input.meetingId,botId])).rows[0];
   if(!row||row.receipt?.deletion?.active||row.cancelled||row.state!=='published')throw fail('會議已撤回、取消或尚未發布。');
   const host=await identity(row.host_id,input.tenantKey);if(row.tenant_key&&row.tenant_key!==input.tenantKey||!row.tenant_key&&host?.tenantKey!==input.tenantKey)throw fail('會議所屬公司無法確認。',403);
   const participants=Array.isArray(row.participants)?row.participants:row.receipt?.taskParticipants;
   if(!Array.isArray(participants)||!participants.length)throw fail('這場會議沒有完整參與者名單，請改選公司同仁或來源群組。');
   if(host&&valid.has(host.account))accounts.add(host.account);let inactive=0;
   for(const p of participants){if((!p.tenantKey||p.tenantKey===input.tenantKey)&&valid.has(p.account))accounts.add(p.account);else inactive++;}
   if(!row.participants)warnings.push('此舊會議僅保存任務參與者，請確認下方名單是否包含所有要通知的人。');
   if(inactive)warnings.push(inactive+' 位參與者已不在目前公司名單，這些人不會收到。');
   sources.push('會議：'+String(row.fields?.settings?.topic||'原會議'));
  }
  accounts.delete(input.account);return {ok:true,accounts:[...accounts].sort(),sources,warnings};
 };
}

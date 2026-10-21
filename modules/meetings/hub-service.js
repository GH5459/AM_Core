import {meetingAudioStream,AUDIO_TRANSPORT} from './audio-stream.js';
import {multilingualScript} from "./multilingual.js";
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {sendJson} from '../../core/util.js';
import {failure,initialFields,todos} from './workspace-model.js';
import {meetingTaskProgress} from './task-progress.js';
import {planInput,audioInput,HUB_CONTRACT} from './hub-model.js';
import {hubHtml} from './hub-ui.js';
import {createLineGroupAvailability} from '../../core/line-group-availability.js';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export function meetingHub({locale,pool,botId,platform,env,store,getConversation,authenticate,assertMember,tenantFor,base,request,publicationReader=async()=>false}){
 const origin=()=>new URL(env.AMCORE_MEETINGS_LIFF_ENDPOINT_URL||base()+'/meetings/review').origin;
 const file=r=>r.receipt?.hubAudio||null;
 const audioStream=meetingAudioStream({pool,store,platform,env,check});
 const readProgress=meetingTaskProgress({pool,platform});
 const groupOptions=createLineGroupAvailability((...args)=>platform.lineGet(...args));
 const plan=async id=>(await pool.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1',[id])).rows[0];
 async function identity(id,tenant){const who=await platform.meetingShareIdentity?.(id,tenant);if(!who)throw failure(403,'請先完成本人工作帳號連線，並確認仍為有效同仁。');return who;}
 async function participant(r,id){if(!r?.receipt?.planInputHash)return false;const p=await plan(r.id);if(!p)return false;const who=await identity(id,p.tenant_key);return p.participants.some(a=>a.account===who.account);}
 async function check(r,row,actor,host=false){if(!row||row.bot_id!==botId)throw failure(403,'此會議不屬於目前的服務。');actor.meetingIdentity??=await identity(actor.id);if(host&&actor.id!==r.host_id)throw failure(403,'只有主持人可管理排程及錄音。');if(actor.memberConversation!==row.key)try{await assertMember(row,actor.id);}catch(e){if(!await participant(r,actor.id))throw e;}if(!row.enabled||['left','blocked'].includes(row.connection_state))throw failure(409,'來源對話會議功能目前未開啟。');}
 async function body(req){let n=0,a=[];for await(const b of req){n+=b.length;if(n>3000000)throw failure(413,'內容過大。');a.push(b);}try{return JSON.parse(Buffer.concat(a).toString());}catch{throw failure(400,'資料格式不正確。');}}
 async function enqueue(db,r,p){
  const host=await identity(r.host_id,p.tenant_key),accounts=[...new Set([...(r.receipt?.externalCalendar?[]:[host.account]),...p.participants.map(x=>x.account).filter(a=>!r.receipt?.externalCalendar||a!==host.account)])];
  if(p.calendar_enabled&&!p.cancelled)for(const account of accounts)await db.query(`INSERT INTO central_archive.meeting_calendar_links(workspace_id,account,tenant_key,desired_revision) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,account) DO UPDATE SET desired_revision=$4,state='pending',updated_at=now()`,[r.id,account,p.tenant_key,p.version]);
  await db.query(`UPDATE central_archive.meeting_calendar_links SET desired_revision=$2,state='pending',updated_at=now() WHERE workspace_id=$1`,[r.id,p.version]);
 }
 async function externalSource(r,p,actor){
  let ref=r.receipt?.externalCalendarSource;
  const who=await identity(actor.id,p.tenant_key);
  if(!ref){
   const start=new Date(Date.parse(p.start_at)+8*3600000).toISOString().slice(0,10);
   const week=await calendar(actor,{action:'calendar-week',start});
   const event=week.items.find(e=>e.workspaceId===r.id);
   if(!event)throw failure(409,'找不到原 Google 行程，請核對原日曆後再邀請；不會另建主持人行程。');
   const read=await calendar(actor,{action:'calendar-read',calendarRef:event.calendarRef});
   ref={account:who.account,calendarId:read.calendarId,googleAccount:read.googleAccount,eventId:read.event.id};
  }
  if(ref.account!==who.account)throw failure(409,'原行程的本人帳號已變更，請先核對。');
  const result=await platform.syncMeetingCalendar(p.tenant_key,{action:'calendar-read',...ref});
  const event=result.items?.find(e=>e.id===ref.eventId);
  if(!event?.iCalUID)throw failure(409,'原日曆尚未提供可核對的行程識別，請稍後重試。');
  return {...ref,iCalUID:event.iCalUID,start:event.start,end:event.end,allDay:event.allDay,topic:event.topic,location:event.location};
 }
 async function saveInvitations(r,row,actor,input){
  await check(r,row,actor,true);
  if(!r.receipt?.externalCalendar)throw failure(409,'請使用這場會議的排程設定。');
  if(!Array.isArray(input.accounts)||input.accounts.length>200||input.accounts.some(a=>typeof a!=='string'||!/^\d{1,20}$/.test(a))||typeof input.calendar!=='boolean'||!Number.isSafeInteger(input.version))throw failure(400,'請選擇有效的內部參與者。');
  const org=await platform.meetingOrganization(actor.id),host=await identity(actor.id),prior=await plan(r.id);
  if(!prior||prior.tenant_key!==host.tenantKey||org.tenantKey!==host.tenantKey)throw failure(409,'會議服務已變更，請重新確認。');
  const participants=[...new Set(input.accounts)].filter(a=>a!==host.account).map(account=>{const person=org.people.find(p=>p.account===account);if(!person)throw failure(409,'參與者已不在有效同仁名單，請重新選擇。');return {account,name:person.name};});
  let source=null,sourceError='';if(input.calendar)try{source=await externalSource(r,prior,actor);}catch(e){if(e.status===403)throw e;sourceError='原 Google 行程尚未核對，請確認本人日曆連線後重試邀請同步';}
  return store.locked(r.id,async(current,db)=>{
   const p=(await db.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1 FOR UPDATE',[r.id])).rows[0];
   if(Number(p.version)!==input.version)throw failure(409,'邀請名單已更新，請重讀後比較；你的選擇尚未覆寫。');
   if(['processing','publishing'].includes(current.state))throw failure(409,'目前正在整理或發布，請稍後調整邀請。');
   await db.query(`UPDATE central_archive.meeting_workspaces SET receipt=receipt||$2::jsonb WHERE id=$1`,[r.id,JSON.stringify({externalSyncError:sourceError,...source?{externalCalendarSource:source}:{}})]);
   const next=(await db.query(`UPDATE central_archive.meeting_plans SET participants=$2::jsonb,calendar_enabled=$3,version=version+1,updated_at=now() WHERE workspace_id=$1 RETURNING *`,[r.id,JSON.stringify(participants),input.calendar])).rows[0];
   await enqueue(db,current,next);return next;
  });
 }
 async function savePlan(r,row,actor,input){const v=planInput(input);if(r.receipt?.externalCalendar)throw failure(409,'此會議來自 Calendar，排程請到原日曆調整；會前資料及錄音仍可使用。');await check(r,row,actor,true);const org=await platform.meetingOrganization(actor.id),host=await identity(actor.id);if(org.tenantKey!==host.tenantKey)throw failure(409,'組織來源已變更。');
  const participants=v.accounts.map(account=>{const p=org.people.find(x=>x.account===account);if(!p)throw failure(409,'參與者名單已更新，請重新選擇。');return {account,name:p.name};});
  return store.locked(r.id,async(current,db)=>{const p=(await db.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1 FOR UPDATE',[r.id])).rows[0];if(!p||Number(p.version)!==v.version)throw failure(409,'排程已更新，請先重新讀取；你的輸入尚未覆寫。');if(p.tenant_key!==host.tenantKey)throw failure(409,'會議服務已變更，請聯絡管理者。');
   if(['processing','publishing'].includes(current.state))throw failure(409,'目前正在整理或發布，請稍後調整。');
   const next=(await db.query(`UPDATE central_archive.meeting_plans SET participants=$2::jsonb,start_at=$3,end_at=$4,location=$5,calendar_enabled=$6,cancelled=$7,topic=$8,version=version+1,updated_at=now() WHERE workspace_id=$1 RETURNING *`,[r.id,JSON.stringify(participants),v.start,v.end,v.location,v.calendar,v.cancelled,v.topic])).rows[0];
   // Published record metadata stays audited in the original revision workflow.
   if(current.state!=='published')await db.query(`UPDATE central_archive.meeting_workspaces SET fields=jsonb_set(fields,'{settings}',(fields->'settings')||$2::jsonb),field_versions=jsonb_set(field_versions,'{settings}',to_jsonb(COALESCE((field_versions->>'settings')::integer,0)+1)),revision=revision+1 WHERE id=$1`,[r.id,JSON.stringify({topic:v.topic,date:v.start.slice(0,10)})]);
   await enqueue(db,current,next);return next;
  });
 }
 async function upload(r,row,actor,v){audioInput(v);if(!['setup','failed'].includes(r.state))throw failure(409,'此階段不能替換錄音。');
  if(v.action==='audio-begin'){await pool.query(`INSERT INTO central_archive.meeting_audio_uploads(workspace_id,upload_id,actor_id,mime,filename) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[r.id,v.uploadId,actor.id,v.mime,v.filename]);}
  const u=(await pool.query('SELECT * FROM central_archive.meeting_audio_uploads WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId])).rows[0];if(!u||u.actor_id!==actor.id)throw failure(403,'找不到本人的錄音上傳。');
  if(v.action==='audio-begin'){if(u.mime!==v.mime||u.filename!==v.filename)throw failure(409,'上傳識別已用於其他錄音。');const received=(await pool.query('SELECT part,hash FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2 ORDER BY part',[r.id,v.uploadId])).rows;return {saved:u.state==='saved',received};}
  if(v.action==='audio-part'){
   if((await pool.query('SELECT upload_id FROM central_archive.meeting_audio_streams WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId])).rows.length)throw failure(409,'此錄音使用新版續傳，請重新載入原頁面。');
   const bytes=Buffer.from(v.bytes,'base64');if(!bytes.length||bytes.length>2097152)throw failure(413,'錄音分段過大或空白。');
   return store.locked(r.id,async(current,db)=>{if(!['setup','failed'].includes(current.state))throw failure(409,'會議已開始整理。');const state=(await db.query('SELECT state FROM central_archive.meeting_audio_uploads WHERE workspace_id=$1 AND upload_id=$2 FOR UPDATE',[r.id,v.uploadId])).rows[0];if(state.state!=='receiving')throw failure(409,'錄音已保存，不能修改分段。');const prior=(await db.query('SELECT hash FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2 AND part=$3',[r.id,v.uploadId,v.part])).rows[0];if(prior){if(prior.hash!==sha(bytes))throw failure(409,'同一分段內容不同，請重新上傳。');return {saved:true};}const total=Number((await db.query('SELECT COALESCE(sum(octet_length(bytes)),0) AS size FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId])).rows[0].size);if(total+bytes.length>512*1024*1024)throw failure(413,'單份錄音上限為512MB，請分場整理。');await db.query('INSERT INTO central_archive.meeting_audio_chunks VALUES($1,$2,$3,$4,$5)',[r.id,v.uploadId,v.part,bytes,sha(bytes)]);return {saved:true};});
  }
  if(v.action!=='audio-finish')throw failure(400,'不支援錄音操作。');
  return store.locked(r.id,async(current,db)=>{
   if(!['setup','failed'].includes(current.state))throw failure(409,'會議已開始整理。');
   const status=(await db.query('SELECT * FROM central_archive.meeting_audio_uploads WHERE workspace_id=$1 AND upload_id=$2 FOR UPDATE',[r.id,v.uploadId])).rows[0];if(status.state==='saved')return {saved:true};
   const info=(await db.query('SELECT count(*) AS n,sum(octet_length(bytes)) AS size,min(part) AS first,max(part) AS last FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId])).rows[0];if(Number(info.n)!==v.parts||info.first!==0||info.last!==v.parts-1)throw failure(409,'錄音尚未完整上傳，請按繼續上傳。');
   const folder=row.drive_folder_id||await platform.drive.ensureFolder((row.display_name||'會議')+' · '+row.key.slice(0,12),env.AMCORE_CENTRAL_ARCHIVE_DRIVE_ROOT_FOLDER_ID);if(!folder)throw failure(503,'原錄音資料夾尚未可用。');
   const token=await platform.drive.getAccessToken(),tag=sha(r.id+':'+v.uploadId),query="'"+folder+"' in parents and trashed=false and appProperties has {key='meetingUpload' and value='"+tag+"'}";
   const search=await fetch('https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q:query,fields:'files(id,webViewLink)',supportsAllDrives:'true',includeItemsFromAllDrives:'true'}),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!search.ok)throw failure(503,'原錄音保存服務暫時無法確認。');const found=(await search.json()).files||[];if(found.length>1)throw failure(409,'錄音來源重複，請聯絡管理者。');
   async function* chunks(){for(let i=0;i<v.parts;i++){const c=(await db.query('SELECT bytes FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2 AND part=$3',[r.id,v.uploadId,i])).rows[0];yield c.bytes;}}
   const saved=found[0]||await platform.drive.uploadStream(Readable.from(chunks()),u.filename,u.mime,folder,Number(info.size),{appProperties:{meetingUpload:tag}});
   if(!saved?.id||!/^[-_a-zA-Z0-9]+$/.test(saved.id))throw failure(503,'雲端尚未確認錄音保存完成，請保留裝置暫存並重試。');
   const verified=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(saved.id)+'?'+new URLSearchParams({fields:'id,size,trashed,appProperties,parents',supportsAllDrives:'true'}),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!verified.ok)throw failure(503,'暫時無法確認原錄音，請重試。');const meta=await verified.json();if(meta.trashed||meta.id!==saved.id||Number(meta.size)!==Number(info.size)||meta.appProperties?.meetingUpload!==tag||!meta.parents?.includes(folder))throw failure(409,'錄音尚未完整保存到原資料夾，請保留裝置暫存並重試。');
   saved.webViewLink||='https://drive.google.com/file/d/'+saved.id+'/view';
   await db.query(`UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{hubAudio}',$2::jsonb),filename=$3,revision=revision+1 WHERE id=$1`,[r.id,JSON.stringify(saved),u.filename]);await db.query(`UPDATE central_archive.meeting_audio_uploads SET state='saved',drive_file=$3::jsonb WHERE workspace_id=$1 AND upload_id=$2`,[r.id,v.uploadId,JSON.stringify(saved)]);
   await db.query('DELETE FROM central_archive.meeting_audio_chunks WHERE workspace_id=$1 AND upload_id=$2',[r.id,v.uploadId]);return {saved:true};
  });
 }
 async function detail(r,row,actor,v){await check(r,row,actor,v.action!=='plan-read'&&v.action!=='preparation');
  if(v.action==='preparation-init'){if(typeof v.text!=='string'||v.text.length>60000)throw failure(400,'會前資料請限60000字。');const who=await identity(actor.id);const created=await pool.query(`INSERT INTO central_archive.meeting_plans(workspace_id,tenant_key,topic,preparation) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING workspace_id`,[r.id,who.tenantKey,r.fields.settings.topic,v.text]);if(!created.rows.length)throw failure(409,'資料區已建立，請重讀後比較內容。');}
  else if(v.action==='preparation'){if(typeof v.text!=='string'||v.text.length>60000)throw failure(400,'會前資料請限60000字。');await pool.query(`UPDATE central_archive.meeting_plans SET preparation=$2,preparation_version=preparation_version+1,updated_at=now() WHERE workspace_id=$1 AND preparation_version=$3 RETURNING workspace_id`,[r.id,v.text,v.version]).then(q=>{if(!q.rows.length)throw failure(409,'會前資料已被修改，請比較後再儲存；你的內容仍保留。');});}
  else if(v.action==='plan-save')await savePlan(r,row,actor,v);
  else if(v.action==='invite-save')await saveInvitations(r,row,actor,v);
  else if(v.action==='plan-organization'){const org=await platform.meetingOrganization(actor.id);return {ok:true,organization:org};}
  else if(v.action==='audio-fast-begin')return audioStream.begin(r,row,actor,v);
  else if(v.action==='audio-fast-finish')return audioStream.finish(r,row,actor,v);
  else if(v.action.startsWith('audio-')){const result=await upload(r,row,actor,v);if(v.action!=='audio-finish')return {ok:true,...result};}
  else if(v.action!=='plan-read')throw failure(400,'不支援此操作。');
  const p=await plan(r.id);return {ok:true,audioTransport:AUDIO_TRANSPORT,plan:p,actorId:actor.id,host:actor.id===r.host_id,externalCalendar:!!r.receipt?.externalCalendar,audio:!!file(await store.get(r.id)),calendar:(await pool.query('SELECT account,state,error_code FROM central_archive.meeting_calendar_links WHERE workspace_id=$1 ORDER BY account',[r.id])).rows};
 }
 async function calendar(actor,v){
  const who=await identity(actor.id);let query;
  if(v.action==='calendar-week'){
   if(typeof v.start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.start)||!Number.isFinite(Date.parse(v.start+'T00:00:00+08:00')))throw failure(400,'請選擇有效週次。');
   const start=new Date(v.start+'T00:00:00+08:00'),end=new Date(+start+7*86400000);query={action:'calendar-week',account:who.account,start:start.toISOString(),end:end.toISOString()};
  }else{
   if(typeof v.calendarRef!=='string'||v.calendarRef.length>6000)throw failure(400,'請重新讀取日曆。');
   const [encoded,signature]=v.calendarRef.split('.'),expected=crypto.createHmac('sha256',platform.publicLinkSecret).update(encoded).digest('hex');
   if(!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw failure(403,'日曆入口已失效，請重新讀取。');
   let ref;try{ref=JSON.parse(Buffer.from(encoded,'base64url'));}catch{throw failure(400,'日曆入口不正確。');}
   if(ref.actor!==actor.id||ref.account!==who.account||ref.tenant!==who.tenantKey||ref.expires<Date.now())throw failure(403,'請重新讀取本人的日曆。');
   query={action:'calendar-read',account:who.account,calendarId:ref.calendarId,googleAccount:ref.googleAccount,eventId:ref.eventId};
  }
  let result;try{result=await platform.syncMeetingCalendar(who.tenantKey,query);}catch(e){const messages={GOOGLE_NOT_CONNECTED:'請先在工作日誌連接 Google Calendar。',ACCOUNT_NOT_FOUND:'請先登入工作日誌。',ACCESS_DISABLED:'此帳號的工作日誌尚未開通。',BINDING_CHANGED:'日曆已變更，請重新讀取。',EVENT_UNAVAILABLE:'行程已結束或取消，請重新讀取。'};throw failure(409,messages[e.code]||'Calendar 暫時無法讀取，請稍後重新讀取。');}
  if(v.action!=='calendar-week')return {...result,event:result.items[0],who};
  return {ok:true,items:result.items.map(event=>{const ref={actor:actor.id,account:who.account,tenant:who.tenantKey,calendarId:result.calendarId,googleAccount:result.googleAccount,eventId:event.id,expires:Date.now()+3600000},encoded=Buffer.from(JSON.stringify(ref)).toString('base64url'),operation=sha(JSON.stringify([who.tenantKey,result.calendarId,result.googleAccount,event.id]));return {...event,workspaceId:sha('meeting-plan:'+botId+':'+actor.id+':'+operation),calendarRef:encoded+'.'+crypto.createHmac('sha256',platform.publicLinkSecret).update(encoded).digest('hex')};})};
 }
 async function create(actor,v){
  let external;
  if(v.calendarRef){external=await calendar(actor,{action:'calendar-read',calendarRef:v.calendarRef});const event=external.event;if(!event)throw failure(409,'行程已不存在。');
   if(event.meetingId){const existing=await store.get(event.meetingId);if(existing){const source=await getConversation(existing.conversation_key);await check(existing,source,actor);return {ok:true,id:existing.id,url:origin()+'/meetings/review/work/'+existing.id};}}
   v={...v,operationId:sha(JSON.stringify([external.who.tenantKey,external.calendarId,external.googleAccount,event.id])),topic:event.topic.slice(0,200),location:event.location.slice(0,2000),start:new Date(Date.parse(event.start+(event.allDay?'T00:00:00+08:00':''))+8*3600000).toISOString().slice(0,19)+'+08:00',end:new Date(Date.parse(event.end+(event.allDay?'T00:00:00+08:00':''))+8*3600000).toISOString().slice(0,19)+'+08:00',accounts:[],calendar:false,cancelled:false};
   const existing=await store.get(sha('meeting-plan:'+botId+':'+actor.id+':'+v.operationId));if(existing){await check(existing,await getConversation(existing.conversation_key),actor);return {ok:true,id:existing.id,url:origin()+'/meetings/review/work/'+existing.id};}
  }
  v=planInput(v);if(!/^[a-zA-Z0-9_-]{16,80}$/.test(v.operationId||''))throw failure(400,'建立識別不正確。');const row=await getConversation(v.conversationKey);if(!row||row.bot_id!==botId)throw failure(404,'來源對話不存在。');if(!await groupOptions.available(row))throw failure(409,'此群組目前不可用，請重新讀取群組。');await assertMember(row,actor.id);if(!row.enabled||['left','blocked'].includes(row.connection_state))throw failure(409,'請選擇已開啟會議的來源對話。');const who=await identity(actor.id),org=await platform.meetingOrganization(actor.id),participants=v.accounts.map(account=>{const p=org.people.find(p=>p.account===account);if(!p)throw failure(409,'參與者不在目前有效名單。');return {account,name:p.name};});
  const id=sha('meeting-plan:'+botId+':'+actor.id+':'+v.operationId),event={type:'message',timestamp:Date.now(),source:{type:row.source_kind,userId:actor.id,...row.source_kind==='group'?{groupId:row.source_id}:row.source_kind==='room'?{roomId:row.source_id}:{}},message:{id:'plan:'+v.operationId,type:'audio',fileName:''}},fields=initialFields(event);Object.assign(fields.settings,{topic:v.topic,date:v.start.slice(0,10)});
  const db=await pool.connect();try{await db.query('BEGIN');const payloadHash=sha(JSON.stringify(v));await db.query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,source,filename,state,fields,receipt) VALUES($1,$2,$3,$4,$5,$6::jsonb,'','setup',$7::jsonb,$8::jsonb) ON CONFLICT DO NOTHING`,[id,row.key,event.message.id,actor.id,who.name,JSON.stringify(event),JSON.stringify(fields),JSON.stringify({offerSent:true,linkSent:true,planInputHash:payloadHash,...external?{externalCalendar:true,externalCalendarSource:{account:external.who.account,calendarId:external.calendarId,googleAccount:external.googleAccount,eventId:external.event.id}}:{}})]);const prior=await store.get(id,db);if(!prior||prior.receipt.planInputHash!==payloadHash)throw failure(409,'建立識別已用於其他內容，請重新開啟新增會議。');await db.query(`INSERT INTO central_archive.meeting_plans(workspace_id,tenant_key,participants,start_at,end_at,location,calendar_enabled,topic) VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[id,who.tenantKey,JSON.stringify(participants),v.start,v.end,v.location,v.calendar,v.topic]);const p=(await db.query('SELECT * FROM central_archive.meeting_plans WHERE workspace_id=$1',[id])).rows[0];await enqueue(db,{id,host_id:actor.id},p);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}return {ok:true,id,url:origin()+'/meetings/review/work/'+id};
 }
 async function inventory(actor,v){const who=await identity(actor.id);if(v.action==='calendar-week')return calendar(actor,v);if(v.action==='organization')return {ok:true,organization:await platform.meetingOrganization(actor.id)};
  if(v.action==='history-list'||v.action==='history-read'){
   const row=await getConversation(v.conversationKey);if(!row||row.bot_id!==botId||!row.data_source_id)throw failure(404,'此對話沒有歷史會議來源。');await assertMember(row,actor.id);
   const plain=p=>(p?.title||p?.rich_text||[]).map(x=>x.plain_text||x.text?.content||'').join('');
   if(v.action==='history-list'){if(v.cursor!==undefined&&(typeof v.cursor!=='string'||v.cursor.length>100))throw failure(400,'歷史頁碼不正確。');const j=await request('/data_sources/'+row.data_source_id+'/query','POST',{page_size:30,sorts:[{timestamp:'created_time',direction:'descending'}],...v.cursor?{start_cursor:v.cursor}:{}});return {ok:true,items:(j.results||[]).filter(p=>!p.archived&&!p.in_trash).map(p=>({id:p.id,topic:plain(p.properties?.['會議'])||'歷史會議',date:p.properties?.['日期']?.date?.start||'',url:p.url})),next:j.has_more?j.next_cursor:null};}
   if(!/^[a-f0-9-]{32,36}$/i.test(v.pageId||''))throw failure(400,'會議識別不正確。');const page=await request('/pages/'+v.pageId);if(page.archived||page.in_trash||String(page.parent?.data_source_id||'').replaceAll('-','')!==row.data_source_id.replaceAll('-',''))throw failure(403,'此記錄不屬於原對話。');
   const lines=[];let n=0;async function blocks(id,depth=0){if(depth>6||n>3000)throw failure(413,'會議內容過長，請由原會議連結閱讀。');let cursor;do{const j=await request('/blocks/'+id+'/children?page_size=100'+(cursor?'&start_cursor='+cursor:''));for(const b of j.results||[]){n++;const value=b[b.type],text=(value?.rich_text||[]).map(x=>x.plain_text||x.text?.content||'').join('');if(text)lines.push((b.type==='to_do'?(value.checked?'☑ ':'☐ '):'')+text);if(b.has_children)await blocks(b.id,depth+1);}cursor=j.has_more?j.next_cursor:null;}while(cursor);}await blocks(page.id);await assertMember(row,actor.id);return {ok:true,topic:plain(page.properties?.['會議']),text:lines.join('\n\n'),url:page.url};
  }
  if(v.action==='create')return create(actor,v);
  if(v.action==='sources'){const rows=(await pool.query(`SELECT c.key FROM central_archive.conversations c JOIN central_archive.meeting_settings s ON s.conversation_key=c.key WHERE c.bot_id=$1 AND ($2=true OR s.enabled=true) AND s.connection_state NOT IN ('left','blocked')`,[botId,v.history===true])).rows,items=[];for(let i=0;i<rows.length;i+=5)await Promise.all(rows.slice(i,i+5).map(async x=>{const row=await getConversation(x.key);try{if(!await groupOptions.available(row))return;await assertMember(row,actor.id);items.push({key:row.key,name:row.display_name||'個人對話',kind:row.source_kind});}catch{}}));return {ok:true,sources:items};}
  if(v.action==='task-progress'){
   if(!/^[a-f0-9]{64}$/.test(v.id||''))throw failure(400,'會議識別不正確。');
   const r=await store.get(v.id),row=r&&await getConversation(r.conversation_key);
   if(!r||row?.bot_id!==botId||r.state!=='published')throw failure(404,'找不到可讀取的正式會議。');
   let allowed=r.host_id===actor.id;
   if(!allowed){const p=await plan(r.id);allowed=p?.tenant_key===who.tenantKey&&p.participants?.some(x=>x.account===who.account);}
   if(!allowed)try{await assertMember(row,actor.id);allowed=true;}catch{}
   if(!allowed)allowed=await publicationReader(r,actor.id);
   if(!allowed)allowed=r.shared_people?.some(x=>x.tenantKey===who.tenantKey&&x.account===who.account);
   if(!allowed)throw failure(403,'目前無法讀取這場會議。');
   const p=await readProgress(r,actor);
   // The list receives counts only; task links and completion evidence stay in the original reader.
   return {ok:true,id:r.id,progress:{available:p.available,checkedAt:p.checkedAt,counts:p.counts}};
  }
  if(v.action!=='list')throw failure(400,'不支援此操作。');
  if(v.scope!==undefined&&!['all','shared'].includes(v.scope))throw failure(400,'清單類型不正確。');
  const shared=v.scope==='shared',limit=40,offset=Number(v.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw failure(400,'清單頁碼不正確。');
  const rows=(await pool.query(`SELECT w.*,p.topic AS plan_topic,p.start_at,p.end_at,p.cancelled,p.participants,p.tenant_key FROM central_archive.meeting_workspaces w JOIN central_archive.conversations c ON c.key=w.conversation_key LEFT JOIN central_archive.meeting_plans p ON p.workspace_id=w.id WHERE c.bot_id=$1 AND w.state NOT IN ('offered','declined') AND ($4::boolean=false OR w.state='published' AND w.shared_people @> $5::jsonb) ORDER BY COALESCE(p.start_at,w.created_at) DESC,w.id DESC LIMIT $2 OFFSET $3`,[botId,limit,offset,shared,JSON.stringify([{tenantKey:who.tenantKey,account:who.account}])])).rows,items=[];
  if(shared)return {ok:true,items:rows.map(r=>({id:r.id,topic:r.fields.settings.topic,date:r.fields.settings.date,host:r.host_name,kind:'分享給我的會議',state:'published',taskTotal:todos(r.fields).length,url:origin()+'/meetings/review/work/'+r.id})),next:rows.length===limit?offset+limit:null};
  for(let i=0;i<rows.length;i+=5)await Promise.all(rows.slice(i,i+5).map(async r=>{const row=await getConversation(r.conversation_key);let kind=r.host_id===actor.id?'本人會議':'';if(!kind&&r.tenant_key===who.tenantKey&&r.participants?.some(p=>p.account===who.account))kind='受邀會議';if(!kind)try{await assertMember(row,actor.id);kind='來源對話';}catch{}if(!kind&&await publicationReader(r,actor.id))kind='發布群組會議';if(kind){const publishedGroup=kind==='發布群組會議';items.push({id:r.id,topic:publishedGroup?r.fields.settings.topic:r.plan_topic||r.fields.settings.topic,state:r.state,start:publishedGroup?r.fields.settings.date:r.start_at||r.fields.settings.date,end:publishedGroup?null:r.end_at,cancelled:publishedGroup?false:!!r.cancelled,host:r.host_name,kind,taskTotal:r.state==='published'?todos(r.fields).length:null,url:origin()+'/meetings/review/work/'+r.id});}}));return {ok:true,items,next:rows.length===limit?offset+limit:null};
 }
 async function handle(req,res,url){const liffState=url.searchParams.get('liff.state')||'';if(url.pathname!=='/meetings/review/hub'&&url.pathname!=='/meetings/review/hub/api'&&!(url.pathname==='/meetings/review'&&/^\/hub(?:[?#]|$)/.test(liffState)))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Robots-Tag','noindex, nofollow');
  try{if(req.method==='GET'){if((req.headers.host||url.host)!==new URL(origin()).host){res.statusCode=302;res.setHeader('Location',origin()+'/meetings/review/hub');res.end();return true;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(hubHtml({liffId:env.AMCORE_MEETINGS_LIFF_ID}).replace('<header>',multilingualScript+'<header>'));return true;}
   if(req.method!=='POST'||url.pathname!=='/meetings/review/hub/api')throw failure(405,'不支援此操作。');if(req.headers.origin&&req.headers.origin!==origin())throw failure(403,'請從原會議頁操作。');const actor=await authenticate(req,null,null,false,true),v=await body(req),experience=await locale.profile(actor);if(v.action==='locale'){sendJson(res,200,{ok:true,experience});return true;}if(v.action==='translate'){sendJson(res,200,await locale.translate(actor,null,v));return true;}if(['create','calendar-create'].includes(v.action))await locale.guard(actor);sendJson(res,200,{...await inventory(actor,v),experience});
  }catch(e){sendJson(res,e.status||503,{ok:false,error:e.status?e.message:'會議入口暫時無法使用，請保留內容後重試。'});}return true;
 }
 let draining=false;
 async function drain(){if(draining)return;draining=true;try{const jobs=(await pool.query(`SELECT l.* FROM central_archive.meeting_calendar_links l JOIN central_archive.meeting_workspaces w ON w.id=l.workspace_id JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE c.bot_id=$1 AND l.state='pending' AND (l.lease_until IS NULL OR l.lease_until<now()) ORDER BY l.updated_at LIMIT 3`,[botId])).rows;for(const j of jobs){const claimed=(await pool.query(`UPDATE central_archive.meeting_calendar_links SET lease_until=now()+interval '2 minutes' WHERE workspace_id=$1 AND account=$2 AND desired_revision=$3 AND (lease_until IS NULL OR lease_until<now()) RETURNING account`,[j.workspace_id,j.account,j.desired_revision])).rows;if(!claimed.length)continue;try{const r=await store.get(j.workspace_id),row=await getConversation(r.conversation_key),p=await plan(r.id);await check(r,row,{id:r.host_id},true);if(Number(p.version)!==Number(j.desired_revision))continue;const host=await identity(r.host_id,p.tenant_key),org=await platform.meetingOrganization(r.host_id),removed=p.cancelled||!p.calendar_enabled||j.account!==host.account&&!p.participants.some(x=>x.account===j.account);if(!org.people.some(x=>x.account===j.account))throw Object.assign(Error('inactive'),{code:'ACCESS_DISABLED'});
    const source=r.receipt?.externalCalendarSource;
    if(r.receipt?.externalCalendar&&j.account===host.account){await pool.query("UPDATE central_archive.meeting_calendar_links SET state='reused',lease_until=NULL WHERE workspace_id=$1 AND account=$2 AND desired_revision=$3",[r.id,j.account,j.desired_revision]);continue;}
    if(r.receipt?.externalCalendar&&(r.receipt.externalSyncError||!source?.iCalUID)&&!removed)throw Object.assign(Error('source missing'),{code:'SOURCE_UNAVAILABLE'});
    const result=await platform.syncMeetingCalendar(p.tenant_key,{...(r.receipt?.externalCalendar?{externalSource:source}:{}),meetingId:r.id,account:j.account,revision:Number(p.version),removed,topic:p.topic||r.fields.settings.topic,start:new Date(source?.start?(source.start+(source.allDay?'T00:00:00+08:00':'')):p.start_at).toISOString(),end:new Date(source?.end?(source.end+(source.allDay?'T00:00:00+08:00':'')):p.end_at).toISOString(),location:source?.location??p.location,url:origin()+'/meetings/review/work/'+r.id});
    await pool.query(`UPDATE central_archive.meeting_calendar_links SET state=$4,calendar_id=$5,event_id=$6,google_account=$7,applied_revision=$3,error_code='',lease_until=NULL,updated_at=now() WHERE workspace_id=$1 AND account=$2 AND desired_revision=$3`,[r.id,j.account,j.desired_revision,removed?'removed':result.reused?'reused':'synced',result.calendarId,result.eventId,result.googleAccount]);
   }catch(e){const codes={SOURCE_UNAVAILABLE:'請先核對原日曆，再儲存邀請重試',IDEMPOTENCY_CONFLICT:'行程識別有衝突，請先核對；不會另建副本',CALENDAR_EXTERNAL_CHANGED:'原日曆已在外部修改，請先核對',GOOGLE_NOT_CONNECTED:'請在工作日誌連接Google後重試',ACCESS_DISABLED:'帳號目前未開通',ACCOUNT_NOT_FOUND:'請先登入工作日誌',BINDING_CHANGED:'Google帳號已變更，請核對原日曆',CALENDAR_NOT_WRITABLE:'原日曆無法編輯'};await pool.query(`UPDATE central_archive.meeting_calendar_links SET state='failed',error_code=$4,lease_until=NULL,updated_at=now() WHERE workspace_id=$1 AND account=$2 AND desired_revision=$3`,[j.workspace_id,j.account,j.desired_revision,codes[e.code]||'同步未完成，請儲存排程重試']);}}
 }finally{draining=false;}}
 return {binary:audioStream.chunk,handle,detail,participant,file,plan,inventory,check,drain,contract:HUB_CONTRACT};
}

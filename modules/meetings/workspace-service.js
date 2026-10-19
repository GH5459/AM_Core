import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {createWorkspaceStore} from './workspace-store.js';
import {WORKSPACE_CONTRACT,MEETING_TYPES,failure,todos,recordText,meetingToday,checkPublication,checkField} from './workspace-model.js';
import {workspaceHtml} from './workspace-ui.js';
import {canReadShared,readerData,audioTickets} from './workspace-access.js';
import {workspaceRevisions} from './workspace-revisions.js';
import {recordBlocks} from './workspace-collaboration.js';
import {sendJson} from '../../core/util.js';

const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const uid=s=>/^U[a-f0-9]{32}$/i.test(s||'');
const rich=s=>[{type:'text',text:{content:String(s).slice(0,1900)}}];
export function createMeetingWorkspace({pool,botId,platform,archive,env,context,tenantFor,getConversation,ensureDatabase,request,meetingModule,logger=console}){
 const store=createWorkspaceStore(pool),running=new Map();let recovering=false,cutover;
 async function accepts(event){if(cutover===undefined){const row=(await pool.query('SELECT cutover_at FROM central_archive.meeting_workspace_release WHERE contract=$1',[WORKSPACE_CONTRACT])).rows[0];if(!row)throw Error('workspace_migration_required');cutover=Date.parse(row.cutover_at);}return event.timestamp>=cutover;}
 const base=()=>new URL(env.AMCORE_PUBLIC_BASE_URL||platform.publicBaseUrl).origin;
 const link=id=>base()+'/meetings/review/work/'+id;
 const revisionJobs=workspaceRevisions({pool,store,conversation,assertMember,validateAssignees,platform,request,link,logger});
 const audioAccess=()=>audioTickets(platform.publicLinkSecret||env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY||'');
 function loginPage(row,id){
  const configured=tenantFor(row).config.meetings.liffEndpointUrl||env.AMCORE_MEETINGS_LIFF_ENDPOINT_URL;
  const endpoint=new URL(configured||base()+'/meetings/review');
  if((configured&&endpoint.protocol!=='https:')||!['https:','http:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.pathname.replace(/\/+$/,'')!=='/meetings/review'||endpoint.search||endpoint.hash)throw failure(503,'會議登入入口設定不正確，請聯絡管理者。');
  return new URL('/meetings/review/work/'+id,endpoint.origin);
 }
 async function conversation(r){const row=await getConversation(r.conversation_key);if(!row||row.bot_id!==botId)throw failure(404,'找不到這場會議。');return row;}
 async function assertMember(row,userId){
  if(!uid(userId))throw failure(403,'請先登入。');
  if(row.source_kind==='user'){if(userId!==row.source_id)throw failure(403,'這是私人會議，僅本人可開啟。');return;}
  try{const p=await platform.lineGet(`/v2/bot/${row.source_kind}/${row.source_id}/member/${userId}`,{timeoutMs:8000});if(p.userId!==userId)throw Error('mismatch');}
  catch{throw failure(403,'無法確認你仍是來源對話的成員，請從原對話重新開啟。');}
 }
 async function liffFor(row){return tenantFor(row).config.meetings.liffId;}
 async function namedReader(r,userId){if(r.state!=='published'||!r.shared_people?.length||!platform.meetingShareIdentity)return false;for(const tenantKey of new Set(r.shared_people.map(p=>p.tenantKey))){const who=await platform.meetingShareIdentity(userId,tenantKey);if(who&&r.shared_people.some(p=>p.tenantKey===who.tenantKey&&p.account===who.account))return true;}return false;}
 async function assertRead(r,row,userId){try{await assertMember(row,userId);}catch(e){if(!await namedReader(r,userId))throw e;}}
 async function authenticate(req,row,r,allowReader=false){
  const token=String(req.headers.authorization||'').match(/^Bearer ([^\s]+)$/)?.[1]||'';
  const liff=await liffFor(row);if(!liff||!token||token.length>4096)throw failure(401,'請用 LINE 登入後再開啟。');
  try{
   const v=await fetch('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(token),{signal:AbortSignal.timeout(8000)}),j=await v.json();
   if(!v.ok||Number(j.expires_in)<=0||String(j.client_id)!==String(liff).split('-')[0])throw Error('invalid');
   const p=await fetch('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)}),a=await p.json();
   if(!p.ok||!uid(a.userId))throw Error('profile');let readOnly=false;try{await assertMember(row,a.userId);}catch(e){if(!allowReader||!await namedReader(r,a.userId))throw e;readOnly=true;}return {id:a.userId,name:String(a.displayName||'LINE 成員').slice(0,100),readOnly};
  }catch(e){if(e.status)throw e;throw failure(401,'LINE 登入已失效或暫時無法驗證，請重新登入。');}
 }
 async function offer(row,event,filename,hostName){
  if(!row.enabled||!uid(event.source.userId))return;
  const r=await store.create(row.key,event,filename,hostName);
  if(r.receipt.offerSent||r.state!=='offered')return r;
  const message={type:'template',altText:'是否將錄音建立為會議記錄？',template:{type:'confirm',text:'收到錄音「'+filename.slice(0,70)+'」，是否要建立會議記錄？',actions:[
   {type:'postback',label:'是，建立會議記錄',data:'meetingwork:yes:'+r.id},{type:'postback',label:'這次不用',data:'meetingwork:no:'+r.id}
  ]}};
  await platform.pushLineMessage(row.source_id,message,undefined,{retryKey:'workspace-offer:'+r.id});
  await pool.query(`UPDATE central_archive.meeting_workspaces SET receipt=receipt||'{"offerSent":true}'::jsonb WHERE id=$1`,[r.id]);return r;
 }
 async function choice(event,key){
  const m=String(event.postback?.data||'').match(/^meetingwork:(yes|no):([a-f0-9]{64})$/);if(!m)return false;
  const r=await store.get(m[2]);if(!r||r.conversation_key!==key||event.source.userId!==r.host_id)return true;
  const row=await conversation(r);await assertMember(row,event.source.userId);if(!row.enabled)return true;
  await store.locked(r.id,async(current,db)=>{
   if(current.state==='declined'||m[1]==='no'&&current.state!=='offered')return;
   if(current.state==='offered')await db.query('UPDATE central_archive.meeting_workspaces SET state=$2,updated_at=now() WHERE id=$1',[r.id,m[1]==='yes'?'setup':'declined']);
  });
  const current=await store.get(r.id);
  if(m[1]==='yes'&&current.state!=='declined'){
   await platform.pushLineMessage(row.source_id,'會議工作頁已準備好，請設定主題、類型與參與者後開始製作。\n'+link(r.id),undefined,{retryKey:'workspace-link:'+r.id});
   await pool.query(`UPDATE central_archive.meeting_workspaces SET receipt=receipt||'{"linkSent":true}'::jsonb WHERE id=$1`,[r.id]);
  }return true;
 }
 async function members(row,hostId,observedOnly=false){
  let ids=[],complete=true;
  if(row.source_kind==='user')ids=[row.source_id];
  else if(observedOnly){const observed=await pool.query(`SELECT DISTINCT payload->'event'->'source'->>'userId' AS id FROM central_archive.jobs WHERE conversation_key=$1 AND payload->>'direction'='incoming'`,[row.key]);ids=observed.rows.map(r=>r.id);complete=false;}
  else try{let cursor='';do{const j=await platform.lineGet(`/v2/bot/${row.source_kind}/${row.source_id}/members/ids`+(cursor?'?start='+encodeURIComponent(cursor):''),{timeoutMs:10000});ids.push(...j.memberIds);cursor=j.next||'';}while(cursor);}
  catch{
   complete=false;
   const observed=await pool.query(`SELECT DISTINCT payload->'event'->'source'->>'userId' AS id FROM central_archive.jobs WHERE conversation_key=$1 AND payload->>'direction'='incoming'`,[row.key]);
   ids=observed.rows.map(r=>r.id);
   // Established work identities can supplement observed speakers, but each must
   // pass a current membership check before it is offered as an assignee.
   const known=await platform.meetingTaskDirectory?.();ids.push(...(known||[]).map(p=>p.userId));
   try{const bound=await pool.query("SELECT DISTINCT user_id FROM line_bindings.bindings WHERE status='bound' AND confirmed_at IS NOT NULL");ids.push(...bound.rows.map(p=>p.user_id));}catch{logger.warn('Meeting member roster: prior identity directory unavailable.');}
  }
  ids=[...new Set([...ids,hostId])].filter(uid);const people=[];
  for(let i=0;i<ids.length;i+=5)await Promise.all(ids.slice(i,i+5).map(async id=>{
   try{await assertMember(row,id);const profile=await platform.lineGet(row.source_kind==='user'?'/v2/bot/profile/'+id:`/v2/bot/${row.source_kind}/${row.source_id}/member/${id}`,{timeoutMs:8000});
    const work=await platform.meetingTaskIdentity?.(id);people.push({id,name:String(work?.name||profile.displayName||'群組成員').slice(0,100),workReady:Boolean(work),account:work?.account||''});
   }catch{/* Departed/unverifiable users are excluded, never guessed by name. */}
  }));
  return {people:people.sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')),complete};
 }
 async function original(r,row){const item=await archive.original(r.message_id,row.source_kind==='user'?{userId:row.source_id}:{groupId:row.source_id});if(!item?.file?.id)throw failure(503,'原始錄音仍在保存中或尚未可用，請稍後重試。');return item.file;}
 async function download(r,row){const file=await original(r,row);if(Number(file.size)>64*1024*1024)throw failure(413,'主要辨識未完成，且錄音超過備援的 64 MB 上限，請稍後重試或拆分錄音。');
  const token=await platform.drive.getAccessToken(),response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw failure(503,'錄音暫時無法讀取。');const chunks=[];let size=0;for await(const b of response.body){size+=b.length;if(size>64*1024*1024)throw failure(413,'錄音超過備援的 64 MB 上限，請稍後重試或拆分錄音。');chunks.push(Buffer.from(b));}return {buffer:Buffer.concat(chunks),contentType:response.headers.get('content-type')||'audio/mp4'};
 }
 async function generate(r,row){
  const heartbeat=setInterval(()=>pool.query(`UPDATE central_archive.meeting_workspaces SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND state='processing'`,[r.id]).catch(()=>{}),20000);heartbeat.unref();
  try{
   const ctx=await context(row,r.source,{senderName:r.host_name});await original(r,row);
   const audioStreamFactory=async()=>{const file=await original(r,row),token=await platform.drive.getAccessToken();const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error('original_audio_unavailable');return {stream:response.body};};
   const result=await meetingModule.generateWorkspace({tenant:ctx.tenant,audioStreamFactory,loadAudio:()=>download(r,row),filename:r.filename,settings:r.fields.settings});
   const fields={...r.fields,record:recordText(result.parsed),transcript:result.diarized};
   const versions={...r.field_versions,record:1,transcript:1};
   for(const t of (result.parsed.todos||[]).slice(0,60)){
    const key='todo:'+crypto.randomUUID();fields[key]={content:String(t.content||'').slice(0,4000),ownerId:'',due:meetingToday(),evidence:'AI 待辦候選；原文提及：'+String(t.owner||'未指定負責人')+'／'+String(t.due||'未指定日期')};versions[key]=1;
   }
   await pool.query(`UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb,field_versions=$3::jsonb,result=$4::jsonb,state='review',revision=revision+1,lease_until=NULL,updated_at=now() WHERE id=$1 AND state='processing'`,[r.id,JSON.stringify(fields),JSON.stringify(versions),JSON.stringify({segments:result.segments,warning:result.warning})]);
  }catch(e){await pool.query(`UPDATE central_archive.meeting_workspaces SET state='failed',error_code=$2,lease_until=NULL,updated_at=now() WHERE id=$1 AND state='processing'`,[r.id,e.status===413?e.message:'製作未完成，原始錄音及設定仍保留；主持人可重試。']);logger.warn('Meeting workspace generation failed; source retained.');}finally{clearInterval(heartbeat);}
 }
 async function validateAssignees(r,row){
  const entries=todos(r.fields),assigned=entries.filter(t=>t.ownerId);if(!assigned.length)return [];
  const ids=[...new Set([r.host_id,...assigned.map(t=>t.ownerId)])],results=new Map();
  for(let i=0;i<ids.length;i+=5)await Promise.all(ids.slice(i,i+5).map(async id=>{await assertMember(row,id);results.set(id,await platform.meetingTaskIdentity?.(id));}));
  const missing=entries.flatMap((t,i)=>t.ownerId&&!results.get(t.ownerId)?[i+1]:[]),host=results.get(r.host_id);
  if(missing.length||!host)throw failure(409,[!host?'主持人尚未完成 LINE 與工作日誌連線。':'',missing.length?'第 '+missing.join('、')+' 項待辦的負責人尚未完成連線。':'','請相關人員在與葉小蝸的個人對話輸入「工作日誌」，完成本人登入後再發布；或取消指派，保留為會議待辦。'].filter(Boolean).join(''));
  if(assigned.some(t=>results.get(t.ownerId).tenantKey!==host.tenantKey))throw failure(409,'負責人與主持人的工作日誌服務不同，請重新選擇同一服務的負責人。');
  return assigned.map(t=>results.get(t.ownerId));
 }
 async function publish(r,row){
  const db=await pool.connect();let locked=false;
  try{
   locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',['publish-meeting:'+r.id])).rows[0].ok;if(!locked)return;
   r=await store.get(r.id);if(r.state!=='publishing')return;
   await assertMember(row,r.host_id);await validateAssignees(r,row);
   const ctx=await context(row,r.source,{senderName:r.host_name}),target=await ensureDatabase(row),audio=await original(r,row),marker='meeting-workspace:'+r.id;
   let receipt={...r.receipt};const save=async()=>{await pool.query(`UPDATE central_archive.meeting_workspaces SET receipt=$2::jsonb,error_code='',updated_at=now() WHERE id=$1`,[r.id,JSON.stringify(receipt)]);};
   if(!receipt.notionId){
    const found=await request('/data_sources/'+target.dbId+'/query','POST',{filter:{property:'來源識別',rich_text:{equals:marker}},page_size:2});
    if(found.results?.length>1)throw Error('duplicate_meeting_source');
    const page=found.results?.[0]||await request('/pages','POST',{parent:{type:'data_source_id',data_source_id:target.dbId},properties:{
     '會議':{title:rich(r.fields.settings.date+' '+r.fields.settings.topic)},'日期':{date:{start:r.fields.settings.date}},'類型':{select:{name:r.fields.settings.type}},
     '參與者':{rich_text:rich(r.fields.settings.speakers.map(s=>s.name).filter(Boolean).join('、'))},'原始錄音名稱':{rich_text:rich(r.filename)},'Google Drive 錄音':{url:audio.webViewLink},'錄音保存狀態':{rich_text:rich('已保存')},'來源識別':{rich_text:rich(marker)}
    }});receipt.notionId=page.id;await save();
   }
   const lines=['會議記錄',r.fields.record,'','待辦事項',...todos(r.fields).map((t,i)=>`${i+1}. ${t.content}\n負責人：${t.ownerId?receipt.ownerNames?.[t.ownerId]||t.ownerId:'未分派'}；截止日期：${t.due||'未設定'}\n依據：${t.evidence}`),'','逐字稿',r.fields.transcript||r.result.warning||'未提供','',`來源：${row.display_name||'LINE 對話'}／${r.filename}／上傳者 ${r.host_name}／${new Date(r.source.timestamp).toISOString()}／訊息 ${r.message_id}`,`專案／目標：${r.fields.settings.projectGoal||'尚待補充'}`,`原始錄音：${audio.webViewLink}`,`會議連結：${link(r.id)}`,`整理類型：${r.fields.settings.type}\n整理要求：${r.fields.settings.prompt}`];
   const chunks=[];for(const line of lines)for(let i=0;i<line.length||i===0;i+=1800)chunks.push(line.slice(i,i+1800));
   const existing=[];let cursor='';do{const data=await request('/blocks/'+receipt.notionId+'/children?page_size=100'+(cursor?'&start_cursor='+cursor:''));existing.push(...data.results);cursor=data.has_more?data.next_cursor:'';}while(cursor);
   const existingText=existing.map(b=>(b.paragraph?.rich_text||[]).map(x=>x.plain_text||x.text?.content||'').join(''));
   if(existingText.length>chunks.length||existingText.some((s,i)=>s!==chunks[i]))throw Error('notion_publication_content_changed');
   for(let i=existing.length;i<chunks.length;i+=50)await request('/blocks/'+receipt.notionId+'/children','PATCH',{children:chunks.slice(i,i+50).map(s=>({object:'block',type:'paragraph',paragraph:{rich_text:rich(s)}}))});
   receipt.notionSaved=true;await save();
   if(!receipt.tasksSaved){const result=await platform.publishMeetingTasks?.({id:r.id,row,source:r.source,hostId:r.host_id,fields:r.fields,url:link(r.id),notionId:receipt.notionId});if(todos(r.fields).some(t=>t.ownerId)&&!result)throw Error('task_service_unavailable');receipt.tasks=result?.tasks||[];receipt.taskTenant=result?.tenantKey||'';receipt.knownTaskIds=receipt.tasks.map(t=>t.id).filter(Boolean);receipt.tasksSaved=true;await save();}
   if(!receipt.notified){
    const summary='會議記錄已發布：'+r.fields.settings.topic+'\n主持人：'+r.host_name+'\n已指派 '+todos(r.fields).filter(t=>t.ownerId).length+' 項，未分派 '+todos(r.fields).filter(t=>!t.ownerId).length+' 項。\n'+r.fields.record.slice(0,1800)+'\n\n完整會議記錄：\n'+link(r.id);
    await platform.pushLineMessage(row.source_id,summary,undefined,{retryKey:'workspace-published:'+r.id});receipt.notified=true;await save();
   }
   await pool.query(`UPDATE central_archive.meeting_workspaces SET state='published',error_code='',lease_until=NULL,updated_at=now() WHERE id=$1 AND state='publishing'`,[r.id]);
  }catch{await pool.query(`UPDATE central_archive.meeting_workspaces SET error_code='發布尚未全部完成，內容已鎖定；系統會續作，請勿重建會議。',lease_until=now()+interval '60 seconds' WHERE id=$1`,[r.id]);logger.warn('Meeting publication deferred; receipts retained.');}
  finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['publish-meeting:'+r.id]);db.release();}
 }
 async function deliverLink(r,row){await platform.pushLineMessage(row.source_id,'會議工作頁已準備好，請設定主題、類型與參與者後開始製作。\n'+link(r.id),undefined,{retryKey:'workspace-link:'+r.id});await pool.query(`UPDATE central_archive.meeting_workspaces SET receipt=receipt||'{"linkSent":true}'::jsonb WHERE id=$1`,[r.id]);}
 function launch(r,row){if(running.has(r.id))return;const p=(r.state==='processing'?generate(r,row):r.state==='offered'?offer(row,r.source,r.filename,r.host_name):r.state==='setup'?deliverLink(r,row):publish(r,row)).finally(()=>running.delete(r.id)).catch(async()=>{await pool.query(`UPDATE central_archive.meeting_workspaces SET lease_until=now()+interval '60 seconds' WHERE id=$1`,[r.id]);logger.warn('Meeting workspace job deferred.');});running.set(r.id,p);}
 async function drain(){if(recovering)return;recovering=true;try{
  await pool.query(`UPDATE central_archive.meeting_workspaces SET state='failed',error_code='製作中斷，請主持人核對後重試。',lease_until=NULL WHERE state='processing' AND lease_until<now()`);
  const jobs=(await pool.query(`SELECT w.* FROM central_archive.meeting_workspaces w JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE c.bot_id=$1 AND (w.state IN ('processing','publishing') OR w.state='offered' AND NOT(w.receipt?'offerSent') OR w.state='setup' AND NOT(w.receipt?'linkSent')) AND (w.lease_until IS NULL OR w.lease_until<now()) ORDER BY w.created_at LIMIT 10`,[botId])).rows;
  for(const r of jobs){if(running.size>=1)break;const row=await conversation(r);if(!row.enabled||['left','blocked'].includes(row.connection_state))continue;
   const claim=await pool.query(`UPDATE central_archive.meeting_workspaces SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id`,[r.id]);if(claim.rows.length)launch(r,row);
  }
  if(!running.size){const job=(await pool.query(`SELECT v.* FROM central_archive.meeting_workspace_revisions v JOIN central_archive.meeting_workspaces w ON w.id=v.workspace_id JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE c.bot_id=$1 AND v.state='pending' AND v.base_revision=w.revision AND (v.lease_until IS NULL OR v.lease_until<now()) ORDER BY v.created_at LIMIT 1`,[botId])).rows[0];if(job){const claimed=await pool.query(`UPDATE central_archive.meeting_workspace_revisions SET lease_until=now()+interval '2 minutes' WHERE workspace_id=$1 AND revision=$2 AND (lease_until IS NULL OR lease_until<now()) RETURNING revision`,[job.workspace_id,job.revision]);if(claimed.rows.length){const p=revisionJobs.apply(job).catch(()=>logger.warn('Meeting revision recovery deferred.')).finally(()=>running.delete('revision:'+job.workspace_id));running.set('revision:'+job.workspace_id,p);}}}
 }finally{recovering=false;}}
 async function readBody(req){let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>3000000)throw failure(413,'內容過大。');chunks.push(Buffer.from(b));}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw failure(400,'資料格式不正確。');}}
 async function handle(req,res,url){
  const primary=url.pathname==='/meetings/review'&&req.method==='GET'?String(url.searchParams.get('liff.state')||'').match(/^\/work\/([a-f0-9]{64})(?:[?#].*)?$/):null;
  const match=url.pathname.match(/^\/meetings\/review\/work\/([a-f0-9]{64})(?:\/(api|audio))?$/)||(primary?[primary[0],primary[1],undefined]:null);if(!match)return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  try{
   const r=await store.get(match[1]);if(!r)throw failure(404,'找不到這場會議。');const row=await conversation(r);
   const loginUrl=loginPage(row,r.id);
   if(!match[2]&&req.method==='GET'){
    if((req.headers.host||url.host)!==loginUrl.host){res.statusCode=302;res.setHeader('Location',loginUrl.href);res.end();return true;}
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(workspaceHtml({id:r.id,liffId:await liffFor(row),loginUrl:loginUrl.href,publicAvailable:canReadShared(r)}));return true;
   }
   if(req.headers.origin&&![base(),loginUrl.origin].includes(req.headers.origin))throw failure(403,'請從原工作頁操作。');
   if(match[2]==='audio'&&req.method==='GET'){
    const ticket=url.searchParams.get('ticket');if(ticket){const who=audioAccess().verify(r,ticket);if(who!=='public')await assertRead(r,row,who);}else await authenticate(req,row,r,true);
    const file=await original(r,row),token=await platform.drive.getAccessToken();const range=String(req.headers.range||'');if(range&&!/^bytes=\d*-\d*$/.test(range))throw failure(416,'無效的播放範圍。');
    const controller=new AbortController(),abort=()=>controller.abort(),timeout=setTimeout(abort,15000);req.once?.('aborted',abort);res.once?.('close',abort);let response;
    try{response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+token,...range?{Range:range}:{}},signal:controller.signal});}finally{clearTimeout(timeout);}
    if(![200,206].includes(response.status)){controller.abort();throw failure(response.status===416?416:503,'錄音暫時無法播放。');}res.statusCode=response.status;
    for(const h of ['content-type','content-length','content-range','accept-ranges'])if(response.headers.has(h))res.setHeader(h,response.headers.get(h));Readable.fromWeb(response.body).on('error',()=>res.destroy()).pipe(res);return true;
   }
   if(match[2]!=='api'||req.method!=='POST')throw failure(405,'不支援此操作。');
   const input=await readBody(req);let current=r,actor;
   try{actor=await authenticate(req,row,r,input.action==='read');}catch(e){if(input.action==='read'&&canReadShared(r)){
    sendJson(res,200,{ok:true,access:'public',host:false,actor:{name:'分享觀看'},workspace:{id:r.id,state:'published',revision:Number(r.revision)},reader:readerData(r),audioUrl:'/meetings/review/work/'+r.id+'/audio?ticket='+encodeURIComponent(audioAccess().mint(r,'public'))});return true;
   }throw e;}
   if(actor.readOnly){sendJson(res,200,{ok:true,access:'recipient',host:false,actor:{name:actor.name},workspace:{id:r.id,state:'published',revision:Number(r.revision)},reader:readerData(r),audioUrl:'/meetings/review/work/'+r.id+'/audio?ticket='+encodeURIComponent(audioAccess().mint(r,actor.id))});return true;}
   if(input.action==='read'){if(r.state!=='published')await store.presence(r.id,actor,input.field);}
   else if(input.action==='save-type'){
    if(!['setup','failed'].includes(r.state)||typeof input.name!=='string'||!input.name.trim()||input.name.length>60||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>6000)throw failure(400,'請填寫類型名稱與整理 Prompt。');
    const saved=await pool.query(`INSERT INTO central_archive.meeting_workspace_templates(conversation_key,name,prompt,updated_by) SELECT $1,$2,$3,$4 WHERE $5=0 OR EXISTS(SELECT 1 FROM central_archive.meeting_workspace_templates WHERE conversation_key=$1 AND name=$2 AND version=$5)
     ON CONFLICT(conversation_key,name) DO UPDATE SET prompt=EXCLUDED.prompt,version=meeting_workspace_templates.version+1,updated_by=EXCLUDED.updated_by,updated_at=now() WHERE meeting_workspace_templates.version=$5 RETURNING version`,[row.key,input.name.trim(),input.prompt,actor.id,Number(input.version||0)]);
    if(!saved.rows.length)throw failure(409,'類型已被其他人更新，請重新讀取再儲存。');
   }
   else if(input.action==='edit')current=await store.edit(r.id,actor,input);
   else if(input.action==='sharing'){
    if(actor.id!==r.host_id)throw failure(403,'只有主持人可以管理分享名單。');
    let people;if(input.accounts!==undefined){
     if(!Array.isArray(input.accounts)||input.accounts.length>200||input.accounts.some(a=>typeof a!=='string'))throw failure(400,'分享名單格式不正確。');
     const org=await platform.meetingOrganization?.(r.host_id);if(!org)throw failure(503,'組織架構暫時無法讀取，原分享設定仍保留。');
     people=[...new Set(input.accounts)].map(account=>{const person=org.people.find(p=>p.account===account);if(!person)throw failure(409,'部分同仁已不在有效組織名單，請重新讀取後再選擇。');return {tenantKey:org.tenantKey,account,name:person.name};});
    }current=await store.share(r.id,actor,input.enabled,input.revision,input.version,people);
   }
   else if(input.action==='save-part'){
    if(!row.enabled||['left','blocked'].includes(row.connection_state))throw failure(409,'此對話會議功能已關閉，暫時不能儲存。');
    current=await store.part(r.id,actor,input,async next=>{
     if(input.field?.startsWith('todo:')&&input.value?.ownerId)await assertMember(row,input.value.ownerId);
     if(next.state==='published'){const identities=await validateAssignees(next,row);return Object.fromEntries(identities.map(p=>[p.userId,p.name]));}
     if(input.field?.startsWith('todo:')&&input.value?.ownerId){const userId=input.value.ownerId,identity=await platform.meetingTaskIdentity?.(userId),profile=identity?null:await platform.lineGet(row.source_kind==='user'?'/v2/bot/profile/'+userId:`/v2/bot/${row.source_kind}/${row.source_id}/member/${userId}`,{timeoutMs:8000});return {...next.receipt.ownerNames,[userId]:identity?.name||String(profile?.displayName||'群組成員').slice(0,100)};}
    });drain().catch(()=>{});
   }
   else if(input.action==='revise'){
    if(actor.id!==r.host_id)throw failure(403,'只有主持人可以修訂正式會議。');
    if(!row.enabled||['left','blocked'].includes(row.connection_state))throw failure(409,'此對話會議功能已關閉，暫時不能儲存修訂；仍可關閉對外分享。');
    if(r.state!=='published'||Number(r.revision)!==input.revision)throw failure(409,'正式版本已更新，請先比較最新內容。');
    if(!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields)||Object.keys(input.fields).length>62||typeof input.fields.record!=='string'||typeof input.fields.transcript!=='string')throw failure(400,'修訂內容格式不正確。');
    for(const [key,value]of Object.entries(input.fields)){if(key==='settings')throw failure(400,'正式會議的來源設定保持不變。');checkField(key,value);}
    const fields={...input.fields,settings:r.fields.settings};checkPublication({...r,fields});
    const identities=await validateAssignees({...r,fields},row);const ownerNames=Object.fromEntries(identities.map(p=>[p.userId,p.name]));
    current=await store.revise(r.id,actor,fields,input.revision,ownerNames);drain().catch(()=>{});
   }
   else if(input.action==='start'||input.action==='publish'||input.action==='retry-publish'){
    if(!row.enabled||['left','blocked'].includes(row.connection_state))throw failure(409,'此對話會議功能已關閉或無法接收，請聯絡管理者。');
   if(input.action==='publish'&&r.state==='review'){
     if(actor.id!==r.host_id)throw failure(403,'只有主持人可以發布。');
     if(Number(r.revision)!==input.revision)throw failure(409,'內容剛有修改，請返回檢查後再確認發布。');checkPublication(r);
     const identities=await validateAssignees(r,row);const ownerNames=Object.fromEntries(identities.map(p=>[p.userId,p.name]));
     await pool.query(`UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{ownerNames}',$2::jsonb) WHERE id=$1 AND state='review'`,[r.id,JSON.stringify(ownerNames)]);
    }
    current=await store.transition(r.id,actor,input.action,input.revision);drain().catch(()=>{});
   }else if(!['members','history','organization'].includes(input.action))throw failure(400,'不支援此操作。');
   if(input.action==='organization'&&actor.id!==r.host_id)throw failure(403,'只有主持人可以選擇分享夥伴。');
   const templates=(await pool.query('SELECT name,prompt,version FROM central_archive.meeting_workspace_templates WHERE conversation_key=$1 ORDER BY name',[row.key])).rows;
   const types=[...MEETING_TYPES.filter(t=>!templates.some(x=>x.name===t.name)),...templates.map(t=>({...t,version:Number(t.version)}))];
   const result={ok:true,contract:WORKSPACE_CONTRACT,access:'member',actor,host:actor.id===r.host_id,types,reader:readerData(current),sharing:{enabled:!!current.sharing_enabled,version:Number(current.sharing_version)},audioUrl:'/meetings/review/work/'+current.id+'/audio?ticket='+encodeURIComponent(audioAccess().mint(current,actor.id)),workspace:{id:current.id,state:current.state,revision:Number(current.revision),fields:current.fields,versions:current.field_versions,hostName:current.host_name,filename:current.filename,sourceName:row.display_name,ownerNames:current.receipt.ownerNames||{},warning:current.result.warning||'',segments:current.result.segments||[],error:current.error_code,publishedAt:current.state==='published'?current.updated_at:null},presence:current.state==='published'?[]:await store.people(r.id)};
   result.canEdit=['review','published'].includes(current.state);result.pendingRevision=await revisionJobs.pending(r.id);
   const editing=await store.effective(current);result.editing={fields:editing.fields,versions:editing.field_versions,blocks:recordBlocks(editing),revision:Number(editing.revision)};result.changes=await store.changes(r.id);
   if(result.host)result.sharing.people=current.shared_people;
   if(input.action==='members')result.members=await members(row,r.host_id,input.observed===true);
   if(input.action==='organization'){result.organization=await platform.meetingOrganization?.(r.host_id);if(!result.organization)throw failure(503,'組織架構暫時無法讀取。');}
   if(input.action==='history'){if(input.field!==undefined&&(typeof input.field!=='string'||input.field.length>100))throw failure(400,'修改紀錄範圍不正確。');result.history=await store.history(r.id,input.offset,input.field??null);}
   sendJson(res,200,result);return true;
  }catch(e){if(res.headersSent){res.destroy();return true;}sendJson(res,e.status||503,{ok:false,error:e.status?e.message:'會議服務暫時無法使用，請保留內容後重試。'});return true;}
 }
 return {store,offer,choice,handle,drain,accepts,settle:()=>Promise.all([...running.values()]),health:()=>({contract:WORKSPACE_CONTRACT,publish:'host-published-reader-with-audited-revisions',sharing:'host-opt-in-published-read-only',collaboration:'member-explicit-part-save-v1',namedSharing:'organization-recipient-read-v1',assignment:'owner-and-due-required'})};
}

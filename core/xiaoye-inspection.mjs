import {eventCall} from './xiaoye-secretary-events.mjs';
import {inspectionPage} from './xiaoye-inspection-ui.mjs';
import {prepareMeetingEvidence,verifyMeetingGrant,plainFinding} from './xiaoye-case-evidence.mjs';
export const INSPECTION_CONTRACT='xiaoye-case-inspection-v1';
const ttl=5*60*1000,tickets='xiaoye-inspection-tickets',sessions='xiaoye-inspection-sessions';
const fail=(message,status=403)=>Object.assign(Error(message),{status});
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
const op=v=>{if(typeof v!=='string'||v.length<8||v.length>180)throw fail('缺少已保存的操作識別。',400);return v;};
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
const json=(v,status=200)=>Response.json(v,{status,headers});
async function input(request){const reader=request.body?.getReader();if(!reader)throw fail('缺少查核內容。',400);const parts=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw fail('查核內容過長。',413);}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('查核格式錯誤。',400);}}
async function put(db,ns,key,value){await db.prepare('INSERT OR IGNORE INTO documents(namespace,key,value,revision) VALUES(?,?,?,1)').bind(ns,key,JSON.stringify(value)).run();}
async function audit(env,context,operation,action){await put(env.DB,'xiaoye-inspection-audit',await sha(action+':'+context.id+':'+context.version+':'+operation),{account:'ai-xiaoye',taskId:context.id,eventId:context.eventId,version:context.version,action,at:new Date().toISOString()});}
async function check(env,c,v,h){
 if(!/^work-[a-f0-9-]{36}$/.test(v.id||'')||!Number.isSafeInteger(v.version)||!env.XIAOYE_EVENTS)throw fail('請從目前案件事件取得查核資格。');
 let job;
 if(v.ownerInspectionGrant){
  const grant=(await h.record(env.DB,'xiaoye-owner-inspection-grants',v.ownerInspectionGrant))?.value;
  if(!grant||grant.scope!=='inspect-and-record'||grant.id!==v.id||grant.version!==v.version||grant.ownerAccount!==c.ownerAccount||grant.accountId!==c.account.id||grant.expiresAt<=Date.now())throw fail('本人的單案查核交接已到期或變更。');
  await h.currentPerson(env,h.base,{account:c.ownerAccount});job={id:'owner-inspection:'+v.ownerInspectionGrant,taskId:grant.id,sourceVersion:grant.sourceVersion,kind:'inspect',leaseUntil:grant.expiresAt};
 }else{const r=await eventCall(env,'check',{id:v.eventId,lease:v.eventLease});if(!r.ok)throw fail('案件事件已停止或失效。');job=(await r.json()).job;}
 const t=(await h.load(env.DB,v.id))?.task,s=t?.secretary;
 if(!job||job.taskId!==v.id||job.sourceVersion!==s?.sourceVersion||t.version!==v.version||!s||s.sourceWithdrawn||t.deletedAt||t.mergedInto||!['analyze','execute','inspect'].includes(job.kind))throw fail('案件版本已變更，請重新查核。');
 if(job.kind==='analyze'&&(s.stage!=='clarifying'||s.waitingForReporter))throw fail('目前沒有可分析的案件。');
 if(job.kind==='execute'){if(!['approved','executing'].includes(s.stage))throw fail('目前沒有可執行的核准。');await h.approved(t);}
 for(const p of s.reporters){if(p.source?.type==='user'||p.source?.type==='group')await h.linePerson(env,h.base,{...p,userId:p.source.userId,botUserId:p.source.botUserId});else await h.currentPerson(env,h.base,p);}
 if(t.primaryParentId)await h.membership(env,c,t.primaryParentId);else for(const p of c.projects)await h.membership(env,c,p.id);
 if(v.sourceVersion!==undefined&&v.sourceVersion!==s.sourceVersion)throw fail('原回報已變更。');
 if(v.proposalHash!==undefined&&v.proposalHash!==(s.proposal?.hash||null))throw fail('原方案已變更。');
 if(v.accountId!==undefined&&(v.accountId!==c.account.id||v.credentialHash!==c.runnerHash||v.until<=Date.now()))throw fail('查核資格已到期或撤銷。');
 return {task:t,job};
}
async function attachments(env,id){return (await env.DB.prepare("SELECT id,name,mime,size,digest FROM task_attachments WHERE scope='normal' AND target_id=? AND removed_at IS NULL ORDER BY created_at LIMIT 20").bind(id).all()).results;}
async function snapshot(env,c,t){
 const s=t.secretary,p=s.proposal;
 const journals=(await env.DB.prepare("SELECT value FROM documents WHERE namespace='xiaoye-work-journal' AND EXISTS(SELECT 1 FROM json_each(documents.value,'$.entries') e WHERE json_extract(e.value,'$.workId')=?) ORDER BY key DESC LIMIT 100").bind(t.id).all()).results;
 const project=c.projects.find(p=>p.id===t.primaryParentId);
 return {contract:INSPECTION_CONTRACT,readOnly:true,approvalRequired:true,task:{id:t.id,title:t.title,description:t.description,version:t.version,sourceVersion:s.sourceVersion,stage:s.stage,category:s.category,project:project?{id:project.id,label:project.label}:null,reporters:s.reporters.map(p=>({name:p.name,team:p.team})),proposal:p?{version:p.version,summary:p.summary,reason:p.reason,steps:p.steps,systems:p.systems,deploy:p.deploy,validation:p.validation,rollback:p.rollback}:null,feedback:(s.ownerFeedback||[]).map(f=>({text:f.text,at:f.at,withdrawn:!!f.withdrawn,proposalVersion:f.proposalVersion,attachmentIds:f.attachmentIds})),history:(t.history||[]).map(e=>({at:e.at,text:e.text,actor:e.actor?.name||'葉小蝸'})),result:s.result||t.finalResult||'',blocker:s.blocker||'',attachments:await attachments(env,t.id),journal:journals.flatMap(r=>JSON.parse(r.value).entries).filter(e=>e.workId===t.id).map(e=>({at:e.at,action:e.action,text:e.text,stage:e.stage}))}};
}
export async function inspectionRunner(env,c,action,v,h){
 if(action==='health')return {ok:true,contract:INSPECTION_CONTRACT,account:'ai-xiaoye',humanLoginRequired:false,approvalRequired:true,eventRequired:true,inspectionTtlSeconds:ttl/1000};
 if(action==='evidence-check')return verifyMeetingGrant(env,c,v,h,context=>check(env,c,context,h));
 // A retry only acknowledges the already saved write. It does not return case
 // contents after the original event or exact-version handoff has ended.
 if(action==='record-finding'){const previous=await h.replay(env,v.id,v.operationId,{...v,action},c.account);if(previous)return {ok:true,replayed:true};}
 const operation=op(v.operationId),{task,job}=await check(env,c,v,h);
 const context={id:task.id,version:task.version,sourceVersion:task.secretary.sourceVersion,proposalHash:task.secretary.proposal?.hash||null,eventId:job.id,eventLease:job.lease,...v.ownerInspectionGrant?{ownerInspectionGrant:v.ownerInspectionGrant}:{}};
 if(action==='record-finding'){
  const captured=(await h.record(env.DB,'xiaoye-case-evidence',v.evidenceDigest))?.value;
  if(!captured||captured.caseId!==task.id||captured.caseVersion!==task.version||captured.sourceVersion!==task.secretary.sourceVersion||captured.eventId!==context.eventId||captured.ownerInspectionGrant!==(context.ownerInspectionGrant||null))throw fail('請先取得本案當次查核資料，再保存判斷。');
  const finding={...plainFinding(v.finding),id:operation,at:new Date().toISOString(),sourceVersion:task.secretary.sourceVersion,evidenceDigest:v.evidenceDigest};
  const next=structuredClone(task);next.secretary.findings=[...(next.secretary.findings||[]),finding].slice(-30);await check(env,c,context,h);
  if(task.secretary.stage==='awaiting_confirmation'&&task.secretary.result){const prior=task.secretary.findingResultReceipt;next.secretary.findingResultReceipt={fromVersion:prior?.throughVersion===task.version?prior.fromVersion:task.version,throughVersion:task.version+1};}
  const old=await h.load(env.DB,task.id);if(old.task.version!==task.version)throw fail('案件剛有更新，請重新讀取後保存。',409);
  return {ok:true,task:await h.transaction(env,old,next,operation,{...v,action},c.account,'查核原因：'+finding.cause+'\n影響：'+finding.impact+'\n下一步：'+finding.nextStep+'\n目前進度：'+finding.progress)};
 }
 if(action==='inspect'){
  const data=await snapshot(env,c,task);
  try{data.evidence=await prepareMeetingEvidence(env,c,task,context,{check:()=>check(env,c,context,h),record:h.record,preview:h.preview});}
  catch(error){if(error.status===403)throw error;data.evidence={available:false,reason:error.status?error.message:'這場會議的派發資料暫時讀取失敗。',nextStep:'由系統維護人員檢查本案查核連線；你不需要重新回報。'};}
  await check(env,c,context,h);await audit(env,context,operation,'background-read');return {ok:true,...data};
 }
 const fingerprint=JSON.stringify(context),key=await sha('open:'+operation),previous=await h.record(env.DB,tickets,key);
 if(previous&&previous.value.fingerprint!==fingerprint)throw fail('操作識別已用於另一案件或版本。',409);
 await put(env.DB,tickets,key,{fingerprint});if((await h.record(env.DB,tickets,key)).value.fingerprint!==fingerprint)throw fail('操作識別已用於另一案件或版本。',409);
 const token=await sha(c.runnerHash+':'+c.account.id+':'+operation+':'+fingerprint),tokenHash=await sha(token);
 // Stable retry returns the same single-use ticket; raw credentials never enter URLs.
 const saved=await h.record(env.DB,tickets,tokenHash);
 if(!saved){const value={...context,accountId:c.account.id,credentialHash:c.runnerHash,until:Math.min(Date.now()+ttl,job.leaseUntil),fingerprint,operation};await put(env.DB,tickets,tokenHash,value);await put(env.DB,tickets,key,{fingerprint});}
 const ticket=(await h.record(env.DB,tickets,tokenHash)).value;if(ticket.until<=Date.now())throw fail('查核入口已到期，請另建操作識別。',410);
 await audit(env,context,operation,'ticket-issued');
 return {ok:true,url:new URL('/xiaoye/inspect#'+token,env.PUBLIC_ORIGIN).href,expiresAt:ticket.until,readOnly:true};
}
export async function inspectionFetch(request,env,c,h){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/xiaoye/inspect'){
  if(request.method!=='GET')return json({ok:false,error:'Method not allowed'},405);
  const nonce=crypto.randomUUID().replaceAll('-','');
  return new Response(inspectionPage(nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; img-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
 }
 if(!['/api/xiaoye-inspection/exchange','/api/xiaoye-inspection/data'].includes(path)&&!/^\/api\/xiaoye-inspection\/image\/att-[a-f0-9-]{36}$/.test(path))return json({ok:false,error:'找不到查核功能。'},404);
 if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
 if(request.headers.get('Origin')!==env.PUBLIC_ORIGIN||request.headers.get('X-Xiaoye-Inspection')!=='1'||!request.headers.get('Content-Type')?.startsWith('application/json'))throw fail('請由原查核頁開啟。');
 const v=await input(request);if(!v||typeof v!=='object'||Array.isArray(v))throw fail('查核格式錯誤。',400);const operation=op(v.operationId);
 if(path.endsWith('/exchange')){
  if(!/^[a-f0-9]{64}$/.test(v.ticket||''))throw fail('請使用葉小蝸當次案件的查核入口。');
  const key=await sha(v.ticket),row=await h.record(env.DB,tickets,key),ticket=row?.value;if(!ticket||ticket.until<=Date.now())throw fail('查核入口已到期。',410);await check(env,c,ticket,h);
  const token=await sha(v.ticket+':session:'+operation),sessionKey=await sha(token);
  if(ticket.consumedOperation&&ticket.consumedOperation!==operation)throw fail('查核入口已使用。',410);
  if(!ticket.consumedOperation){const result=await env.DB.prepare("UPDATE documents SET value=json_set(value,'$.consumedOperation',?),revision=revision+1 WHERE namespace=? AND key=? AND revision=? AND json_extract(value,'$.consumedOperation') IS NULL").bind(operation,tickets,key,row.revision).run();if(result.meta.changes!==1)throw fail('查核入口已使用，請重新取得。',409);}
  await put(env.DB,sessions,sessionKey,{...ticket,consumedOperation:operation});await audit(env,ticket,operation,'ticket-exchanged');
  return json({ok:true,token,expiresAt:ticket.until,readOnly:true});
 }
 const bearer=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!bearer)throw fail('缺少案件查核資格。');const session=(await h.record(env.DB,sessions,await sha(bearer)))?.value;if(!session)throw fail('查核資格無效。');const {task}=await check(env,c,session,h);
 if(path.endsWith('/data')){const data=await snapshot(env,c,task);await check(env,c,session,h);await audit(env,session,operation,'page-read');return json({ok:true,...data});}
 const id=path.split('/').at(-1),file=(await attachments(env,task.id)).find(f=>f.id===id);if(!file||!['image/png','image/jpeg','image/webp'].includes(file.mime)||file.size>10*1024*1024)throw fail('找不到本案圖片。',404);
 const chunks=(await env.DB.prepare('SELECT content FROM task_attachment_chunks WHERE attachment_id=? ORDER BY part').bind(id).all()).results,bytes=new Uint8Array(file.size);let offset=0;for(const part of chunks){const chunk=new Uint8Array(part.content);if(offset+chunk.length>bytes.length)throw fail('圖片內容不完整。',503);bytes.set(chunk,offset);offset+=chunk.length;}if(offset!==file.size)throw fail('圖片內容不完整。',503);
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==file.digest)throw fail('圖片內容驗證失敗。',503);await check(env,c,session,h);await audit(env,session,operation,'image-read:'+id);
 return new Response(bytes,{headers:{...headers,'Content-Type':file.mime}});
}

import {xiaoyePage} from './xiaoye-secretary-ui.mjs';
export const XIAOYE_CONTRACT='xiaoye-secretary-pilot-v1';
const machinePrefix='/api/integrations/leaf-snail/tasks/secretary/';
const configNs='xiaoye-secretary',AI='ai-xiaoye';
const fail=(text,status=409)=>Object.assign(Error(text),{status});
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const uuidFrom=hex=>hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20,32);
const day=now=>new Date(now+8*3600000).toISOString().slice(0,10);
const text=(v,max=12000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw fail('請填寫有效內容。',400);return v.trim();};
const record=async(db,ns,key)=>{const r=await db.prepare('SELECT value,revision FROM documents WHERE namespace=? AND key=?').bind(ns,key).first();return r?{...r,value:JSON.parse(r.value)}:null;};
const load=async(db,id)=>{const r=await db.prepare('SELECT value,revision FROM work_items WHERE id=?').bind(id).first();return r?{task:JSON.parse(r.value),revision:r.revision,raw:r.value}:null;};
async function body(request,max=16*1024*1024){const reader=request.body?.getReader();if(!reader)throw fail('缺少內容。',400);const chunks=[];let size=0;for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>max){await reader.cancel();throw fail('內容太長。',413);}chunks.push(v.value);}const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('內容格式錯誤。',400);}}
const docsInsert=(db,ns,key,value)=>db.prepare('INSERT INTO documents(namespace,key,value,revision) VALUES(?,?,?,1) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,revision=documents.revision+1').bind(ns,key,JSON.stringify(value));
async function settings(env){const c=(await record(env.DB,configNs,'config'))?.value;if(!c?.enabled||c.contract!==XIAOYE_CONTRACT)throw Object.assign(fail('葉小蝸試行服務尚未開啟。',503),{code:'SECRETARY_DISABLED'});const a=(await record(env.DB,'service-accounts',AI))?.value;if(!a?.active||a.type!=='ai'||a.id!==c.account.id)throw Object.assign(fail('葉小蝸帳號已暫停。',503),{code:'SECRETARY_DISABLED'});return c;}
function visible(t,account,c){return t?.secretary&&[c.ownerAccount,...t.secretary.reporters.map(p=>p.account)].includes(account);}
function view(t,account,c){if(!visible(t,account,c))throw fail('找不到可查看的問題。',404);const copy=structuredClone(t);copy.secretary.reporters=copy.secretary.reporters.map(({source,...p})=>p);if(copy.secretary.approval)delete copy.secretary.approval.sessionHash;delete copy.secretary.lease;delete copy.secretary.leaseUntil;return copy;}
async function membership(env,c,projectId){if(!c.projects.some(p=>p.id===projectId))throw fail('請選擇試行專案。',400);const p=(await load(env.DB,projectId))?.task;if(!p||p.deletedAt||p.mergedInto||p.status==='cancelled'||!p.collaborators?.some(x=>x.account===AI))throw fail('專案或葉小蝸的參與資格已變更。');return p;}
async function currentPerson(env,base,input){
 const request=new Request(env.PUBLIC_ORIGIN+'/api/integrations/leaf-snail/tasks/meeting-person',{method:'POST',headers:{Authorization:'Bearer '+env.LEAF_TASK_SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify({tenantKey:env.LEAF_TASK_TENANT,account:input.account})});
 const r=await base.fetch(request,env,{waitUntil(){}}),v=await r.json();if(!r.ok||!v.person)throw fail('目前無法確認回報人的工作資格。',403);return {account:input.account,name:v.person.name||input.name||input.account,team:v.person.team||''};
}
async function linePerson(env,base,input){
 if(!input||!/^U[0-9a-f]{32}$/i.test(input.userId||'')||!/^U[0-9a-f]{32}$/i.test(input.botUserId||''))throw fail('回報來源無法確認。',403);
 const r=await base.fetch(new Request(env.PUBLIC_ORIGIN+'/api/integrations/leaf-snail/tasks/identity',{method:'POST',headers:{Authorization:'Bearer '+env.LEAF_TASK_SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify({tenantKey:env.LEAF_TASK_TENANT,botUserId:input.botUserId,lineUserId:input.userId})}),env,{waitUntil(){}}),v=await r.json();
 const reverse=await record(env.DB,'line-work-identities','account:'+input.botUserId+':'+input.account);
 if(!r.ok)throw fail('目前無法確認工作身分。',503);
 if(v.identity){if(v.identity.account!==input.account||reverse?.value.lineUserId!==input.userId||reverse.value.identityId!==v.identity.identityId)throw fail('請先完成原 LINE 工作身分確認。',403);}
 else {if(reverse)throw fail('工作身分紀錄不一致，請先核對。',403);const checked=await env.SHARED_ACCESS?.commonLine?.({action:'legacy-check',botUserId:input.botUserId,lineUserId:input.userId,account:input.account});if(!checked?.ok)throw fail('請先完成原 LINE 工作身分確認。',403);}
 return currentPerson(env,base,input);
}
async function replay(env,id,op,input,actor){if(!op)return null;const previous=await env.DB.prepare('SELECT fingerprint,task_id FROM xiaoye_operations WHERE id=?').bind(op).first();if(!previous)return null;const fingerprint=await digest(JSON.stringify([id,input,actor.account]));if(previous.task_id!==id||previous.fingerprint!==fingerprint)throw fail('操作識別已用於其他內容。');return (await load(env.DB,id)).task;}
async function transaction(env,old,next,op,input,actor,note,extra=[],guard='1',guardArgs=[]){
 if(typeof op!=='string'||op.length<8||op.length>180)throw fail('操作識別無效。',400);
 const fingerprint=await digest(JSON.stringify([next.id,input,actor.account]));
 const prior=await env.DB.prepare('SELECT fingerprint,task_id FROM xiaoye_operations WHERE id=?').bind(op).first();
 if(prior){if(prior.fingerprint!==fingerprint||prior.task_id!==next.id)throw fail('操作識別已用於其他內容。');return (await load(env.DB,next.id)).task;}
 const at=new Date().toISOString(),expected=old?.revision||0;
 next.version=(old?.task.version||0)+1;next.updatedAt=at;
 next.history=[...(old?.task.history||[]),{id:op,kind:'xiaoye_'+input.action,actor,at,text:note,mentions:[],targets:[]}];
 const statements=[env.DB.prepare(`INSERT INTO xiaoye_operations(id,guard,fingerprint,task_id) VALUES(?,CASE WHEN ${old?'EXISTS(SELECT 1 FROM work_items WHERE id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM work_items WHERE id=?)'} AND (${guard}) THEN 1 ELSE 0 END,?,?)`).bind(op,next.id,...(old?[expected]:[]),...guardArgs,fingerprint,next.id)];
 if(old)statements.push(env.DB.prepare('UPDATE work_items SET value=?,revision=?,parent_id=? WHERE id=? AND revision=?').bind(JSON.stringify(next),next.version,next.primaryParentId,next.id,expected));
 else statements.push(env.DB.prepare('INSERT INTO work_items(id,level,parent_id,department,department_id,value,revision) VALUES(?,1,?,?,?,?,?)').bind(next.id,next.primaryParentId,next.department||'',next.departmentId||'',JSON.stringify(next),next.version));
 statements.push(env.DB.prepare('INSERT INTO work_notion_jobs(id,version) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').bind(next.id,next.version));
 const date=day(Date.now()),entry={id:op,workId:next.id,title:next.title,action:input.action,text:note,at,stage:next.secretary.stage};
 statements.push(env.DB.prepare("INSERT INTO documents(namespace,key,value,revision) VALUES('xiaoye-work-journal',?,json_object('date',?,'account',?,'entries',json_array(json(?))),1) ON CONFLICT(namespace,key) DO UPDATE SET value=json_insert(documents.value,'$.entries[#]',json(?)),revision=documents.revision+1").bind(date,date,AI,JSON.stringify(entry),JSON.stringify(entry)),...extra);
 try{await env.DB.batch(statements);}catch{const winner=await env.DB.prepare('SELECT fingerprint FROM xiaoye_operations WHERE id=?').bind(op).first();if(winner?.fingerprint===fingerprint)return (await load(env.DB,next.id)).task;throw fail('內容已更新，請重新讀取後重試。');}return next;
}
function notification(env,t,account,kind,message,source=null){const s=t.secretary;const key=t.id+':'+kind+':'+s.sourceVersion+':'+(s.proposal?.hash||'')+':'+account;return docsInsert(env.DB,'xiaoye-notifications',key,{id:key,taskId:t.id,account,kind,message,sourceVersion:s.sourceVersion,proposalHash:s.proposal?.hash||null,expectedUserId:source?.userId||null,state:'pending',attempts:0,leaseUntil:0,createdAt:Date.now()});}
const link=(env,id)=>new URL('/xiaoye?issue='+encodeURIComponent(id),env.PUBLIC_ORIGIN).href;
function newIssue(env,c,actor,source,id,description,at){return {id,title:description.slice(0,100)||'待補充問題說明',description:description||'同仁已開啟問題回報，待補充說明或截圖。',requester:actor,lead:{account:AI,name:c.account.name,team:'AI 秘書'},collaborators:[],sharedWith:[],createdBy:{account:AI,name:c.account.name,team:'AI 秘書'},source:'dailylog',sourceDate:day(Date.now()),startDate:day(Date.now()),initialStartDate:day(Date.now()),dueDate:null,dueAt:null,createdAt:at,status:'pending',origin:'assigned',execution:'individual',notionAccounts:[...new Set([actor.account,c.ownerAccount])],level:1,kind:'task',workSchema:2,workSource:'assigned',priority:'normal',department:actor.team||'',departmentId:'',primaryParentId:null,relatedProjectIds:[],dependencyIds:[],finalResult:'',acceptance:'經核准完成處理後，由原回報人確認問題已解決。',helpRequest:'',projectFields:{},secretary:{stage:'clarifying',category:'unclassified',sourceVersion:0,reporters:[{...actor,source:{...source}}],sources:[],proposal:null,approval:null}};}
async function reportSummary(env,c,actor){
 const rows=(await env.DB.prepare("SELECT json_extract(value,'$.secretary.stage') AS stage FROM work_items WHERE EXISTS(SELECT 1 FROM json_each(json_extract(work_items.value,'$.secretary.reporters')) p WHERE json_extract(p.value,'$.account')=?)").bind(actor.account).all()).results;
 return {total:rows.length,open:rows.filter(r=>!['closed','duplicate'].includes(r.stage)).length,url:new URL('/xiaoye',env.PUBLIC_ORIGIN).href};
}
function imageBytes(image){
 const bytes=Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>10*1024*1024)throw fail('圖片上限為 10 MB。',413);
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!png&&!jpg&&!webp)throw fail('請傳 PNG、JPEG 或 WebP 圖片。',400);
 return {bytes,mime:png?'image/png':jpg?'image/jpeg':'image/webp',name:'問題截圖.'+(png?'png':jpg?'jpg':'webp')};
}
async function draftIntake(env,c,v,actor,source,key,previous){
 const event='draft:'+await digest(source.botUserId+':'+source.eventId),receipt=await record(env.DB,'xiaoye-draft-events',event),submitted=await record(env.DB,'xiaoye-intake-events','line:'+await digest(source.botUserId+':'+source.eventId));
 if(submitted?.value.taskId)return {ok:true,handled:true,submitted:true,taskId:submitted.value.taskId,url:link(env,submitted.value.taskId),duplicate:true};
 if(receipt)return {ok:true,handled:true,draft:true,duplicate:true,...await reportSummary(env,c,actor)};
 const active=previous?.value.mode==='draft'&&previous.value.until>Date.now();
 if(v.finish&&!active&&previous?.value.taskId){await env.DB.prepare("DELETE FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=?").bind(key,previous.revision).run();return {ok:true,handled:true,ended:true,url:link(env,previous.value.taskId)};}
 if(v.finish&&!active)return {ok:true,handled:true,needsBegin:true,...await reportSummary(env,c,actor)};
 if(v.cancel&&!active)return {ok:true,handled:true,cancelled:true,...await reportSummary(env,c,actor)};
 if(active&&v.resumeTaskId)throw fail('請先完成或取消本次回報，再接續原案件。');
 if(!active&&!v.begin)return {ok:true,handled:false};
 const d=active?structuredClone(previous.value):{mode:'draft',id:'draft-'+await digest(source.botUserId+':'+source.eventId),actor,source,entries:[],until:0};
 if(d.actor.account!==actor.account)throw fail('回報身分已變更，請重新開啟回報。',403);
 const extra=[],valid=()=>d.entries.filter(e=>!e.withdrawn),imageEntries=()=>valid().filter(e=>e.image);
 if(v.finish){
  const entries=valid(),description=entries.map(e=>e.text).filter(Boolean).join('\n\n').slice(0,12000);if(!entries.length)return {ok:true,handled:true,draft:true,needsDescription:true,...await reportSummary(env,c,actor)};
  const id='work-'+uuidFrom(await digest(d.id)),at=new Date().toISOString(),t=newIssue(env,c,actor,entries[0],id,description,at);
  t.title=description.split(/[\n。！？!?]/u).find(x=>x.trim())?.trim().slice(0,80)||'圖片問題（待釐清）';t.secretary.sources=entries.map(({image,...e})=>e);t.secretary.sourceVersion=entries.length;
  for(const e of imageEntries()){
   const parts=(await env.DB.prepare('SELECT content FROM xiaoye_draft_image_chunks WHERE draft_key=? AND image_id=? ORDER BY part').bind(key,e.image.id).all()).results,bytes=new Uint8Array(e.image.size);let offset=0;
   for(const p of parts){const b=new Uint8Array(p.content);bytes.set(b,offset);offset+=b.length;}if(offset!==bytes.length||await digest(bytes)!==e.image.digest)throw fail('圖片尚未完整保存，請稍後再按完成回報。',503);
   const attachment='att-'+uuidFrom(await digest(id+':'+e.eventId));extra.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(attachment,'normal',id,e.image.name,e.image.mime,bytes.length,e.image.digest,actor.account,actor.name,at));
   for(let p=0,n=0;p<bytes.length;p+=262144,n++)extra.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(attachment,n,bytes.slice(p,p+262144).buffer));
  }
  for(const e of entries)extra.push(docsInsert(env.DB,'xiaoye-intake-events','line:'+await digest(e.botUserId+':'+e.eventId),{taskId:id}));
  const operation='line:'+await digest(source.botUserId+':'+source.eventId);extra.push(docsInsert(env.DB,'xiaoye-intake-events',operation,{taskId:id}),docsInsert(env.DB,'xiaoye-intake-sessions',key,{taskId:id,until:Date.now()+24*3600000}),notification(env,t,actor.account,'receipt','葉小蝸已建立問題：'+t.title+'\n會先釐清與提案，負責人核准後才執行。你可以繼續在原對話補充文字或圖片，也可查看案件進度：\n'+link(env,id),source));
  await transaction(env,null,t,operation,{action:'intake',draftId:d.id,eventId:source.eventId},actor,'同仁完成回報，整理標題、文字與圖片並建立一張問題卡。',extra,"EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=?)",[key,previous.revision]);
  return {ok:true,handled:true,submitted:true,taskId:id,url:link(env,id),title:t.title};
 }
 if(v.cancel||v.end){d.mode='cancelled';d.until=0;}
 else {
  if(!v.begin){
   const description=typeof v.text==='string'?v.text.trim():'';if(description.length>4000)throw fail('這段文字太長，請分段說明。',400);if(d.entries.length>=100)throw fail('本次回報內容已足夠，請先按完成回報，再從原卡補充。');
   const entry={...source,text:description};if(v.image){const file=imageBytes(v.image),images=imageEntries();if(images.length>=10||images.reduce((n,e)=>n+e.image.size,0)+file.bytes.length>10*1024*1024)throw fail('本次最多10張、合計10MB；請先完成回報，再接續原卡補充。',413);entry.image={id:await digest(event),mime:file.mime,name:file.name,size:file.bytes.length,digest:await digest(file.bytes)};for(let p=0,n=0;p<file.bytes.length;p+=262144,n++)extra.push(env.DB.prepare('INSERT INTO xiaoye_draft_image_chunks(draft_key,image_id,part,content) VALUES(?,?,?,?)').bind(key,entry.image.id,n,file.bytes.slice(p,p+262144).buffer));}
   if(!description&&!entry.image)throw fail('請說明問題或提供圖片。',400);d.entries.push(entry);
  }
  d.until=Date.now()+24*3600000;
 }
 const guard=previous?'EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=?)';
 const batch=[env.DB.prepare('INSERT INTO xiaoye_draft_operations(id,guard) VALUES(?,CASE WHEN '+guard+' THEN 1 ELSE 0 END)').bind(event,'xiaoye-intake-sessions',key,...(previous?[previous.revision]:[])),docsInsert(env.DB,'xiaoye-intake-sessions',key,d),docsInsert(env.DB,'xiaoye-draft-events',event,{draftId:d.id}),...extra];
 try{await env.DB.batch(batch);}catch{if(await record(env.DB,'xiaoye-draft-events',event))return {ok:true,handled:true,draft:true,duplicate:true,...await reportSummary(env,c,actor)};throw fail('回報內容剛有更新，請稍後重試，已收到的資料會保留。');}
 return {ok:true,handled:true,draft:!v.cancel&&!v.end,cancelled:!!v.cancel||!!v.end,begun:!!v.begin,texts:valid().filter(e=>e.text).length,images:imageEntries().length,...await reportSummary(env,c,actor)};
}
async function intake(env,c,base,v){
 const actor=await linePerson(env,base,v.sender),source=v.source;
 if(!source||!['user','group'].includes(source.type)||c.oaBotUserId&&source.botUserId!==c.oaBotUserId||source.userId!==v.sender.userId||source.botUserId!==v.sender.botUserId||source.type==='user'&&source.conversationId!==source.userId||source.type==='group'&&!/^C[0-9a-f]{32}$/i.test(source.conversationId||''))throw fail('對話來源無法確認。',403);
 text(source.eventId,180);if(!Number.isSafeInteger(source.timestamp)||Math.abs(Date.now()-source.timestamp)>24*3600000)throw fail('回報事件已過期。',403);
 const sessionKey=await digest(JSON.stringify([source.botUserId,source.type,source.conversationId,source.userId])),session=await record(env.DB,'xiaoye-intake-sessions',sessionKey);
 if(v.begin||v.finish||v.cancel||session?.value.mode==='draft')return draftIntake(env,c,v,actor,source,sessionKey,session);
 if(v.end){await env.DB.prepare("DELETE FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=?").bind(sessionKey).run();return {ok:true,handled:!!session,ended:true};}
 if(!v.start&&!v.resumeTaskId&&(!session||session.value.until<Date.now()))return {ok:true,handled:false};
 const eventKey='line:'+await digest(source.botUserId+':'+source.eventId),receipt=await record(env.DB,'xiaoye-intake-events',eventKey);
 if(receipt)return {ok:true,handled:true,taskId:receipt.value.taskId,duplicate:true,url:link(env,receipt.value.taskId)};
 let old=null;if(v.resumeTaskId){old=await load(env.DB,v.resumeTaskId);const reporter=old?.task.secretary?.reporters.find(p=>p.account===actor.account);if(!reporter||reporter.source.botUserId!==source.botUserId||reporter.source.userId!==source.userId||reporter.source.conversationId!==source.conversationId||['closed','duplicate'].includes(old.task.secretary.stage))throw fail('請從原問題頁確認並在原對話接續補充。',403);}else if(!v.start)old=await load(env.DB,session.value.taskId);
 if(old&&!visible(old.task,actor.account,c))throw fail('回報工作已改變。');
 if(!v.start&&!old)throw fail('找不到原問題，請重新輸入「回報問題」。');
 const id=old?.task.id||'work-'+uuidFrom(await digest(eventKey)),at=new Date().toISOString();
 const description=typeof v.text==='string'?v.text.trim().slice(0,12000):'';
 if(v.start&&!description&&!v.image)return {ok:true,handled:true,needsDescription:true};
 let t=old?structuredClone(old.task):newIssue(env,c,actor,source,id,description,at);
 if(old&&description)t.description=(t.description+'\n\n補充：'+description).slice(0,24000);
 t.secretary={...t.secretary,stage:'clarifying',waitingForReporter:false,sourceWithdrawn:v.resumeTaskId?!!t.secretary.sourceWithdrawn:false,sourceVersion:t.secretary.sourceVersion+1,proposal:null,approval:null,lease:null,leaseUntil:0};t.status='pending';t.secretary.sources.push({...source,text:description});
 if(t.secretary.sources.length>300)throw fail('此問題的補充已達上限，請由管理者接續。');
 if(t.title==='待補充問題說明'&&description)t.title=description.slice(0,100);
 const extras=[docsInsert(env.DB,'xiaoye-intake-events',eventKey,{taskId:id}),docsInsert(env.DB,'xiaoye-intake-sessions',sessionKey,{taskId:id,until:Date.now()+24*3600000})];
 if(!old)extras.push(notification(env,t,actor.account,'receipt','葉小蝸已收到你的問題，接下來會釐清並提出方案，經負責人核准後才執行。\n你可以接著補充截圖與說明。\n'+link(env,id),source));
 if(v.image){const bytes=Uint8Array.from(atob(v.image.base64),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>10*1024*1024)throw fail('圖片上限為 10 MB。',413);const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!png&&!jpg&&!webp)throw fail('請上傳 PNG、JPEG 或 WebP 截圖。',400);
  const hash=await digest(bytes),attachment='att-'+uuidFrom(await digest(id+':'+source.eventId)),mime=png?'image/png':jpg?'image/jpeg':'image/webp';
  extras.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(attachment,'normal',id,'問題截圖.'+(png?'png':jpg?'jpg':'webp'),mime,bytes.length,hash,actor.account,actor.name,at));
  for(let offset=0,part=0;offset<bytes.length;offset+=65536,part++)extras.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(attachment,part,bytes.slice(offset,offset+65536).buffer));
 }
 t=await transaction(env,old,t,eventKey,{action:'intake',eventId:source.eventId,text:description,image:!!v.image},actor,old?'收到同仁補充，原方案須重新檢查。':'收到新問題，等待釐清與提案。',extras);
 return {ok:true,handled:true,taskId:t.id,url:link(env,t.id),newIssue:!old};
}
async function approved(env,c,t,authority){const s=t.secretary,a=s.approval;if(s.sourceWithdrawn||!a||!s.proposal||a.account!==c.ownerAccount||a.hash!==s.proposal.hash||a.sourceVersion!==s.sourceVersion)throw fail('缺少目前有效來源與方案的本人核准。',403);await authority(env,a.sessionHash,c.ownerAccount);await membership(env,c,t.primaryParentId);}
async function withdraw(env,c,v){
 const s=v.source;if(!s||!['user','group'].includes(s.type)||!/^U[a-f0-9]{32}$/i.test(s.botUserId||'')||!String(v.messageId||'').length||String(v.messageId).length>180)throw fail('撤回來源無法確認。',403);
 const drafts=(await env.DB.prepare("SELECT key,value,revision FROM documents d WHERE namespace='xiaoye-intake-sessions' AND json_extract(value,'$.mode')='draft' AND EXISTS(SELECT 1 FROM json_each(json_extract(d.value,'$.entries')) e WHERE json_extract(e.value,'$.botUserId')=? AND json_extract(e.value,'$.conversationId')=? AND json_extract(e.value,'$.type')=? AND json_extract(e.value,'$.messageId')=?)").bind(s.botUserId,s.conversationId,s.type,v.messageId).all()).results;
 for(const draft of drafts){const d=JSON.parse(draft.value);for(const e of d.entries)if(e.messageId===v.messageId&&e.botUserId===s.botUserId&&e.conversationId===s.conversationId)e.withdrawn=true;const updated=await env.DB.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=?").bind(JSON.stringify(d),draft.key,draft.revision).run();if(updated.meta.changes!==1)throw fail('回報正在更新，撤回處理稍後重試。',503);}
 const rows=(await env.DB.prepare("SELECT w.id FROM work_items w WHERE EXISTS(SELECT 1 FROM json_each(json_extract(w.value,'$.secretary.sources')) s WHERE json_extract(s.value,'$.botUserId')=? AND json_extract(s.value,'$.conversationId')=? AND json_extract(s.value,'$.type')=? AND json_extract(s.value,'$.messageId')=?)").bind(s.botUserId,s.conversationId,s.type,v.messageId).all()).results;
 for(const r of rows){const old=await load(env.DB,r.id),t=structuredClone(old.task),source=t.secretary.sources.find(p=>p.messageId===v.messageId&&p.botUserId===s.botUserId&&p.conversationId===s.conversationId);const operation='withdraw:'+await digest(s.botUserId+':'+s.eventId+':'+t.id),input={action:'withdraw',messageId:v.messageId},actor={account:AI,name:c.account.name};if(await replay(env,t.id,operation,input,actor))continue;
  source.withdrawn=true;t.secretary.sourceWithdrawn=true;t.secretary.sourceVersion++;t.secretary.approval=null;t.secretary.lease=null;t.secretary.leaseUntil=0;t.secretary.waitingForReporter=false;if(t.secretary.stage!=='closed'){t.secretary.stage='blocked';t.secretary.blocker='原來源訊息已撤回，請由原回報人重新補充後再提案。';t.status='blocked';}
  const attachment='att-'+uuidFrom(await digest(t.id+':'+source.eventId)),extra=[env.DB.prepare('UPDATE task_attachments SET removed_at=?,removed_by=? WHERE id=? AND target_id=? AND removed_at IS NULL').bind(new Date().toISOString(),AI,attachment,t.id)];await transaction(env,old,t,operation,input,actor,'原來源訊息已撤回；停止後續處理並保留原卡與歷史。',extra);
 }return {ok:true,handled:rows.length>0||drafts.length>0};
}
async function runner(env,c,base,authority,action,v){
 if(action==='queue'){const rows=(await env.DB.prepare("SELECT value FROM work_items WHERE json_extract(value,'$.secretary') IS NOT NULL AND json_extract(value,'$.secretary.stage') NOT IN ('closed','duplicate') ORDER BY json_extract(value,'$.updatedAt')").all()).results;return {ok:true,contract:XIAOYE_CONTRACT,projects:c.projects,tasks:rows.map(r=>{const t=JSON.parse(r.value);if(t.secretary.approval)delete t.secretary.approval.sessionHash;return t;})};}
 if(action==='claim'){
  const previous=await env.DB.prepare('SELECT task_id FROM xiaoye_operations WHERE id=?').bind(v.operationId||'').first();if(previous){const actor={account:AI},t=await replay(env,previous.task_id,v.operationId,{action:'claim',id:previous.task_id},actor);return {ok:true,task:t,lease:t.secretary.stage==='executing'?t.secretary.lease:null,replayed:true};}
  const row=await env.DB.prepare("SELECT id FROM work_items WHERE json_extract(value,'$.secretary.stage')='approved' ORDER BY json_extract(value,'$.updatedAt') LIMIT 1").first();if(!row)return {ok:true,task:null};v.id=row.id;
 }
 const old=await load(env.DB,v.id);if(!old?.task.secretary)throw fail('找不到問題。',404);const t=structuredClone(old.task),s=t.secretary,actor={account:AI,name:c.account.name,team:'AI 秘書'};
 if(action==='attachments')return {ok:true,attachments:(await env.DB.prepare("SELECT id,name,mime,size,digest FROM task_attachments WHERE scope='normal' AND target_id=? AND removed_at IS NULL ORDER BY created_at LIMIT 20").bind(t.id).all()).results};
 const image=action.match(/^attachment\/(att-[a-f0-9-]{36})$/);if(image){const file=await env.DB.prepare("SELECT id,mime,size FROM task_attachments WHERE scope='normal' AND target_id=? AND id=? AND removed_at IS NULL").bind(t.id,image[1]).first();if(!file||!['image/png','image/jpeg','image/webp'].includes(file.mime)||file.size>10*1024*1024)throw fail('找不到可查看的問題截圖。',404);const chunks=(await env.DB.prepare('SELECT content FROM task_attachment_chunks WHERE attachment_id=? ORDER BY part').bind(file.id).all()).results,bytes=new Uint8Array(file.size);let offset=0;for(const part of chunks){const b=new Uint8Array(part.content);bytes.set(b,offset);offset+=b.length;}if(offset!==file.size)throw fail('截圖尚未完整保存。',503);return new Response(bytes,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(['propose','clarify','finish','fail'].includes(action)){const previous=await replay(env,t.id,v.operationId,{...v,action},actor);if(previous)return {ok:true,task:previous,replayed:true};}
 if(action==='clarify'){
  if(v.version!==t.version||s.stage!=='clarifying'||s.waitingForReporter)throw fail('此問題已有更新或正在等待同仁補充。');const question=text(v.question,2000);s.waitingForReporter=true;s.question=question;
  const extra=s.reporters.map(p=>notification(env,t,p.account,'question','葉小蝸想釐清：'+t.title+'\n'+question+'\n請從原問題頁補充，會接續同一張卡：\n'+link(env,t.id),p.source));
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'向原回報人釐清：'+question,extra)};
 }
 if(action==='propose'){
  if(v.version!==t.version)throw fail('問題已有補充，請重新檢查。');if(s.sourceWithdrawn)throw fail('原來源已撤回，請等待同仁重新補充。');if(s.waitingForReporter)throw fail('正在等待原同仁補充，請先保留問題。');if(['executing','awaiting_confirmation','closed','duplicate'].includes(s.stage))throw fail('請先停止或重新開啟原工作。');
  const p=v.proposal||{};for(const k of ['summary','reason','steps','validation','rollback'])text(p[k],8000);if(!Array.isArray(p.systems)||!p.systems.length||p.systems.some(x=>!['am','dailylog','uof'].includes(x))||typeof p.deploy!=='boolean')throw fail('請清楚指定影響系統與是否發布。',400);
  await membership(env,c,v.projectId);if(!['help','bug','improvement'].includes(v.category))throw fail('請指定問題類型。',400);
  if(v.title!==undefined)t.title=text(v.title,100);
  s.proposal={...Object.fromEntries(['summary','reason','steps','validation','rollback','systems','deploy'].map(k=>[k,p[k]])),version:(s.proposal?.version||0)+1,sourceVersion:s.sourceVersion};s.proposal.hash=await digest(JSON.stringify(s.proposal));s.approval=null;s.stage='awaiting_approval';t.primaryParentId=v.projectId;s.category=v.category;
  const msg='葉小蝸提案待核准：'+t.title+'\n'+p.summary+'\n影響：'+p.systems.join('、')+'；'+(p.deploy?'含正式發布':'本次不含正式發布')+'\n'+link(env,t.id);
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'提出方案，等待本人核准。',[notification(env,t,c.ownerAccount,'approval',msg)])};
 }
 if(action==='check'||action==='finish'||action==='fail'){
  if(s.stage!=='executing'||s.lease!==v.lease||s.leaseUntil<=Date.now())throw fail('執行確認已失效，請停止並重新查核。',403);await approved(env,c,t,authority);
  if(action==='check')return {ok:true,allowed:true,task:t,leaseUntil:s.leaseUntil};
  const result=text(v.result,12000);s.leaseUntil=0;s.lease=null;
  const extras=[];
  if(action==='finish'){
   if(!Array.isArray(v.evidence)||!v.evidence.length||v.evidence.some(e=>typeof e!=='string'||!e.trim()||e.length>2000))throw fail('請附上實際驗證或發布證據。',400);
   if(typeof v.deployed!=='boolean'||v.deployed!==s.proposal.deploy)throw fail('結果與核准的發布範圍不符。');
   s.stage='awaiting_confirmation';s.result={text:result,evidence:v.evidence,deployed:v.deployed,at:new Date().toISOString()};t.finalResult=result;t.status='in_progress';
   for(const p of s.reporters)extras.push(notification(env,t,p.account,'result','葉小蝸已完成處理：'+t.title+'\n'+result.slice(0,1500)+'\n請再試一次，並在問題頁選擇「已解決」或「仍有問題」。\n'+link(env,t.id),p.source));
  }else{s.stage='blocked';s.blocker=result;t.status='blocked';extras.push(notification(env,t,c.ownerAccount,'blocked','葉小蝸處理受阻：'+t.title+'\n'+result.slice(0,1500)+'\n'+link(env,t.id)));}
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,result,extras)};
 }
 if(action==='claim'){
  await approved(env,c,t,authority);s.stage='executing';s.lease=crypto.randomUUID();s.leaseUntil=Date.now()+30*60000;t.status='in_progress';
  const guard="NOT EXISTS(SELECT 1 FROM work_items WHERE json_extract(value,'$.secretary.stage')='executing')";
  return {ok:true,task:await transaction(env,old,t,v.operationId,{action:'claim',id:t.id},actor,'依本人核准開始處理。',[],guard),lease:s.lease};
 }
 throw fail('不支援此操作。',400);
}
function notificationCurrent(n,t){if(!t?.secretary)return false;if(n.kind==='receipt')return !t.secretary.sourceWithdrawn&&t.secretary.reporters.some(p=>p.account===n.account);if(n.sourceVersion!==t.secretary.sourceVersion||n.proposalHash!==(t.secretary.proposal?.hash||null))return false;return n.kind==='approval'?t.secretary.stage==='awaiting_approval':n.kind==='result'?t.secretary.stage==='awaiting_confirmation':n.kind==='question'?t.secretary.stage==='clarifying'&&t.secretary.waitingForReporter:t.secretary.stage==='blocked';}
async function notifications(env,c,action,v){
 if(action==='claim'){
  const rows=(await env.DB.prepare("SELECT key,value,revision FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.state')!='sent' AND COALESCE(json_extract(value,'$.leaseUntil'),0)<=? AND COALESCE(json_extract(value,'$.nextAttempt'),0)<=? AND json_extract(value,'$.attempts')<5 ORDER BY json_extract(value,'$.createdAt') LIMIT 10").bind(Date.now(),Date.now()).all()).results;
  for(const row of rows){let n=JSON.parse(row.value);const t=(await load(env.DB,n.taskId))?.task;if(!notificationCurrent(n,t)){n.state='cancelled';n.attempts=5;await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',row.key,row.revision).run();continue;}
   if(n.firstAttemptAt&&Date.now()-n.firstAttemptAt>23*3600000){n.state='unknown';n.attempts=5;n.error='通知確認期限已過，請人工核對原對話，避免重複發送。';await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',row.key,row.revision).run();continue;}n={...n,firstAttemptAt:n.firstAttemptAt||Date.now(),lease:crypto.randomUUID(),leaseUntil:Date.now()+90000,attempts:n.attempts+1,state:'sending'};
   const r=await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',row.key,row.revision).run();if(r.meta.changes)return {ok:true,notification:n};
  }return {ok:true,notification:null};
 }
 const row=await record(env.DB,'xiaoye-notifications',v.id),n=row?.value;if(!n||n.lease!==v.lease||n.leaseUntil<=Date.now())throw fail('通知確認已失效。');
 if(action==='validate'){const t=(await load(env.DB,n.taskId))?.task;if(!notificationCurrent(n,t))throw fail('問題內容或狀態已更新，原通知停止。');return {ok:true,notification:n};}
 if(action==='receipt'){
  if(!['sent','failed','unknown'].includes(v.state))throw fail('通知狀態錯誤。',400);n.state=v.state;n.leaseUntil=0;n.nextAttempt=Date.now()+Math.min(3600000,60000*2**n.attempts);n.error=v.state==='sent'?'':String(v.error||'通知尚未確認。').slice(0,300);n.requestId=String(v.requestId||'').slice(0,150);
  const r=await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',v.id,row.revision).run();if(!r.meta.changes)throw fail('通知狀態已更新。');return {ok:true};
 }throw fail('不支援此操作。',400);
}
async function install(request,env){
 const action=new URL(request.url).pathname.slice(machinePrefix.length);if(!['install','activate'].includes(action))return null;
 if(request.method!=='POST')throw fail('Method not allowed',405);const credential=await digest(request.headers.get('Authorization')||''),bootstrap=(await record(env.DB,'xiaoye-bootstrap','install'))?.value,existing=(await record(env.DB,configNs,'config'))?.value;
 if(!bootstrap){if(action==='activate'&&existing?.enabled&&credential===existing.runnerHash)return json({ok:true,activated:true,replayed:true});throw fail('安裝確認已失效。',403);}
 if(credential!==bootstrap.hash)throw fail('Unauthorized',401);const v=await body(request,10000);if(v.tenantKey!==env.LEAF_TASK_TENANT)throw fail('Tenant mismatch',403);
 if(bootstrap.ownerAccount!==env.OWNER_ACCOUNT||bootstrap.projects?.length!==4||new Set(bootstrap.projects.map(p=>p.id)).size!==4||new Set(bootstrap.projects.map(p=>p.key)).size!==4||bootstrap.projects.some(p=>!['am','dailylog','uof','meeting'].includes(p.key)))throw fail('原專案與負責人確認不符。',403);
 if(action==='activate'){
  if(!existing||existing.runnerHash!==credential)throw fail('請先完成安裝。');for(const p of existing.projects)await membership(env,existing,p.id);
  await env.DB.batch([docsInsert(env.DB,configNs,'config',{...existing,enabled:true,activatedAt:new Date().toISOString()}),env.DB.prepare("DELETE FROM documents WHERE namespace='xiaoye-bootstrap' AND key='install'")]);return json({ok:true,activated:true});
 }
 if(existing){if(existing.runnerHash!==credential)throw fail('葉小蝸已由另一項安裝建立。');return json({ok:true,installed:true,replayed:true});}
 const owner=await env.DB.prepare('SELECT value FROM employees WHERE account=?').bind(bootstrap.ownerAccount).first();if(!owner)throw fail('找不到原負責人。');const person=JSON.parse(owner.value),actor={account:bootstrap.ownerAccount,name:person.name||bootstrap.ownerAccount,team:person.team||''},at=new Date().toISOString();
 const projects=[];for(const p of bootstrap.projects){const old=await load(env.DB,p.id);if(!old||old.task.level<2||old.task.lead.account!==actor.account||old.task.deletedAt||old.task.mergedInto)throw fail('原專案已有變更，請重新核對。');if(old.task.collaborators.some(p=>p.account===AI))throw fail('葉小蝸已在專案中，請先查核既有安裝。');projects.push({p,old});}
 const account={id:'service:xiaoye',account:AI,name:'葉小蝸（AI 秘書）',type:'ai',active:true,loginAllowed:false,source:'existing-line-oa',oaBotUserId:bootstrap.oaBotUserId||null,createdAt:at,managedBy:actor.account,projectIds:bootstrap.projects.map(p=>p.id)};
 const c={contract:XIAOYE_CONTRACT,enabled:false,oaBotUserId:account.oaBotUserId,ownerAccount:actor.account,account:{id:account.id,account:AI,name:account.name,type:'ai'},projects:bootstrap.projects,runnerHash:credential,installedAt:at};
 const op='install:'+bootstrap.runId,guard=projects.map(()=>"EXISTS(SELECT 1 FROM work_items WHERE id=? AND revision=? AND value=?)").join(' AND '),args=projects.flatMap(({old})=>[old.task.id,old.revision,old.raw]);
 const statements=[env.DB.prepare('INSERT INTO xiaoye_operations(id,guard,fingerprint,task_id) VALUES(?,CASE WHEN '+guard+" AND NOT EXISTS(SELECT 1 FROM documents WHERE namespace='service-accounts' AND key='ai-xiaoye') THEN 1 ELSE 0 END,?,?)").bind(op,...args,await digest(JSON.stringify(c)),projects[0].p.id)];
 for(const {p,old}of projects){const t={...old.task,version:old.task.version+1,updatedAt:at,collaborators:[...old.task.collaborators,{account:AI,name:account.name,team:'AI 秘書'}],history:[...old.task.history,{id:op+':'+p.key,kind:'ai_service_joined',actor,at,text:'依本人要求加入葉小蝸 AI 秘書，負責問題回報與核准後處理。',mentions:[],targets:[]}]};statements.push(env.DB.prepare('UPDATE work_items SET value=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(t),t.id,old.revision),env.DB.prepare('INSERT INTO work_notion_jobs(id,version) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').bind(t.id,t.version));}
 statements.push(docsInsert(env.DB,'service-accounts',AI,account),docsInsert(env.DB,configNs,'config',c),docsInsert(env.DB,'xiaoye-work-journal',day(Date.now()),{date:day(Date.now()),account:AI,entries:[{id:op,workId:null,title:'試行版本建置',action:'setup',text:'依本人要求沿用既有葉小蝸OA的工作身分，加入四個現有專案；收件尚待啟用。',at,stage:'setup'}]}));
 try{await env.DB.batch(statements);}catch{throw fail('原專案正在更新，安裝未完成，請重新核對。');}return json({ok:true,installed:true,account:AI,joinedProjects:4,intakeEnabled:false});
}
export async function xiaoyeFetch(request,env,{base,readAuthority,authority,ctx}){
 const url=new URL(request.url),path=url.pathname,machine=path.startsWith(machinePrefix),page=path==='/xiaoye',api=path.startsWith('/api/xiaoye/');
 if(!machine&&!page&&!api)return null;
 try{
  if(machine){const installed=await install(request,env);if(installed)return installed;}
  const c=await settings(env);
  if(machine){
   const action=path.slice(machinePrefix.length),runnerMode=action.startsWith('runner/'),key=request.headers.get('Authorization')||'';
   if(runnerMode){if(await digest(key)!==c.runnerHash)throw fail('Unauthorized',401);}else if(!env.LEAF_TASK_SERVICE_KEY||await digest(key)!==await digest('Bearer '+env.LEAF_TASK_SERVICE_KEY))throw fail('Unauthorized',401);
   if(action==='health'&&request.method==='GET')return json({ok:true,contract:XIAOYE_CONTRACT,approvalRequired:true,enabled:true});
   if(request.method!=='POST')throw fail('Method not allowed',405);const v=await body(request);if(v.tenantKey!==env.LEAF_TASK_TENANT)throw fail('Tenant mismatch',403);
   if(action==='intake')return json(await intake(env,c,base,v));
   if(action==='withdraw')return json(await withdraw(env,c,v));
   if(action==='sessions'){const rows=(await env.DB.prepare("SELECT key,json_extract(value,'$.until') AS until FROM documents WHERE namespace='xiaoye-intake-sessions' AND json_extract(value,'$.until')>? LIMIT 500").bind(Date.now()).all()).results;return json({ok:true,sessions:rows});}
   if(action==='active'){const key=await digest(JSON.stringify([v.botUserId,v.type,v.conversationId,v.userId])),r=await record(env.DB,'xiaoye-intake-sessions',key);return json({ok:true,active:!!r&&r.value.until>Date.now()});}
   if(runnerMode){const result=await runner(env,c,base,authority,action.slice(7),v);return result instanceof Response?result:json(result);}
   if(action.startsWith('notifications/'))return json(await notifications(env,c,action.slice(14),v));
   throw fail('Not found',404);
  }
  let a=await readAuthority(request,env);if(!a){await base.fetch(new Request(env.PUBLIC_ORIGIN+'/api/tasks/people',{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx);a=await readAuthority(request,env);}if(!a)throw fail('請先登入工作日誌。',401);await a.verify();
  if(page){if(request.method!=='GET')throw fail('Method not allowed',405);return new Response(xiaoyePage(),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
  if(!['GET','POST'].includes(request.method))throw fail('Method not allowed',405);
  if(request.method==='POST'&&(request.headers.get('Origin')!==env.PUBLIC_ORIGIN||request.headers.get('X-DailyLog-CSRF')!==a.csrf||!request.headers.get('Content-Type')?.startsWith('application/json')))throw fail('請重新登入後再操作。',403);
  if(path==='/api/xiaoye/overview'&&request.method==='GET'){
   const rows=(await env.DB.prepare("SELECT value FROM work_items WHERE json_extract(value,'$.secretary') IS NOT NULL ORDER BY json_extract(value,'$.updatedAt') DESC").all()).results.map(r=>JSON.parse(r.value)).filter(t=>visible(t,a.account,c));
   const journals=a.account===c.ownerAccount?(await env.DB.prepare("SELECT value FROM documents WHERE namespace='xiaoye-work-journal' ORDER BY key DESC LIMIT 14").all()).results.map(r=>JSON.parse(r.value)):[];
   const notices=a.account===c.ownerAccount?(await env.DB.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.state') IN ('failed','unknown') ORDER BY key LIMIT 30").all()).results.map(r=>{const n=JSON.parse(r.value);return {taskId:n.taskId,state:n.state,error:n.error};}):[];
   return json({ok:true,csrf:a.csrf,owner:a.account===c.ownerAccount,viewerAccount:a.account,account:c.account,projects:c.projects,tasks:rows.map(t=>view(t,a.account,c)),journals,notifications:notices});
  }
  const match=path.match(/^\/api\/xiaoye\/issues\/(work-[0-9a-f-]{36})\/(approve|pause|confirm|reopen|supplement)$/);if(!match||request.method!=='POST')throw fail('Not found',404);
  const v=await body(request,match[2]==='supplement'?16*1024*1024:40000),old=await load(env.DB,match[1]);if(!old||!visible(old.task,a.account,c))throw fail('找不到問題。',404);const t=structuredClone(old.task),s=t.secretary,action=match[2],actor={account:a.account,name:a.profile?.name||a.user?.name||a.account,team:a.profile?.team||''};
  const previous=await replay(env,t.id,v.operationId,{...v,action},actor);if(previous)return json({ok:true,task:view(previous,a.account,c),replayed:true});
  if(v.version!==t.version)throw fail('問題已有更新，請重新檢查。');const extras=[];
  if(action==='approve'){
   if(a.account!==c.ownerAccount)throw fail('請由指定負責人核准。',403);if(s.sourceWithdrawn||!['awaiting_approval','blocked','approved','paused'].includes(s.stage)||!s.proposal||v.proposalHash!==s.proposal.hash||v.confirm!==true)throw fail('請先檢查目前有效來源與方案再核准。');await membership(env,c,t.primaryParentId);
   const token=/\bdailylog_session=([a-f0-9]{64})\b/.exec(request.headers.get('cookie')||'')?.[1];if(!token)throw fail('請使用本人登入核准。',403);
   s.approval={account:a.account,hash:s.proposal.hash,sourceVersion:s.sourceVersion,sessionHash:await digest(token),at:new Date().toISOString()};s.stage='approved';s.blocker='';t.status='pending';
  }else if(action==='pause'){
   if(a.account!==c.ownerAccount)throw fail('請由指定負責人暫緩。',403);s.stage='paused';s.approval=null;s.lease=null;s.leaseUntil=0;t.status='blocked';
  }else if(action==='confirm'){
   if(!s.reporters.some(p=>p.account===a.account)||s.stage!=='awaiting_confirmation'||v.confirm!==true)throw fail('請由原回報人確認目前的處理結果。',403);s.stage='closed';s.confirmedAt=new Date().toISOString();t.status='done';t.completedAt=s.confirmedAt;
  }else if(action==='supplement'){
   if(!s.reporters.some(p=>p.account===a.account)||['closed','duplicate'].includes(s.stage))throw fail('請由原回報人在未結案問題補充。',403);const detail=text(v.detail||(v.image?'補充圖片':''),4000);t.description+='\n\n同仁補充：'+detail;s.sources.push({type:'web',account:a.account,eventId:v.operationId,at:new Date().toISOString(),text:detail});s.sourceVersion++;s.sourceWithdrawn=false;s.proposal=null;s.approval=null;s.lease=null;s.leaseUntil=0;s.waitingForReporter=false;s.stage='clarifying';t.status='pending';
   if(v.image){const image=imageBytes(v.image),id='att-'+uuidFrom(await digest(t.id+':'+v.operationId)),at=new Date().toISOString();extras.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'normal',t.id,image.name,image.mime,image.bytes.length,await digest(image.bytes),actor.account,actor.name,at));for(let p=0,n=0;p<image.bytes.length;p+=262144,n++)extras.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(id,n,image.bytes.slice(p,p+262144).buffer));}
  }else{
   if(!s.reporters.some(p=>p.account===a.account))throw fail('請由原回報人補充。',403);if(!['closed','awaiting_confirmation','paused','blocked'].includes(s.stage))throw fail('此問題尚在處理，請補充原回報。');const detail=text(v.detail,4000);t.description+='\n\n仍有問題：'+detail;s.sourceVersion++;s.sourceWithdrawn=false;s.proposal=null;s.approval=null;s.stage='clarifying';t.status='pending';t.completedAt=null;
  }
  await a.verify();const saved=await transaction(env,old,t,v.operationId,{...v,action},actor,action==='approve'?'本人已核准目前方案。':action==='pause'?'本人暫緩處理。':action==='confirm'?'原回報人確認問題已解決。':action==='supplement'?'收到原回報人的補充，接續原卡釐清。':'原回報人表示仍有問題，重新釐清。',extras);
  return json({ok:true,task:view(saved,a.account,c)});
 }catch(e){if(page&&e.status===401)return Response.redirect(new URL('/login?returnTo='+encodeURIComponent(url.pathname+url.search),env.PUBLIC_ORIGIN).href,303);return json({ok:false,...e.code?{code:e.code}:{},error:e.status?e.message:'葉小蝸服務暫時無法完成，請稍後重試。'},e.status||503);}
}
export async function xiaoyeGuard(request,env,readAuthority){
 const path=new URL(request.url).pathname,task=path.match(/^\/api\/tasks\/(work-[0-9a-f-]{36})(?:\/|$)/),attachment=path.match(/^\/api\/attachments\/normal\/(work-[0-9a-f-]{36})(?:\/|$)/);
 if(!task&&!attachment)return null;const t=(await load(env.DB,(task||attachment)[1]))?.task;if(!t?.secretary){if(task&&request.method==='POST'){const b=await request.clone().json().catch(()=>({}));if((b.collaboratorAccounts||[]).includes(AI)){const c=await settings(env);if(!c.projects.some(p=>p.id===t?.id))return json({error:'葉小蝸試行帳號目前只參與已指定的四個專案。'},409);}}return null;}const c=await settings(env),a=await readAuthority(request,env);if(!a||!visible(t,a.account,c))return json({error:'找不到問題。'},404);await a.verify();
 if(attachment&&request.method!=='GET')return json({error:'補圖請在原 LINE 回報期間傳送，或先從原問題頁補充說明。'},409);if(task&&request.method!=='GET')return json({error:'請從葉小蝸問題頁核准、確認或重新開啟，原任務保留。',url:link(env,t.id)},409);return null;
}
export async function xiaoyeResponse(request,response,env,readAuthority){
 const url=new URL(request.url),path=url.pathname,returnTo=url.searchParams.get('returnTo'),safeReturn=typeof returnTo==='string'&&/^\/xiaoye(?:\?issue=work-[a-f0-9-]{36})?$/.test(returnTo);
 if(['/login','/login.html'].includes(path)&&safeReturn&&[301,302,303,307,308].includes(response.status)){const dest=new URL(response.headers.get('Location')||'/',env.PUBLIC_ORIGIN);if(dest.origin===env.PUBLIC_ORIGIN&&dest.pathname==='/'){const headers=new Headers(response.headers);headers.set('Location',returnTo);return new Response(response.body,{status:response.status,headers});}}
 if(response.status!==200)return response;
 if(['/login','/login.html'].includes(path)&&safeReturn&&response.headers.get('Content-Type')?.includes('text/html')){const html=await response.text(),headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(html.replace(/(src=["'])(\/login\.js(?:\?[^"']*)?)(["'])/g,(_,a,b,c)=>a+b+(b.includes('?')?'&':'?')+'xiaoye=v1'+c),{status:200,headers});}
 if(path==='/login.js'){let source=await response.text();const modern='const returnTo=requestedReturn&&',legacy='const workTarget=';if(source.split(modern).length===2)source=source.replace(modern,"const returnTo=/^\\/xiaoye(?:\\?issue=work-[a-f0-9-]{36})?$/.test(requestedReturn||'')?requestedReturn:requestedReturn&&");else if(source.split(legacy).length===2)source=source.replace(legacy,"const xiaoyeReturn=new URLSearchParams(location.search).get('returnTo');const workTarget=/^\\/xiaoye(?:\\?issue=work-[a-f0-9-]{36})?$/.test(xiaoyeReturn||'')?xiaoyeReturn:");const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(source,{status:200,headers});}
 if(['/', '/index.html'].includes(path)&&response.headers.get('Content-Type')?.includes('text/html')){const content=await response.text();const entry='<a href="/xiaoye" style="display:block;padding:14px;border-radius:9px;text-decoration:none">我回報的問題・葉小蝸</a>';let changed=false;const html=content.replace(/(<nav\b[^>]*id=["'](?:managerNav|employeeNav)["'][^>]*>)([\s\S]*?)(<\/nav>)/g,(_,a,b,z)=>{changed=true;return a+b+entry+z;});return new Response(changed?html:content.replace('</body>',entry+'</body>'),{status:response.status,headers:response.headers});}
 if(!path.startsWith('/api/tasks')||!response.headers.get('Content-Type')?.includes('application/json'))return response;
 let c;try{c=await settings(env);}catch{return response;}const a=await readAuthority(request,env);if(!a)return response;
 const data=await response.json(),filter=v=>Array.isArray(v)?v.filter(x=>!x?.secretary||visible(x,a.account,c)).map(filter):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,filter(x)])):v;
 const result=filter(data);if(path==='/api/tasks/people'&&Array.isArray(result.people)&&!result.people.some(p=>p.account===AI))result.people.push({account:AI,name:c.account.name,team:'AI 秘書',type:'ai'});
 return json(result);
}
export async function xiaoyeEnvironment(env){try{const c=await settings(env);return {...env,XIAOYE_SERVICE_PERSON:JSON.stringify({account:AI,name:c.account.name,team:'AI 秘書',type:'ai'})};}catch{return env;}}

import {ownerCommand} from './xiaoye-owner-line.mjs';
const ns='xiaoye-owner-sessions',events='xiaoye-owner-events',ttl=30*60000;
export const noOwnerDraftSql="NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-owner-sessions' AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>?)";
export async function ownerDraftActive(env,id){return !!await env.DB.prepare("SELECT key FROM documents WHERE namespace='xiaoye-owner-sessions' AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>? LIMIT 1").bind(id,Date.now()).first();}
export async function verifyLineApproval(env,c,base,approval,h,taskId){
 const a=approval,s=a.source,cmd=ownerCommand(s?.postbackData);if(!s||s.type!=='user'||s.eventType!=='postback'||cmd?.action!=='approve'||cmd.proposalHash!==a.hash||s.conversationId!==s.userId||s.botUserId!==c.oaBotUserId||!Number.isSafeInteger(a.expiresAt)||a.expiresAt<=Date.now())throw h.fail('LINE核准已失效，請先查核目前狀態。',403);
 const proof=await h.record(env.DB,events,a.eventOperation);if(cmd.taskId!==taskId||!proof||proof.value.taskId!==taskId||proof.value.result.approved!==true||proof.value.proposalHash!==a.hash||proof.value.account!==c.ownerAccount||proof.value.source.userId!==s.userId)throw h.fail('找不到有效的本人LINE核准。',403);
 await h.linePerson(env,base,{account:c.ownerAccount,userId:s.userId,botUserId:s.botUserId});
}
export async function ownerRequest(env,c,base,v,h){
 const {record,load,linePerson,membership,digest,fail,docsInsert,transaction,retireProposal,imageBytes,uuidFrom}=h,source=v.source;
 const actor=await linePerson(env,base,v.sender);
 if(actor.account!==c.ownerAccount||!source||source.type!=='user'||source.conversationId!==source.userId||!c.oaBotUserId||source.botUserId!==c.oaBotUserId||source.botUserId!==v.sender.botUserId||source.userId!==v.sender.userId)throw fail('請由指定負責人在葉小蝸私訊操作。',403);
 if(typeof source.eventId!=='string'||!source.eventId.length||source.eventId.length>180||!Number.isSafeInteger(source.timestamp)||source.timestamp>Date.now()+60000||Date.now()-source.timestamp>24*3600000)throw fail('LINE事件已過期，請重新操作。',403);
 const command=source.eventType==='postback'?ownerCommand(source.postbackData):null;
 if(source.eventType==='postback'&&!command)throw fail('按鈕資料無效。',400);
 if(!['postback','message','unsend'].includes(source.eventType))throw fail('事件類型無效。',400);
 const key=await digest(JSON.stringify([source.botUserId,source.type,source.conversationId,source.userId])),op='line-owner:'+await digest(source.botUserId+':'+source.eventId),fingerprint=await digest(JSON.stringify(v));
 const prior=await record(env.DB,events,op);if(prior){if(prior.value.fingerprint!==fingerprint||prior.value.account!==actor.account)throw fail('此事件已用於其他內容。');if(prior.value.result.draft){const current=await record(env.DB,ns,key);if(current?.value.id!==prior.value.result.draftId||current.value.mode!=='feedback'||current.value.until<=Date.now())return {ok:true,handled:true,keepSession:true,replayed:true};const entries=current.value.entries.filter(e=>!e.withdrawn);return {...prior.value.result,until:current.value.until,texts:entries.filter(e=>e.text).length,images:entries.filter(e=>e.image).length,replayed:true};}return {...prior.value.result,replayed:true};}
 const previous=await record(env.DB,ns,key),d=previous?.value,active=d?.mode==='feedback'&&d.until>Date.now();
 const state=d=>({ok:true,handled:true,draft:true,draftId:d.id,until:d.until,title:d.title,proposalVersion:d.proposalVersion,texts:d.entries.filter(x=>!x.withdrawn&&x.text).length,images:d.entries.filter(x=>!x.withdrawn&&x.image).length});
 const proof=result=>docsInsert(env.DB,events,op,{account:actor.account,source,fingerprint,taskId:command?.taskId||d?.taskId||null,proposalHash:command?.proposalHash||d?.proposalHash||null,result});
 const verify=()=>linePerson(env,base,v.sender);
 async function draftWrite(next,result,extra=[],work=null){
  const predicate=previous?'EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=?)',args=[ns,key,...(previous?[previous.revision]:[])];
  const gate=work?" AND EXISTS(SELECT 1 FROM work_items WHERE id=? AND revision=? AND json_extract(value,'$.secretary.stage')='awaiting_approval' AND json_extract(value,'$.secretary.proposal.hash')=?) AND NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND json_extract(value,'$.mode')='draft' AND json_extract(value,'$.until')>?)":'';
  if(work)args.push(work.task.id,work.revision,work.task.secretary.proposal.hash,key,Date.now());
  await verify();try{await env.DB.batch([env.DB.prepare('INSERT INTO xiaoye_draft_operations(id,guard) VALUES(?,CASE WHEN '+predicate+gate+' THEN 1 ELSE 0 END)').bind(op,...args),docsInsert(env.DB,ns,key,next),proof(result),...extra]);}catch{const saved=await record(env.DB,events,op);if(saved?.value.fingerprint===fingerprint)return saved.value.result;throw fail('內容剛有更新，請重按同一按鈕；已收資料保留。');}return result;
 }
 if(source.eventType==='unsend'){
  if(active&&d.entries.some(e=>e.messageId===source.messageId&&!e.withdrawn)){const next=structuredClone(d);next.entries.filter(e=>e.messageId===source.messageId).forEach(e=>e.withdrawn=true);return draftWrite(next,state(next));}
  const rows=(await env.DB.prepare("SELECT w.id FROM work_items w WHERE EXISTS(SELECT 1 FROM json_each(json_extract(w.value,'$.secretary.ownerFeedback')) f,json_each(f.value,'$.lineSources') e WHERE json_extract(e.value,'$.botUserId')=? AND json_extract(e.value,'$.userId')=? AND json_extract(e.value,'$.messageId')=? AND COALESCE(json_extract(f.value,'$.withdrawn'),0)=0)").bind(source.botUserId,source.userId,source.messageId).all()).results;
  for(const row of rows){const old=await load(env.DB,row.id),t=structuredClone(old.task),s=t.secretary;for(const e of s.ownerFeedback)if(e.lineSources?.some(x=>x.botUserId===source.botUserId&&x.userId===source.userId&&x.messageId===source.messageId))e.withdrawn=true;retireProposal(s);s.sourceVersion++;s.sourceWithdrawn=true;s.stage='blocked';s.blocker='主管建議來源已撤回，請先查核再重新提供資料。';t.status='blocked';await verify();await transaction(env,old,t,op,{action:'withdraw',source},actor,s.blocker,[proof({ok:true,handled:true,withdrawn:true})]);}
  return {ok:true,handled:rows.length>0};
 }
 if(command?.action==='cancel'){
  if(!d||command.draftId!==d.id)throw fail('這是舊的建議按鈕，不會取消其他草稿。');return draftWrite({...d,mode:'cancelled',until:0},{ok:true,handled:true,cancelled:true});
 }
 if(command?.action==='approve'||command?.action==='feedback'){
  if(Date.now()-source.timestamp>10*60000)throw fail('按鈕事件已過期，請重新點選目前方案。');
  const old=await load(env.DB,command.taskId),t=old&&structuredClone(old.task),s=t?.secretary;if(!s||s.sourceWithdrawn||!s.proposal||s.proposal.hash!==command.proposalHash)throw fail('這是舊版方案，請使用目前方案卡。');
  if(command.action==='approve'&&['approved','executing','awaiting_confirmation','closed'].includes(s.stage))return {ok:true,handled:true,approved:true,alreadyApproved:true,proposalVersion:s.proposal.version};
  if(s.stage!=='awaiting_approval')throw fail('目前方案已暫緩或狀態改變，請先查看案件。');await membership(env,c,t.primaryParentId);
  if(command.action==='approve'){
   if(active||await ownerDraftActive(env,t.id))throw fail('請先送出或取消正在填寫的建議，再同意方案。');
   s.approval={account:actor.account,hash:s.proposal.hash,sourceVersion:s.sourceVersion,channel:'line',source,eventOperation:op,expiresAt:Date.now()+ttl,at:new Date().toISOString()};s.stage='approved';s.blocker='';t.status='pending';const result={ok:true,handled:true,approved:true,proposalVersion:s.proposal.version};await verify();await transaction(env,old,t,op,{action:'approve',source,proposalHash:s.proposal.hash},actor,'本人在LINE同意目前第 '+s.proposal.version+' 版方案。',[proof(result)],noOwnerDraftSql,[t.id,Date.now()]);return result;
  }
  if(active){if(d.taskId!==t.id||d.proposalHash!==s.proposal.hash)throw fail('請先送出或取消目前正在填寫的建議，再切換案件。');return state(d);}
  const intake=await record(env.DB,'xiaoye-intake-sessions',key);if(intake?.value.mode==='draft'&&intake.value.until>Date.now())throw fail('請先完成或取消目前的問題回報，再提供方案建議。');
  const next={id:'owner-'+await digest(op),mode:'feedback',taskId:t.id,title:t.title,proposalHash:s.proposal.hash,proposalVersion:s.proposal.version,actor,source,entries:[],until:Date.now()+ttl};return draftWrite(next,state(next),d?[docsInsert(env.DB,'xiaoye-owner-draft-history',d.id,d)]:[],old);
 }
 if(!active)throw fail('建議收件已到期或結束，請重新按目前方案的「提供看法與建議」。');
 if(command?.action==='finish'&&command.draftId!==d.id)throw fail('這是舊的送出按鈕，原草稿保留。');
 const old=await load(env.DB,d.taskId),t=old&&structuredClone(old.task),s=t?.secretary;if(!s||s.sourceWithdrawn||s.stage!=='awaiting_approval'||s.proposal?.hash!==d.proposalHash)throw fail('方案已更新或暫緩；這份建議未送出，請取消後使用新卡。');await membership(env,c,t.primaryParentId);
 const entries=d.entries.filter(e=>!e.withdrawn);
 if(command?.action==='finish'){
  if(!entries.length)return {...state(d),empty:true};const at=new Date().toISOString(),entry={id:op,author:actor,at,proposalVersion:d.proposalVersion,proposalHash:d.proposalHash,text:entries.map(e=>e.text).filter(Boolean).join('\n\n')||'提供建議圖片',attachmentIds:[],lineSources:entries.map(({botUserId,userId,eventId,messageId})=>({botUserId,userId,eventId,messageId}))},extra=[];
  for(const e of entries.filter(e=>e.image)){const parts=(await env.DB.prepare('SELECT content FROM xiaoye_draft_image_chunks WHERE draft_key=? AND image_id=? ORDER BY part').bind('owner:'+d.id,e.image.id).all()).results,bytes=new Uint8Array(e.image.size);let offset=0;for(const p of parts){const b=new Uint8Array(p.content);bytes.set(b,offset);offset+=b.length;}if(offset!==bytes.length||await digest(bytes)!==e.image.digest)throw fail('建議圖片尚未完整保存，請稍後重試。',503);const id='att-'+uuidFrom(await digest(t.id+':'+e.eventId));entry.attachmentIds.push(id);extra.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'normal',t.id,'主管建議圖片',e.image.mime,bytes.length,e.image.digest,actor.account,actor.name,at));for(let p=0,n=0;p<bytes.length;p+=262144,n++)extra.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(id,n,bytes.slice(p,p+262144).buffer));}
  s.ownerFeedback=[...(s.ownerFeedback||[]),entry];retireProposal(s);s.sourceVersion++;s.revisionRequested=true;s.waitingForReporter=false;s.stage='clarifying';s.blocker='';t.status='pending';const result={ok:true,handled:true,submitted:true,proposalVersion:d.proposalVersion};extra.push(docsInsert(env.DB,ns,key,{...d,mode:'submitted',until:0}),proof(result));await verify();await transaction(env,old,t,op,{action:'feedback',source,draftId:d.id},actor,'收到本人在LINE送出的第 '+d.proposalVersion+' 版建議，等待整理新版。',extra,"EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND revision=?)",[ns,key,previous.revision]);return result;
 }
 if(source.eventType!=='message'||source.timestamp<d.source.timestamp)throw fail('這則訊息不屬於本次建議，未加入草稿。');
 const next=structuredClone(d),detail=typeof v.text==='string'?v.text.trim():'',extra=[];if(entries.length>=100||[...entries.map(e=>e.text),detail].filter(Boolean).join('\n\n').length>4000)throw fail('建議最多4000字，請先送出或刪減內容。');
 const e={...source,text:detail};if(v.image){const image=imageBytes(v.image),images=entries.filter(e=>e.image);if(images.length>=10||images.reduce((n,e)=>n+e.image.size,0)+image.bytes.length>10*1024*1024)throw fail('建議最多10張圖片、合計10MB。',413);e.image={id:await digest(op),size:image.bytes.length,mime:image.mime,digest:await digest(image.bytes)};for(let p=0,n=0;p<image.bytes.length;p+=262144,n++)extra.push(env.DB.prepare('INSERT INTO xiaoye_draft_image_chunks(draft_key,image_id,part,content) VALUES(?,?,?,?)').bind('owner:'+d.id,e.image.id,n,image.bytes.slice(p,p+262144).buffer));}
 if(!detail&&!e.image)throw fail('請輸入建議文字或提供圖片。',400);next.entries.push(e);next.until=Date.now()+ttl;return draftWrite(next,state(next),extra,old);
}

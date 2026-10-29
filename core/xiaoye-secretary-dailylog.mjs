import {xiaoyePage} from './xiaoye-secretary-ui.mjs';
import {externalBrowserUrl} from './line-external-browser.mjs';
import {proposalCard,proposalText,validPlanSummary} from './xiaoye-proposal-card.mjs';
import {eventCall,eventStub,prepareXiaoyeEvent} from './xiaoye-secretary-events.mjs';
import {ownerRequest,verifyLineApproval,ownerDraftActive,noOwnerDraftSql} from './xiaoye-owner-actions.mjs';
import {inspectionRunner,inspectionFetch} from './xiaoye-inspection.mjs';
import {resultCard,resultText,completionExplanation,questionCard} from './xiaoye-result-card.mjs';
import {resultRequest} from './xiaoye-result-actions.mjs';
import {restartAnalysis,recoveryDetails,recoveryCard,recoveryNextStep} from './xiaoye-recovery.mjs';
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
function view(t,account,c){if(!visible(t,account,c))throw fail('找不到可查看的問題。',404);const copy=structuredClone(t);copy.secretary.reporters=copy.secretary.reporters.map(({source,...p})=>p);if(account!==c.ownerAccount)delete copy.secretary.caseChat;if(copy.secretary.approval){delete copy.secretary.approval.sessionHash;delete copy.secretary.approval.source;delete copy.secretary.approval.eventOperation;}if(copy.secretary.ownerFeedback)copy.secretary.ownerFeedback=copy.secretary.ownerFeedback.map(({lineSources,...entry})=>entry);if(copy.secretary.approvalHistory)copy.secretary.approvalHistory=copy.secretary.approvalHistory.map(({sessionHash,source,eventOperation,...entry})=>entry);if(copy.secretary.autoAuthorization)copy.secretary.autoAuthorization={enabled:true};if(copy.secretary.autoAuthorizationHistory)copy.secretary.autoAuthorizationHistory=copy.secretary.autoAuthorizationHistory.map(({epoch,hash,...entry})=>entry);delete copy.secretary.autoEventVersionReceipt;delete copy.secretary.lease;delete copy.secretary.leaseUntil;delete copy.secretary.executionEvent;return copy;}
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
 const event=await prepareXiaoyeEvent(env,next,op,input.action);
 if(event)statements.push(env.DB.prepare('INSERT INTO xiaoye_event_outbox(id,task_id,version,kind,created_at) VALUES(?,?,?,?,?)').bind(event.id,next.id,next.version,event.kind,event.createdAt));
 try{await env.DB.batch(statements);}catch{const winner=await env.DB.prepare('SELECT fingerprint FROM xiaoye_operations WHERE id=?').bind(op).first();if(winner?.fingerprint===fingerprint)return (await load(env.DB,next.id)).task;throw fail('內容已更新，請重新讀取後重試。');}
 if(event)try{await eventCall(env,'commit',{id:event.id});}catch{}
 return next;
}
function notification(env,t,account,kind,message,source=null,lineMessage=null,context=null){const s=t.secretary;const key=t.id+':'+kind+':'+s.sourceVersion+':'+(s.proposal?.hash||'')+':'+account;return docsInsert(env.DB,'xiaoye-notifications',key,{id:key,taskId:t.id,account,kind,message,...lineMessage?{lineMessage}:{},...context?{context}:{},sourceVersion:s.sourceVersion,proposalHash:s.proposal?.hash||null,expectedUserId:source?.userId||null,state:'pending',attempts:0,leaseUntil:0,createdAt:Date.now()});}
const entryVersion=s=>s.ownerFeedback?.at(-1)?.proposalVersion||s.proposalSequence||1;
function retireProposal(s){if(s.approval){s.approvalHistory=[...(s.approvalHistory||[]),{...s.approval,retiredAt:new Date().toISOString()}];}if(s.autoAuthorization){s.autoAuthorizationHistory=[...(s.autoAuthorizationHistory||[]),{...s.autoAuthorization,retiredAt:new Date().toISOString()}];}if(s.proposal){s.proposalSequence=Math.max(s.proposalSequence||0,s.proposal.version);s.proposalHistory=[...(s.proposalHistory||[]),{...s.proposal,retiredAt:new Date().toISOString()}];}s.proposal=null;s.approval=null;s.autoAuthorization=null;s.lease=null;s.leaseUntil=0;s.recovery=null;s.recoveryRequested=false;}
function retireResult(s){if(s.result){s.resultHistory=[...(s.resultHistory||[]),{...s.result,retiredAt:new Date().toISOString()}];s.result=null;}}
const link=(env,id)=>externalBrowserUrl(new URL('/xiaoye?issue='+encodeURIComponent(id),env.PUBLIC_ORIGIN).href);
function newIssue(env,c,actor,source,id,description,at){return {id,title:description.slice(0,100)||'待補充問題說明',description:description||'同仁已開啟問題回報，待補充說明或截圖。',requester:actor,lead:{account:AI,name:c.account.name,team:'AI 秘書'},collaborators:[],sharedWith:[],createdBy:{account:AI,name:c.account.name,team:'AI 秘書'},source:'dailylog',sourceDate:day(Date.now()),startDate:day(Date.now()),initialStartDate:day(Date.now()),dueDate:null,dueAt:null,createdAt:at,status:'pending',origin:'assigned',execution:'individual',notionAccounts:[...new Set([actor.account,c.ownerAccount])],level:1,kind:'task',workSchema:2,workSource:'assigned',priority:'normal',department:actor.team||'',departmentId:'',primaryParentId:null,relatedProjectIds:[],dependencyIds:[],finalResult:'',acceptance:c.autoResolutionEnabled?'完成處理後，由原回報人確認問題已解決。':'經核准完成處理後，由原回報人確認問題已解決。',helpRequest:'',projectFields:{},secretary:{stage:'clarifying',category:'unclassified',sourceVersion:0,reporters:[{...actor,source:{...source}}],sources:[],proposal:null,approval:null}};}
async function reportSummary(env,c,actor){
 const rows=(await env.DB.prepare("SELECT json_extract(value,'$.secretary.stage') AS stage FROM work_items WHERE EXISTS(SELECT 1 FROM json_each(json_extract(work_items.value,'$.secretary.reporters')) p WHERE json_extract(p.value,'$.account')=?)").bind(actor.account).all()).results;
 return {total:rows.length,open:rows.filter(r=>!['closed','duplicate'].includes(r.stage)).length,url:externalBrowserUrl(new URL('/xiaoye',env.PUBLIC_ORIGIN).href)};
}
function imageBytes(image){
 const bytes=Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>10*1024*1024)throw fail('圖片上限為 10 MB。',413);
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!png&&!jpg&&!webp)throw fail('請傳 PNG、JPEG 或 WebP 圖片。',400);
 return {bytes,mime:png?'image/png':jpg?'image/jpeg':'image/webp',name:'問題截圖.'+(png?'png':jpg?'jpg':'webp')};
}
function draftState(session){const d=session?.value,active=d?.mode==='draft'&&d.until>Date.now(),pending=d?.mode==='conversation-pending'&&d.until>Date.now();const entries=active?d.entries.filter(e=>!e.withdrawn):[];return {draft:active,...active?{draftId:d.id,texts:entries.filter(e=>e.text).length,images:entries.filter(e=>e.image).length}:pending?{conversational:true,awaitingFirstMessage:true,until:d.until}:d?.taskId?{taskId:d.taskId}:{}};}
function validDeployment(d){return !!(d&&/^tea-[a-z0-9]+$/.test(d.workspaceId||'')&&/^srv-[a-z0-9]+$/.test(d.serviceId||'')&&/^dep-[a-z0-9]+$/.test(d.deployId||'')&&/^[a-f0-9]{40}$/.test(d.commitId||''));}
export function canAutoResume(c,t,e,ownerDraft,capability){
 const s=t?.secretary,sourceCount=s?.sources?.length||0,already=s?.autoRecovery;
 const replan=e?.state==='done'&&e.kind==='execute'&&s?.executionEvent?.id===e.id;
 const terminal=e?.state==='failed'||replan;
 const dep=s?.recovery?.capability,reconciled=capability==='render-deploy-reconciled-v1'&&dep?.outcome==='reconciled-live'&&dep?.reconciliation?.status==='live'&&validDeployment(dep.deployment),failedAnalysis=capability==='render-deploy-failure-analysis-v1'&&dep?.outcome==='reconciled-failed'&&validDeployment(dep.deployment)&&['build_failed','update_failed','pre_deploy_failed','canceled'].includes(dep?.reconciliation?.status);
 if(replan&&dep&&(dep.eventId!==e.id||dep.sourceVersion!==e.sourceVersion||dep.outcome==='unknown'||(!reconciled&&!failedAnalysis&&capability!==dep.name)))return false;
 let exhausted=already?.sourceCount===sourceCount&&(replan?(already.replanAttempts||0)>=3:already.attempts>=1&&(already.failureAfterReplan||0)===(already.replanAttempts||0));
 // The same runner credential records the dependency and asks to resume; this
 // is an identity/version guard, not independent proof of tool authorization.
 const history=already?.sourceCount===sourceCount&&Array.isArray(already?.capabilityEvents)?already.capabilityEvents:[];
 const recent=history.filter(x=>x?.name===capability&&Number.isFinite(x.at)&&x.at>Date.now()-86400000);
 if(capability&&!(replan&&dep?.name==='render-deploy-commit-v1'&&dep.eventId===e.id&&dep.sourceVersion===e.sourceVersion&&(capability===dep.name||reconciled||failedAnalysis)))return false;
 if(replan&&capability&&(capability===dep?.name||reconciled||failedAnalysis))exhausted=!(reconciled||failedAnalysis||['not-started','rejected'].includes(dep.outcome))||history.some(x=>x?.name===capability&&x.eventId===e.id)||recent.length>=3;
 return c.autoResolutionEnabled===true&&typeof c.autoResolutionEpoch==='string'&&c.autoResolutionEpoch.length>=16&&!!s&&!t.deletedAt&&!t.mergedInto&&!s.sourceWithdrawn&&s.stage==='blocked'&&!s.waitingForReporter&&!s.lease&&!s.leaseUntil&&!ownerDraft&&!!s.recovery&&terminal&&!e.leaseActive&&e.taskId===t.id&&e.sourceVersion===s.sourceVersion&&!exhausted;
}
async function inspectEvent(env,c,v){
 if(!/^[a-f0-9]{64}$/.test(v.eventId||'')||!/^work-[a-f0-9-]{36}$/.test(v.id||''))throw fail('事件或案件識別無效。',400);
 const response=await eventCall(env,'inspect',{id:v.eventId});if(!response.ok)throw fail('找不到指定事件。',response.status===400?400:404);
 const e=(await response.json()).event;if(e.taskId!==v.id)throw fail('找不到指定事件。',404);
 const t=(await load(env.DB,v.id))?.task,s=t?.secretary;
 if(!s)throw fail('找不到原案件。',404);
 const draft=await ownerDraftActive(env,t.id);
 const notification=await env.DB.prepare("SELECT json_extract(value,'$.state') AS state,json_extract(value,'$.attempts') AS attempts FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.kind')='result' AND json_extract(value,'$.sourceVersion')=? ORDER BY json_extract(value,'$.createdAt') DESC LIMIT 1").bind(t.id,s.sourceVersion).first();
 return {ok:true,event:e,task:{id:t.id,primaryParentId:t.primaryParentId||null,stage:s.stage,version:t.version,sourceVersion:s.sourceVersion,waitingForReporter:!!s.waitingForReporter,leasePresent:!!s.lease,leaseActive:!!s.lease&&s.leaseUntil>Date.now(),capabilityDependency:s.recovery?.capability||null},projects:c.projects.map(p=>({id:p.id,key:p.key})),autoResumeEligible:canAutoResume(c,t,e,draft),capabilityResumeEligible:canAutoResume(c,t,e,draft,v.capability),resultNotification:notification?{state:notification.state,attempts:notification.attempts}:null};
}
async function autoResume(env,c,v){
 if(!env.XIAOYE_EVENTS)throw fail('事件服務尚未啟用。',503);
 if(!Number.isSafeInteger(v.version)||typeof v.operationId!=='string'||v.operationId.length<8||v.operationId.length>180)throw fail('案件版本或操作識別無效。',400);
 if(v.capability!==undefined&&!['render-deploy-commit-v1','render-deploy-reconciled-v1','render-deploy-failure-analysis-v1'].includes(v.capability))throw fail('不支援的工具能力。',400);
 const actor={account:AI,name:c.account.name,team:'AI 秘書'},input={action:'resume',id:v.id,version:v.version,eventId:v.eventId,operationId:v.operationId,...v.capability?{capability:v.capability}:{}};
 const prior=await replay(env,v.id,v.operationId,input,actor);
 if(prior)return {ok:true,replayed:true,taskId:prior.id,version:prior.version,stage:prior.secretary.stage};
 const inspected=await inspectEvent(env,c,v),old=await load(env.DB,v.id),t=structuredClone(old.task),s=t.secretary;
 if(v.version!==t.version||!(v.capability?inspected.capabilityResumeEligible:inspected.autoResumeEligible))throw fail('案件已有更新或尚不符合自動接續條件。');
 if(t.primaryParentId)await membership(env,c,t.primaryParentId);else for(const project of c.projects)await membership(env,c,project.id);
 const sourceCount=s.sources?.length||0,previous=s.autoRecovery?.sourceCount===sourceCount?s.autoRecovery:null;
 const replan=inspected.event.state==='done'&&inspected.event.kind==='execute';
 const attempts=previous?.attempts||0,replanAttempts=previous?.replanAttempts||0,failedDeployment=v.capability==='render-deploy-failure-analysis-v1'?structuredClone(s.recovery.capability):null;
 restartAnalysis(t,retireProposal);
 if(failedDeployment)s.deploymentReview={state:'pending',originalEventId:v.eventId,originalSourceVersion:failedDeployment.sourceVersion,deployment:failedDeployment.deployment,status:failedDeployment.reconciliation.status};
 const capabilityEvents=[...(previous?.capabilityEvents||[]).filter(x=>Number.isFinite(x?.at)&&x.at>Date.now()-86400000),...v.capability?[{name:v.capability,eventId:v.eventId,at:Date.now()}]:[]];
 s.autoRecovery=replan?{sourceCount,attempts,replanAttempts:replanAttempts+1,...previous?.failureAfterReplan?{failureAfterReplan:previous.failureAfterReplan}:{},...capabilityEvents.length?{capabilityEvents}:{},at:new Date().toISOString(),eventId:v.eventId}:{sourceCount,attempts:1,...replanAttempts?{replanAttempts,failureAfterReplan:replanAttempts}:{},...capabilityEvents.length?{capabilityEvents}:{},at:new Date().toISOString(),eventId:v.eventId};
 s.recoveryHistory.at(-1).automatic=true;
 const guard="NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-owner-sessions' AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>?) AND EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-secretary' AND key='config' AND json_extract(value,'$.autoResolutionEnabled')=1 AND json_extract(value,'$.autoResolutionEpoch')=?)";
 const saved=await transaction(env,old,t,v.operationId,input,actor,'系統確認工具恢復後，沿原案件自動接續查核；已完成的動作先核對，不重做。',[],guard,[t.id,Date.now(),c.autoResolutionEpoch]);
 return {ok:true,taskId:saved.id,version:saved.version,stage:saved.secretary.stage,sourceVersion:saved.secretary.sourceVersion};
}
// Backfill a dependency declared by the local receiver for an older event.
// This uses the same runner credential as the case chat; it is auditable but
// is not independent attestation of what the external tool actually did.
async function recordLegacyCapability(env,c,v){
 if(v.capability!=='render-deploy-commit-v1'||v.evidence!=='legacy-local-preflight-v1'||!Number.isSafeInteger(v.version))throw fail('工具依賴紀錄無效。',400);
 const actor={account:AI,name:c.account.name,team:'AI 秘書'},input={action:'capability-record',id:v.id,version:v.version,eventId:v.eventId,operationId:v.operationId,capability:v.capability,evidence:v.evidence};
 const prior=await replay(env,v.id,v.operationId,input,actor);if(prior)return {ok:true,replayed:true,version:prior.version};
 const inspected=await inspectEvent(env,c,v),old=await load(env.DB,v.id),t=structuredClone(old.task),s=t.secretary;
 const unrestricted=structuredClone(t);unrestricted.secretary.autoRecovery=null;
 if(v.version!==t.version||s.recovery?.capability||inspected.event.state!=='done'||inspected.event.kind!=='execute'||!canAutoResume(c,unrestricted,inspected.event,await ownerDraftActive(env,t.id)))throw fail('原案件已變更或不符合依賴紀錄條件。');
 if(t.primaryParentId)await membership(env,c,t.primaryParentId);else for(const project of c.projects)await membership(env,c,project.id);
 s.recovery.capability={name:v.capability,outcome:'not-started',eventId:v.eventId,sourceVersion:s.sourceVersion,evidence:v.evidence};
 const guard="NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-owner-sessions' AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>?) AND EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-secretary' AND key='config' AND json_extract(value,'$.autoResolutionEnabled')=1 AND json_extract(value,'$.autoResolutionEpoch')=?)";
 const saved=await transaction(env,old,t,v.operationId,input,actor,'接收器依原事件保存既有發布工具受阻紀錄；尚未確認發布寫入權限。',[],guard,[t.id,Date.now(),c.autoResolutionEpoch]);
 return {ok:true,version:saved.version};
}
// Caller is the existing runner: identity and version guards prevent stale
// records, but it remains an assertion by that shared principal.
async function recordDeployReconciliation(env,c,v){
 if(!['live','build_failed','update_failed','pre_deploy_failed','canceled'].includes(v.status)||!validDeployment(v.deployment)||!Number.isSafeInteger(v.version))throw fail('發布查核紀錄無效。',400);
 const actor={account:AI,name:c.account.name,team:'AI 秘書'},input={action:'deploy-reconciliation',id:v.id,version:v.version,eventId:v.eventId,operationId:v.operationId,status:v.status,deployment:v.deployment};
 const prior=await replay(env,v.id,v.operationId,input,actor);if(prior)return {ok:true,replayed:true,version:prior.version};
 const inspected=await inspectEvent(env,c,v),old=await load(env.DB,v.id),t=structuredClone(old.task),s=t.secretary,dep=s.recovery?.capability;
 const unrestricted=structuredClone(t);unrestricted.secretary.autoRecovery=null;if(unrestricted.secretary.recovery)delete unrestricted.secretary.recovery.capability;
 const d=dep?.deployment;
 if(v.version!==t.version||dep?.outcome!=='unknown'||dep.name!=='render-deploy-commit-v1'||dep.eventId!==v.eventId||dep.sourceVersion!==s.sourceVersion||!validDeployment(d)||['workspaceId','serviceId','deployId','commitId'].some(k=>d[k]!==v.deployment[k])||!canAutoResume(c,unrestricted,inspected.event,await ownerDraftActive(env,t.id)))throw fail('原案件或發布識別已變更。');
 if(t.primaryParentId)await membership(env,c,t.primaryParentId);else for(const project of c.projects)await membership(env,c,project.id);
 dep.outcome=v.status==='live'?'reconciled-live':'reconciled-failed';dep.reconciliation={status:v.status,at:new Date().toISOString(),evidence:'runner-asserted-read-only'};
 const guard="NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-owner-sessions' AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>?) AND EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-secretary' AND key='config' AND json_extract(value,'$.autoResolutionEnabled')=1 AND json_extract(value,'$.autoResolutionEpoch')=?)";
 const extras=v.status==='live'?[]:s.reporters.map(p=>notification(env,t,p.account,'deploy-reconciliation','葉小蝸已核對發布狀態：這次發布未成功，目前問題尚未完成，系統會保留原案件進一步查核。\n'+link(env,t.id),p.source,null,{eventId:v.eventId,botUserId:p.source?.botUserId||null}));
 const saved=await transaction(env,old,t,v.operationId,input,actor,v.status==='live'?'接收器核對原發布已上線，仍需查核原問題，不重送原發布。':'接收器核對原發布未成功，保留案件及執行證據，不重送原發布。',extras,guard,[t.id,Date.now(),c.autoResolutionEpoch]);
 return {ok:true,version:saved.version};
}
export async function waitingCases(env,source,account=null){
 if(!source||source.type!=='user'||source.conversationId!==source.userId||!source.botUserId||!source.userId)return [];
 const rows=(await env.DB.prepare("SELECT id,value FROM work_items WHERE json_extract(value,'$.secretary.stage')='clarifying' AND json_extract(value,'$.secretary.waitingForReporter')=1 AND COALESCE(json_extract(value,'$.secretary.sourceWithdrawn'),0)=0 AND json_extract(value,'$.deletedAt') IS NULL AND json_extract(value,'$.mergedInto') IS NULL AND COALESCE(json_extract(value,'$.status'),'')!='cancelled' AND EXISTS(SELECT 1 FROM json_each(json_extract(work_items.value,'$.secretary.reporters')) p WHERE json_extract(p.value,'$.source.botUserId')=? AND json_extract(p.value,'$.source.userId')=? AND json_extract(p.value,'$.source.type')=? AND json_extract(p.value,'$.source.conversationId')=? AND (? IS NULL OR json_extract(p.value,'$.account')=?)) LIMIT 4").bind(source.botUserId,source.userId,source.type,source.conversationId,account,account).all()).results;
 return rows.map(r=>{const t=JSON.parse(r.value);return {id:r.id,title:String(t.title||'問題').slice(0,80),version:t.version};});
}
async function conversationBegin(env,c,v,actor,source,key,previous){
 if(previous?.value.mode==='draft'&&previous.value.until>Date.now())return draftIntake(env,c,v,actor,source,key,previous);
 const event='conversation-begin:'+await digest(source.botUserId+':'+source.eventId),prior=await record(env.DB,'xiaoye-conversation-begins',event);
 if(prior){const current=await record(env.DB,'xiaoye-intake-sessions',key);return {ok:true,handled:true,conversational:true,begun:true,replayed:true,awaitingFirstMessage:current?.value.mode==='conversation-pending'&&current.value.id===prior.value.id,...(current?.value.taskId?{taskId:current.value.taskId}:{}),...await reportSummary(env,c,actor)};}
 if(previous?.value.mode==='conversation-pending'&&previous.value.until>Date.now())return {ok:true,handled:true,conversational:true,begun:true,resumed:true,awaitingFirstMessage:true,until:previous.value.until,...await reportSummary(env,c,actor)};
 const id='conversation-'+await digest(source.botUserId+':'+source.eventId),until=Date.now()+24*3600000,session={mode:'conversation-pending',id,until};
 const guard=previous?'EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=?)';
 try{await env.DB.batch([env.DB.prepare('INSERT INTO xiaoye_draft_operations(id,guard) VALUES(?,CASE WHEN '+guard+' THEN 1 ELSE 0 END)').bind(event,'xiaoye-intake-sessions',key,...(previous?[previous.revision]:[])),docsInsert(env.DB,'xiaoye-intake-sessions',key,session),docsInsert(env.DB,'xiaoye-conversation-begins',event,{id})]);}catch{const winner=await record(env.DB,'xiaoye-conversation-begins',event);if(winner)return {ok:true,handled:true,conversational:true,begun:true,replayed:true,awaitingFirstMessage:true,...await reportSummary(env,c,actor)};throw fail('回報入口剛有更新，請再按一次。');}
 return {ok:true,handled:true,conversational:true,begun:true,awaitingFirstMessage:true,until,...await reportSummary(env,c,actor)};
}
async function conversationCancel(env,c,actor,source,key,previous){
 const event='conversation-cancel:'+await digest(source.botUserId+':'+source.eventId),prior=await record(env.DB,'xiaoye-conversation-cancels',event);
 if(prior)return {ok:true,handled:true,conversational:true,cancelled:true,replayed:true,...await reportSummary(env,c,actor)};
 try{await env.DB.batch([env.DB.prepare("INSERT INTO xiaoye_draft_operations(id,guard) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=? AND json_extract(value,'$.mode')='conversation-pending') THEN 1 ELSE 0 END)").bind(event,key,previous.revision),env.DB.prepare("DELETE FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=?").bind(key,previous.revision),docsInsert(env.DB,'xiaoye-conversation-cancels',event,{id:previous.value.id})]);}catch{throw fail('目前回報已有更新，請再試一次。');}
 return {ok:true,handled:true,conversational:true,cancelled:true,...await reportSummary(env,c,actor)};
}
async function draftIntake(env,c,v,actor,source,key,previous){
 const event='draft:'+await digest(source.botUserId+':'+source.eventId),receipt=await record(env.DB,'xiaoye-draft-events',event),submitted=await record(env.DB,'xiaoye-intake-events','line:'+await digest(source.botUserId+':'+source.eventId));
 if(submitted?.value.taskId)return {ok:true,handled:true,submitted:true,taskId:submitted.value.taskId,url:link(env,submitted.value.taskId),duplicate:true};
 if(receipt)return {ok:true,handled:true,...draftState(previous),duplicate:true,...await reportSummary(env,c,actor)};
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
  const entries=valid(),description=entries.map(e=>e.text).filter(Boolean).join('\n\n').slice(0,12000);if(!entries.length)return {ok:true,handled:true,draft:true,draftId:d.id,needsDescription:true,...await reportSummary(env,c,actor)};
  const id='work-'+uuidFrom(await digest(d.id)),at=new Date().toISOString(),t=newIssue(env,c,actor,entries[0],id,description,at);
  t.title=description.split(/[\n。！？!?]/u).find(x=>x.trim())?.trim().slice(0,80)||'圖片問題（待釐清）';t.secretary.sources=entries.map(({image,...e})=>e);t.secretary.sourceVersion=entries.length;
  for(const e of imageEntries()){
   const parts=(await env.DB.prepare('SELECT content FROM xiaoye_draft_image_chunks WHERE draft_key=? AND image_id=? ORDER BY part').bind(key,e.image.id).all()).results,bytes=new Uint8Array(e.image.size);let offset=0;
   for(const p of parts){const b=new Uint8Array(p.content);bytes.set(b,offset);offset+=b.length;}if(offset!==bytes.length||await digest(bytes)!==e.image.digest)throw fail('圖片尚未完整保存，請稍後再按完成回報。',503);
   const attachment='att-'+uuidFrom(await digest(id+':'+e.eventId));extra.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(attachment,'normal',id,e.image.name,e.image.mime,bytes.length,e.image.digest,actor.account,actor.name,at));
   for(let p=0,n=0;p<bytes.length;p+=262144,n++)extra.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(attachment,n,bytes.slice(p,p+262144).buffer));
  }
  for(const e of entries)extra.push(docsInsert(env.DB,'xiaoye-intake-events','line:'+await digest(e.botUserId+':'+e.eventId),{taskId:id}));
  const operation='line:'+await digest(source.botUserId+':'+source.eventId);extra.push(docsInsert(env.DB,'xiaoye-intake-events',operation,{taskId:id}),docsInsert(env.DB,'xiaoye-intake-sessions',key,{taskId:id,until:Date.now()+24*3600000}),notification(env,t,actor.account,'receipt','葉小蝸已建立問題：'+t.title+'\n'+(c.autoResolutionEnabled?'會先查核問題並直接處理。':'會先釐清與提案，負責人核准後才執行。')+'你可以繼續在原對話補充文字或圖片，也可查看案件進度：\n'+link(env,id),source));
  await transaction(env,null,t,operation,{action:'intake',draftId:d.id,eventId:source.eventId},actor,'同仁完成回報，整理標題、文字與圖片並建立一張問題卡。',extra,"EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=?)",[key,previous.revision]);
  return {ok:true,handled:true,submitted:true,taskId:id,url:link(env,id),title:t.title,autoResolutionEnabled:c.autoResolutionEnabled===true};
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
 const batch=[env.DB.prepare('INSERT INTO xiaoye_draft_operations(id,guard) VALUES(?,CASE WHEN '+guard+" AND NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-owner-sessions' AND key=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>?)"+' THEN 1 ELSE 0 END)').bind(event,'xiaoye-intake-sessions',key,...(previous?[previous.revision]:[]),key,Date.now()),docsInsert(env.DB,'xiaoye-intake-sessions',key,d),docsInsert(env.DB,'xiaoye-draft-events',event,{draftId:d.id}),...extra];
 try{await env.DB.batch(batch);}catch{if(await record(env.DB,'xiaoye-draft-events',event))return {ok:true,handled:true,...draftState(previous),duplicate:true,...await reportSummary(env,c,actor)};throw fail('回報內容剛有更新，請稍後重試，已收到的資料會保留。');}
 return {ok:true,handled:true,draft:!v.cancel&&!v.end,draftId:d.id,cancelled:!!v.cancel||!!v.end,begun:!!v.begin,resumed:!!v.begin&&active,texts:valid().filter(e=>e.text).length,images:imageEntries().length,...await reportSummary(env,c,actor)};
}
export async function intake(env,c,base,v){
 const actor=await linePerson(env,base,v.sender),source=v.source;
 if(!source||!['user','group'].includes(source.type)||c.oaBotUserId&&source.botUserId!==c.oaBotUserId||source.userId!==v.sender.userId||source.botUserId!==v.sender.botUserId||source.type==='user'&&source.conversationId!==source.userId||source.type==='group'&&!/^C[0-9a-f]{32}$/i.test(source.conversationId||''))throw fail('對話來源無法確認。',403);
 text(source.eventId,180);if(!Number.isSafeInteger(source.timestamp)||Math.abs(Date.now()-source.timestamp)>24*3600000)throw fail('回報事件已過期。',403);
 const sessionKey=await digest(JSON.stringify([source.botUserId,source.type,source.conversationId,source.userId])),session=await record(env.DB,'xiaoye-intake-sessions',sessionKey),sessionLive=!!session&&session.value.until>Date.now();
 const ownerSession=await record(env.DB,'xiaoye-owner-sessions',sessionKey);if(ownerSession?.value.mode==='feedback'&&ownerSession.value.until>Date.now()&&!v.status)throw fail('請先取消目前的方案建議，或重新按方案卡接續；這則內容未加入其他案件。');
 if(v.status)return {ok:true,handled:true,refreshControls:!!v.refreshControls,...draftState(session),...await reportSummary(env,c,actor)};
 if(v.draftId&&(session?.value.mode!=='draft'||session.value.id!==v.draftId||session.value.until<=Date.now())||v.taskId&&v.end&&(session?.value.mode==='draft'||session?.value.taskId!==v.taskId))return {ok:true,handled:true,staleControls:true,...draftState(session),...await reportSummary(env,c,actor)};
 if(v.begin&&v.conversational)return conversationBegin(env,c,v,actor,source,sessionKey,session);
 if(v.cancel&&sessionLive&&session.value.mode==='conversation-pending')return conversationCancel(env,c,actor,source,sessionKey,session);
 if(v.begin||v.finish||v.cancel||sessionLive&&session.value.mode==='draft')return draftIntake(env,c,v,actor,source,sessionKey,session);
 if(v.end){await env.DB.prepare("DELETE FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=?").bind(sessionKey).run();return {ok:true,handled:!!session,ended:true};}
 const pendingSession=sessionLive&&session.value.mode==='conversation-pending'?session:null;
 if(pendingSession)v={...v,start:true};
 const eventKey='line:'+await digest(source.botUserId+':'+source.eventId),receipt=await record(env.DB,'xiaoye-intake-events',eventKey);
 if(receipt)return {ok:true,handled:true,taskId:receipt.value.taskId,duplicate:true,url:link(env,receipt.value.taskId)};
 const routingReceipt=await record(env.DB,'xiaoye-intake-routing',eventKey);
 if(routingReceipt)return {...routingReceipt.value,duplicate:true};
 let directReplyId=null;
 if(!v.start&&!v.resumeTaskId&&(!sessionLive||!['draft','followup'].includes(session.value.mode))){
  const waiting=await waitingCases(env,source,actor.account);
  if(waiting.length===1&&(!sessionLive||session.value.taskId!==waiting[0].id))directReplyId=waiting[0].id;
  else if(waiting.length>1){
   const result={ok:true,handled:true,needsCaseSelection:true,cases:waiting.slice(0,3).map(x=>({id:x.id,title:x.title,version:x.version,url:link(env,x.id)})),hasMoreCases:waiting.length>3,allCasesUrl:externalBrowserUrl(new URL('/xiaoye',env.PUBLIC_ORIGIN).href),message:'你有不只一件問題正在等補充。請先選要回覆的問題，再傳訊息或照片。'};
   await env.DB.prepare("INSERT OR IGNORE INTO documents(namespace,key,value,revision) VALUES('xiaoye-intake-routing',?,?,1)").bind(eventKey,JSON.stringify(result)).run();
   return {...(await record(env.DB,'xiaoye-intake-routing',eventKey)).value};
  }
 }
 if(!v.start&&!v.resumeTaskId&&!directReplyId&&!sessionLive)return {ok:true,handled:false};
 let old=null;if(v.resumeTaskId||directReplyId){old=await load(env.DB,v.resumeTaskId||directReplyId);const reporter=old?.task.secretary?.reporters.find(p=>p.account===actor.account);if(!reporter||old.task.deletedAt||old.task.mergedInto||old.task.status==='cancelled'||reporter.source.botUserId!==source.botUserId||reporter.source.userId!==source.userId||reporter.source.type!==source.type||reporter.source.conversationId!==source.conversationId||['closed','duplicate'].includes(old.task.secretary.stage)||directReplyId&&(!old.task.secretary.waitingForReporter||old.task.secretary.stage!=='clarifying'))throw fail('請從原問題頁確認並在原對話接續補充。',403);}else if(!v.start)old=await load(env.DB,session.value.taskId);
 if(old&&!visible(old.task,actor.account,c))throw fail('回報工作已改變。');
 if(!v.start&&!old)throw fail('找不到原問題，請重新輸入「回報問題」。');
 const id=old?.task.id||'work-'+uuidFrom(await digest(eventKey)),at=new Date().toISOString();
 const description=typeof v.text==='string'?v.text.trim().slice(0,12000):'';
 if(v.start&&!description&&!v.image)return {ok:true,handled:true,needsDescription:true};
 let t=old?structuredClone(old.task):newIssue(env,c,actor,source,id,description,at);
 if(old&&description)t.description=(t.description+'\n\n補充：'+description).slice(0,24000);
 if(old)retireResult(t.secretary);
 if(old&&(t.secretary.proposal||t.secretary.approval))retireProposal(t.secretary);
 t.secretary={...t.secretary,stage:'clarifying',waitingForReporter:false,sourceWithdrawn:v.resumeTaskId?!!t.secretary.sourceWithdrawn:false,sourceVersion:t.secretary.sourceVersion+1,proposal:null,approval:null,lease:null,leaseUntil:0};t.status='pending';t.secretary.sources.push({...source,text:description});
 if(t.secretary.sources.length>300)throw fail('此問題的補充已達上限，請由管理者接續。');
 if(t.title==='待補充問題說明'&&description)t.title=description.slice(0,100);
 const extras=[docsInsert(env.DB,'xiaoye-intake-events',eventKey,{taskId:id}),docsInsert(env.DB,'xiaoye-intake-sessions',sessionKey,{taskId:id,until:Date.now()+24*3600000})];
 if(!old)extras.push(notification(env,t,actor.account,'receipt','葉小蝸已收到你的問題，'+(c.autoResolutionEnabled?'接下來會查核並直接處理。':'接下來會釐清並提出方案，經負責人核准後才執行。')+'\n你可以接著補充截圖與說明。\n'+link(env,id),source));
 if(v.image){const bytes=Uint8Array.from(atob(v.image.base64),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>10*1024*1024)throw fail('圖片上限為 10 MB。',413);const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!png&&!jpg&&!webp)throw fail('請上傳 PNG、JPEG 或 WebP 截圖。',400);
  const hash=await digest(bytes),attachment='att-'+uuidFrom(await digest(id+':'+source.eventId)),mime=png?'image/png':jpg?'image/jpeg':'image/webp';
  extras.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(attachment,'normal',id,'問題截圖.'+(png?'png':jpg?'jpg':'webp'),mime,bytes.length,hash,actor.account,actor.name,at));
  for(let offset=0,part=0;offset<bytes.length;offset+=65536,part++)extras.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(attachment,part,bytes.slice(offset,offset+65536).buffer));
 }
 const pendingGuard="EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=? AND revision=? AND json_extract(value,'$.mode')='conversation-pending' AND json_extract(value,'$.id')=?)";
 try{t=await transaction(env,old,t,eventKey,{action:'intake',eventId:source.eventId,text:description,image:!!v.image},actor,old?'收到同仁補充，原方案須重新檢查。':'收到新問題，等待釐清與提案。',extras,pendingSession?pendingGuard:'1',pendingSession?[sessionKey,pendingSession.revision,pendingSession.value.id]:[]);}catch(error){
  if(!pendingSession||v._retriedPending)throw error;
  const current=await record(env.DB,'xiaoye-intake-sessions',sessionKey);
  if(!current?.value.taskId)throw error;
  return intake(env,c,base,{...v,start:false,_retriedPending:true});
 }
 return {ok:true,handled:true,taskId:t.id,url:link(env,t.id),newIssue:!old,supplemented:!!old};
}
async function approved(env,c,t,authority,base){const s=t.secretary,a=s.approval,automatic=s.autoAuthorization;if(s.sourceWithdrawn||!s.proposal)throw fail('目前問題或處理範圍已失效。',403);if(automatic&&c.autoResolutionEnabled===true&&typeof c.autoResolutionEpoch==='string'&&c.autoResolutionEpoch.length>=16&&automatic.epoch===c.autoResolutionEpoch&&automatic.policy==='owner-direct-20261028'&&automatic.hash===s.proposal.hash&&automatic.sourceVersion===s.sourceVersion){await membership(env,c,t.primaryParentId);return;}if(!a||a.account!==c.ownerAccount||a.hash!==s.proposal.hash||a.sourceVersion!==s.sourceVersion)throw fail('缺少目前有效的處理授權。',403);if(a.channel==='line')await verifyLineApproval(env,c,base,a,{fail,record,linePerson},t.id);else await authority(env,a.sessionHash,c.ownerAccount);await membership(env,c,t.primaryParentId);}
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
async function runner(env,c,base,authority,action,v,preview){
 if(['health','inspect','inspection-open','evidence-check','record-finding'].includes(action))return inspectionRunner(env,c,action,v,{record,load,membership,linePerson,currentPerson,base,replay,transaction,preview,approved:t=>approved(env,c,t,authority,base)});
 if(action==='resume'){
  const previous=await replay(env,v.id,v.operationId,{action:'resume',grantId:v.grantId},c.account);if(previous)return {ok:true,task:previous,replayed:true};
  const grant=await record(env.DB,'xiaoye-recovery-grants',v.grantId),g=grant?.value;if(!g||g.id!==v.id||g.operationId!==v.operationId||g.scope!=='analyze-only'||g.ownerAccount!==c.ownerAccount||g.accountId!==c.account.id)throw fail('缺少本人明確交接的單案接續資格。',403);
  const old=await load(env.DB,v.id);if(!old||old.task.version!==g.version||old.task.secretary?.sourceVersion!==g.sourceVersion||g.expiresAt<=Date.now())throw fail('案件或接續資格已變更。',403);
  const t=structuredClone(old.task);await currentPerson(env,base,{account:c.ownerAccount});if(t.primaryParentId)await membership(env,c,t.primaryParentId);else for(const p of c.projects)await membership(env,c,p.id);
  if(t.secretary.stage==='approved'&&g.failedEventId){const r=await eventCall(env,'failed-proof',{id:g.failedEventId,taskId:t.id,version:t.version,sourceVersion:t.secretary.sourceVersion});if(!r.ok||!(await r.json()).recoverable)throw fail('原事件尚未確認失敗，不能接續或重做。',403);t.secretary.stage='blocked';t.secretary.blocker='原事件已停止但舊版本未更新案件狀態；依本人交接僅重新分析，不重做執行。';}
  restartAnalysis(t,retireProposal);
  return {ok:true,task:await transaction(env,old,t,v.operationId,{action:'resume',grantId:v.grantId},c.account,'依本人本聊天要求，沿原卡重新查核；原執行資格停止，新方案仍須本人核准。',[env.DB.prepare("DELETE FROM documents WHERE namespace='xiaoye-recovery-grants' AND key=? AND revision=?").bind(v.grantId,grant.revision)],"EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-recovery-grants' AND key=? AND revision=? AND json_extract(value,'$.expiresAt')>?)",[v.grantId,grant.revision,Date.now()])};
 }
 if(action==='event-bootstrap'){
  if(typeof v.operationId!=='string'||v.operationId.length<8||v.operationId.length>180)throw fail('請保存唯一安裝操作識別。',400);
  const installed=await record(env.DB,'xiaoye-event-bootstrap','installed');if(installed){if(installed.value.operationId!==v.operationId)throw fail('事件交接已完成，不可重複掃描。');return {ok:true,...installed.value,replayed:true};}
  const rows=(await env.DB.prepare("SELECT value FROM work_items WHERE json_extract(value,'$.secretary.stage')='approved' OR (json_extract(value,'$.secretary.stage')='clarifying' AND COALESCE(json_extract(value,'$.secretary.waitingForReporter'),0)=0 AND COALESCE(json_extract(value,'$.secretary.sourceWithdrawn'),0)=0)").all()).results;
  let seeded=0;for(const row of rows){const t=JSON.parse(row.value),event=await prepareXiaoyeEvent(env,t,'event-bootstrap:'+t.id+':'+t.version,t.secretary.stage==='approved'?'approve':'intake');if(!event)throw fail('事件服務尚未啟用。',503);await env.DB.prepare('INSERT OR IGNORE INTO xiaoye_event_outbox(id,task_id,version,kind,created_at) VALUES(?,?,?,?,?)').bind(event.id,t.id,t.version,event.kind,event.createdAt).run();try{await eventCall(env,'commit',{id:event.id});}catch{}seeded++;}
  const value={operationId:v.operationId,seeded,at:new Date().toISOString()};await docsInsert(env.DB,'xiaoye-event-bootstrap','installed',value).run();return {ok:true,...value};
 }
 if(action==='event-status')return eventCall(env,'status');
 if(['event-acquire','event-check','event-complete','event-fail'].includes(action)){
  const r=await eventCall(env,action.slice(6)==='acquire'?'acquire':action.slice(6)==='check'?'check':action.slice(6)==='complete'?'complete':'fail',v);
  if(!r.ok)return r;
  const result=await r.json();
  if(result.job){try{const t=(await load(env.DB,result.job.taskId))?.task;if(!t)throw fail('找不到問題。',404);for(const p of t.secretary.reporters){if(p.source?.type==='user'||p.source?.type==='group')await linePerson(env,base,{...p,userId:p.source.userId,botUserId:p.source.botUserId});else await currentPerson(env,base,p);}if(result.job.kind==='execute')await approved(env,c,t,authority,base);return {...result,task:t,projects:c.projects};}catch(e){if(action==='event-acquire')await eventCall(env,'fail',{id:result.job.id,lease:result.job.lease});throw e;}}
  return result;
 }
 if(action==='queue'){const rows=(await env.DB.prepare("SELECT value FROM work_items WHERE json_extract(value,'$.secretary') IS NOT NULL AND json_extract(value,'$.secretary.stage') NOT IN ('closed','duplicate') ORDER BY json_extract(value,'$.updatedAt')").all()).results;return {ok:true,contract:XIAOYE_CONTRACT,projects:c.projects,tasks:rows.map(r=>{const t=JSON.parse(r.value);if(t.secretary.approval)delete t.secretary.approval.sessionHash;return t;})};}
 if(action==='claim'){
  const previous=await env.DB.prepare('SELECT task_id FROM xiaoye_operations WHERE id=?').bind(v.operationId||'').first();if(previous){const actor={account:AI},t=await replay(env,previous.task_id,v.operationId,{action:'claim',id:previous.task_id},actor);return {ok:true,task:t,lease:t.secretary.stage==='executing'?t.secretary.lease:null,replayed:true};}
  const row=v.id?await env.DB.prepare("SELECT id FROM work_items WHERE id=? AND json_extract(value,'$.secretary.stage')='approved'").bind(v.id).first():await env.DB.prepare("SELECT id FROM work_items WHERE json_extract(value,'$.secretary.stage')='approved' ORDER BY json_extract(value,'$.updatedAt') LIMIT 1").first();if(!row)return {ok:true,task:null};v.id=row.id;
 }
 const old=await load(env.DB,v.id);if(!old?.task.secretary)throw fail('找不到問題。',404);const t=structuredClone(old.task),s=t.secretary,actor={account:AI,name:c.account.name,team:'AI 秘書'};
 if(action==='attachments')return {ok:true,attachments:(await env.DB.prepare("SELECT id,name,mime,size,digest FROM task_attachments WHERE scope='normal' AND target_id=? AND removed_at IS NULL ORDER BY created_at LIMIT 20").bind(t.id).all()).results};
 const image=action.match(/^attachment\/(att-[a-f0-9-]{36})$/);if(image){const file=await env.DB.prepare("SELECT id,mime,size FROM task_attachments WHERE scope='normal' AND target_id=? AND id=? AND removed_at IS NULL").bind(t.id,image[1]).first();if(!file||!['image/png','image/jpeg','image/webp'].includes(file.mime)||file.size>10*1024*1024)throw fail('找不到可查看的問題截圖。',404);const chunks=(await env.DB.prepare('SELECT content FROM task_attachment_chunks WHERE attachment_id=? ORDER BY part').bind(file.id).all()).results,bytes=new Uint8Array(file.size);let offset=0;for(const part of chunks){const b=new Uint8Array(part.content);bytes.set(b,offset);offset+=b.length;}if(offset!==file.size)throw fail('截圖尚未完整保存。',503);return new Response(bytes,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(['propose','clarify','answer','finish','fail','deploy-effects-check'].includes(action)){const previous=await replay(env,t.id,v.operationId,{...v,action},actor);if(previous)return {ok:true,task:previous,replayed:true};}
 if(action==='bind-chat'){
  const previous=await replay(env,t.id,v.operationId,{...v,action},actor);if(previous)return {ok:true,task:previous,replayed:true};
  if(!env.XIAOYE_EVENTS||v.version!==t.version||!/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.threadId||'')||!/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.projectId||'')||v.hostId!=='local')throw fail('案件聊天資料或版本無效。',400);
  const event=await eventCall(env,'check',{id:v.eventId,lease:v.eventLease});
  if(!event.ok)throw fail('事件已變更或失效，請停止處理。',403);
  const checked=(await event.json()).job;
  if(checked.taskId!==t.id||checked.sourceVersion!==s.sourceVersion)throw fail('事件與案件不符。',403);
  if(s.caseChat&&s.caseChat.threadId!==v.threadId)throw fail('案件已有指定聊天，不能建立另一個。');
  if(s.stage==='awaiting_confirmation'&&s.result){const prior=s.findingResultReceipt;s.findingResultReceipt={fromVersion:prior?.throughVersion===t.version?prior.fromVersion:t.version,throughVersion:t.version+1};}
  if(s.stage==='approved'&&s.autoAuthorization){const prior=s.autoEventVersionReceipt;s.autoEventVersionReceipt={fromVersion:prior?.throughVersion===t.version?prior.fromVersion:t.version,throughVersion:t.version+1,hash:s.autoAuthorization.hash};}
  s.caseChat={threadId:v.threadId,projectId:v.projectId,hostId:'local'};
  const caseUrl=link(env,t.id),links=Array.isArray(t.resultLinks)?t.resultLinks:[];
  if(!links.some(item=>(typeof item==='string'?item:item?.url)===caseUrl)){
   if(links.length>=20)throw fail('任務連結已滿，請先保留空間再連結案件聊天。');
   t.resultLinks=[...links,{label:'案件處理詳情',url:caseUrl}];
  }
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'已連結此案件的 Codex 聊天。')};
 }
 if(env.XIAOYE_EVENTS&&['propose','clarify','answer','claim','check','finish','fail','deploy-effects-check'].includes(action)){
  const execution=s.executionEvent||{},id=v.eventId||execution.id,lease=v.eventLease||execution.lease;
  const r=await eventCall(env,'check',{id,lease});if(!r.ok)throw fail('事件已變更或失效，請停止處理。',403);const e=(await r.json()).job;
  if(e.taskId!==t.id||e.sourceVersion!==s.sourceVersion||(['claim','check','finish','fail'].includes(action)&&e.kind!=='execute')||(['propose','clarify','answer','deploy-effects-check'].includes(action)&&e.kind!=='analyze'))throw fail('事件與案件或核准範圍不符。',403);
  if(action==='claim')s.executionEvent={id,lease};
 }
 if(action==='deploy-effects-check'){
  const review=s.deploymentReview;
  if(!env.XIAOYE_EVENTS||v.version!==t.version||s.stage!=='clarifying'||s.waitingForReporter||s.sourceWithdrawn||review?.state!=='pending'||v.originalEventId!==review.originalEventId||v.deployId!==review.deployment?.deployId)throw fail('發布副作用查核的案件、事件或版本已變更。');
  if(!['none','identified'].includes(v.effectsStatus)||!Array.isArray(v.evidence)||!v.evidence.length||v.evidence.some(e=>typeof e!=='string'||!e.trim()||e.length>2000))throw fail('請提供已核對的副作用及依據；不明時不可視為已核對。',400);
  if(t.primaryParentId)await membership(env,c,t.primaryParentId);else for(const project of c.projects)await membership(env,c,project.id);
  s.deploymentReview={...review,state:'reviewed',effectsStatus:v.effectsStatus,summary:text(v.summary,2000),evidence:v.evidence,reviewedAt:new Date().toISOString(),reviewEventId:v.eventId};
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'已保存原發布副作用的查核依據；後續仍須依新方案與事件資格處理。')};
 }
 if(action==='clarify'){
  if(v.version!==t.version||s.stage!=='clarifying'||s.waitingForReporter)throw fail('此問題已有更新或正在等待同仁補充。');const question=text(v.question,2000);s.waitingForReporter=true;s.question=question;
  const extra=s.reporters.map(p=>notification(env,t,p.account,'question','葉小蝸想釐清：'+t.title+'\n'+question+'\n請按「回覆這個問題」後直接傳文字或照片。',p.source,questionCard({...t,version:t.version+1},question)));
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'向原回報人釐清：'+question,extra)};
 }
 if(action==='answer'){
  if(s.deploymentReview?.state==='pending')throw fail('請先核對先前發布的副作用並保存具體依據，再提供完成說明。');
  if(!env.XIAOYE_EVENTS||v.version!==t.version||s.stage!=='clarifying'||s.waitingForReporter||s.sourceWithdrawn)throw fail('此問題已有更新或等待同仁補充。');
  await membership(env,c,v.projectId);
  if(!Array.isArray(v.evidence)||!v.evidence.length||v.evidence.some(e=>typeof e!=='string'||!e.trim()||e.length>2000))throw fail('請附上這次說明的查核依據。',400);
  if(v.title!==undefined)t.title=text(v.title,100);
  const result=text(v.result,12000);s.category='help';t.primaryParentId=v.projectId;
  s.stage='awaiting_confirmation';s.result={text:result,explanation:completionExplanation(v.explanation),evidence:v.evidence,deployed:false,kind:'guidance',at:new Date().toISOString()};t.finalResult=result;t.status='in_progress';
  const extras=s.reporters.map(p=>notification(env,t,p.account,'result',resultText(t)+'\n'+link(env,t.id),p.source));
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'已提供查核後的操作說明，等待原回報人確認。',extras)};
 }
 if(action==='propose'){
  if(s.deploymentReview?.state==='pending')throw fail('請先核對先前發布的副作用並保存具體依據，再提出方案。');
  if(v.version!==t.version)throw fail('問題已有補充，請重新檢查。');if(s.sourceWithdrawn)throw fail('原來源已撤回，請等待同仁重新補充。');if(s.waitingForReporter)throw fail('正在等待原同仁補充，請先保留問題。');if(['executing','awaiting_confirmation','closed','duplicate'].includes(s.stage))throw fail('請先停止或重新開啟原工作。');
  const p=v.proposal||{};if(!validPlanSummary(p.summary))throw fail('處理方案請用100字以內的一段白話，說清楚要改什麼、改完會怎樣；不要列步驟。',400);for(const k of ['summary','reason','steps','validation','rollback'])text(p[k],8000);if(!Array.isArray(p.systems)||!p.systems.length||p.systems.some(x=>!['am','dailylog','uof'].includes(x))||typeof p.deploy!=='boolean')throw fail('請清楚指定影響系統與是否發布。',400);
  await membership(env,c,v.projectId);if(!['help','bug','improvement'].includes(v.category))throw fail('請指定問題類型。',400);
  if(v.title!==undefined)t.title=text(v.title,100);
  if(s.proposal)retireProposal(s);
  s.proposal={...Object.fromEntries(['summary','reason','steps','validation','rollback','systems','deploy'].map(k=>[k,p[k]])),version:(s.proposalSequence||0)+1,sourceVersion:s.sourceVersion};s.proposalSequence=s.proposal.version;s.proposal.hash=await digest(JSON.stringify(s.proposal));s.approval=null;s.autoAuthorization=null;s.stage='awaiting_approval';s.revisionRequested=false;t.primaryParentId=v.projectId;s.category=v.category;
  if(c.autoResolutionEnabled===true){if(!env.XIAOYE_EVENTS||typeof c.autoResolutionEpoch!=='string'||c.autoResolutionEpoch.length<16)throw fail('自動處理服務尚未完成設定，原案件保留。',503);s.autoAuthorization={policy:'owner-direct-20261028',epoch:c.autoResolutionEpoch,hash:s.proposal.hash,sourceVersion:s.sourceVersion,at:new Date().toISOString()};s.stage='approved';return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'依本人設定自動接續處理此方案。')};}
  const msg=proposalText(t)+'\n'+link(env,t.id);
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,'提出方案，等待本人核准。',[notification(env,t,c.ownerAccount,'approval',msg,null,proposalCard(env.PUBLIC_ORIGIN,t))])};
 }
 if(action==='check'||action==='finish'||action==='fail'){
  if(s.stage!=='executing'||s.lease!==v.lease||s.leaseUntil<=Date.now())throw fail('執行確認已失效，請停止並重新查核。',403);await approved(env,c,t,authority,base);
  if(action==='check')return {ok:true,allowed:true,task:t,leaseUntil:s.leaseUntil};
  const result=text(v.result,12000);s.leaseUntil=0;s.lease=null;
  const extras=[];
  if(action==='finish'){
   if(!Array.isArray(v.evidence)||!v.evidence.length||v.evidence.some(e=>typeof e!=='string'||!e.trim()||e.length>2000))throw fail('請附上實際驗證或發布證據。',400);
   if(typeof v.deployed!=='boolean'||v.deployed!==s.proposal.deploy)throw fail('結果與核准的發布範圍不符。');
   s.stage='awaiting_confirmation';s.result={text:result,explanation:completionExplanation(v.explanation),evidence:v.evidence,deployed:v.deployed,at:new Date().toISOString()};t.finalResult=result;t.status='in_progress';
   for(const p of s.reporters)extras.push(notification(env,t,p.account,'result',resultText(t)+'\n'+link(env,t.id),p.source));
  }else{s.stage='blocked';s.blocker=result;s.recovery=recoveryDetails(v.blockerInfo?.reason||result,v.blockerInfo?.nextStep,await digest(v.operationId+':resume:'+t.id),c.autoResolutionEnabled===true);if(v.blockerInfo?.capability==='render-deploy-commit-v1'&&s.executionEvent?.id){const d=v.blockerInfo.deployment;s.recovery.capability={name:v.blockerInfo.capability,outcome:['not-started','rejected'].includes(v.blockerInfo?.publishOutcome)?v.blockerInfo.publishOutcome:'unknown',eventId:s.executionEvent.id,sourceVersion:s.sourceVersion,evidence:'runner-asserted',...validDeployment(d)?{deployment:{workspaceId:d.workspaceId,serviceId:d.serviceId,deployId:d.deployId,commitId:d.commitId}}:{}};}t.status='blocked';extras.push(notification(env,t,c.ownerAccount,'blocked','葉小蝸處理受阻：'+t.title+'\n原因：'+s.recovery.reason+'\n下一步：'+s.recovery.nextStep+'\n'+link(env,t.id),null,recoveryCard(env.PUBLIC_ORIGIN,t,c.autoResolutionEnabled===true)));for(const p of s.reporters)extras.push(notification(env,t,p.account,'progress','葉小蝸處理「'+t.title+'」時遇到困難，目前尚未完成，原案件已保留。'+(s.recovery.capability?.outcome==='unknown'?(s.recovery.capability.deployment?'發布結果尚未確認，系統會核對，確認前不重送。':'發布識別資料不足，目前無法確認是否已發布；確認前不重送。'):'若需要您補充，會在這裡詢問；有結果後也會在這裡告訴您。')+'\n'+link(env,t.id),p.source));}
  return {ok:true,task:await transaction(env,old,t,v.operationId,{...v,action},actor,result,extras)};
 }
 if(action==='claim'){
  await approved(env,c,t,authority,base);s.stage='executing';s.lease=crypto.randomUUID();s.leaseUntil=Date.now()+30*60000;t.status='in_progress';
  const guard="NOT EXISTS(SELECT 1 FROM work_items WHERE json_extract(value,'$.secretary.stage')='executing')";
  return {ok:true,task:await transaction(env,old,t,v.operationId,{action:'claim',id:t.id},actor,s.autoAuthorization?'依本人設定自動開始處理。':'依本人核准開始處理。',[],guard),lease:s.lease};
 }
 throw fail('不支援此操作。',400);
}
export function notificationCurrent(n,t){
 if(!t?.secretary)return false;const s=t.secretary;
 if(n.kind==='receipt')return !s.sourceWithdrawn&&s.reporters.some(p=>p.account===n.account);
 if(n.kind==='deploy-reconciliation'){
  if(t.deletedAt||t.mergedInto||t.status==='cancelled'||s.sourceWithdrawn||!n.context?.eventId||!n.context.botUserId||!n.expectedUserId||!s.reporters?.some(p=>p.account===n.account&&p.source?.userId===n.expectedUserId&&p.source?.botUserId===n.context.botUserId))return false;
  const dep=s.recovery?.capability,review=s.deploymentReview;
  if(s.stage==='blocked')return n.sourceVersion===s.sourceVersion&&n.proposalHash===(s.proposal?.hash||null)&&dep?.eventId===n.context.eventId&&dep.outcome==='reconciled-failed';
  return ['clarifying','awaiting_approval','approved','executing'].includes(s.stage)&&['pending','reviewed'].includes(review?.state)&&review.originalEventId===n.context.eventId&&review.originalSourceVersion===n.sourceVersion&&s.sourceVersion===n.sourceVersion+1;
 }
 if(n.sourceVersion!==s.sourceVersion||n.proposalHash!==(s.proposal?.hash||null))return false;if(n.kind==='event-blocked')return !['closed','duplicate'].includes(s.stage);return n.kind==='approval'?s.stage==='awaiting_approval':n.kind==='result'?s.stage==='awaiting_confirmation':n.kind==='question'?s.stage==='clarifying'&&s.waitingForReporter:s.stage==='blocked';
}
async function approvalDeferred(env,c,n){if(n.kind!=='approval')return false;return !!await env.DB.prepare("SELECT key FROM documents WHERE namespace='xiaoye-intake-sessions' AND json_extract(value,'$.mode')='draft' AND json_extract(value,'$.until')>? AND json_extract(value,'$.actor.account')=? AND (? IS NULL OR json_extract(value,'$.source.botUserId')=?) LIMIT 1").bind(Date.now(),n.account,c.oaBotUserId||null,c.oaBotUserId||null).first();}
async function notifications(env,c,action,v){
 if(action==='claim'){
  const rows=(await env.DB.prepare("SELECT key,value,revision FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.state')!='sent' AND COALESCE(json_extract(value,'$.leaseUntil'),0)<=? AND COALESCE(json_extract(value,'$.nextAttempt'),0)<=? AND json_extract(value,'$.attempts')<5 AND NOT (json_extract(value,'$.kind')='approval' AND EXISTS(SELECT 1 FROM documents d WHERE d.namespace='xiaoye-intake-sessions' AND json_extract(d.value,'$.mode')='draft' AND json_extract(d.value,'$.until')>? AND json_extract(d.value,'$.actor.account')=json_extract(documents.value,'$.account') AND (? IS NULL OR json_extract(d.value,'$.source.botUserId')=?))) ORDER BY json_extract(value,'$.createdAt') LIMIT 10").bind(Date.now(),Date.now(),Date.now(),c.oaBotUserId||null,c.oaBotUserId||null).all()).results;
  for(const row of rows){let n=JSON.parse(row.value);const t=(await load(env.DB,n.taskId))?.task;if(!notificationCurrent(n,t)){n.state='cancelled';n.attempts=5;await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',row.key,row.revision).run();continue;}
   if(n.firstAttemptAt&&Date.now()-n.firstAttemptAt>23*3600000){n.state='unknown';n.attempts=5;n.error='通知確認期限已過，請人工核對原對話，避免重複發送。';await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',row.key,row.revision).run();continue;}if(n.kind==='approval'&&!n.attempts&&!n.firstAttemptAt){n.lineMessage=proposalCard(env.PUBLIC_ORIGIN,t);n.message=proposalText(t)+'\n'+link(env,t.id);}if(n.kind==='result'&&!n.attempts&&!n.firstAttemptAt){n.lineMessage=resultCard(env.PUBLIC_ORIGIN,t);n.message=resultText(t);}n={...n,firstAttemptAt:n.firstAttemptAt||Date.now(),lease:crypto.randomUUID(),leaseUntil:Date.now()+90000,attempts:n.attempts+1,state:'sending'};
   const r=await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',row.key,row.revision).run();if(r.meta.changes)return {ok:true,notification:n};
  }return {ok:true,notification:null};
 }
 const row=await record(env.DB,'xiaoye-notifications',v.id),n=row?.value;if(!n||n.lease!==v.lease||n.leaseUntil<=Date.now())throw fail('通知確認已失效。');
 if(action==='defer'){if(n.kind!=='approval')throw fail('此通知不支援延後。');n.state='pending';n.lease=null;n.leaseUntil=0;n.nextAttempt=0;n.attempts=Math.max(0,n.attempts-1);if(!n.attempts)delete n.firstAttemptAt;const r=await env.DB.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(n),'xiaoye-notifications',v.id,row.revision).run();if(!r.meta.changes)throw fail('通知狀態已更新。');return {ok:true,deferred:true};}
 if(action==='validate'){const t=(await load(env.DB,n.taskId))?.task;if(!notificationCurrent(n,t))throw fail('問題內容或狀態已更新，原通知停止。');return {ok:true,notification:n,deferred:await approvalDeferred(env,c,n)};}
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
export async function xiaoyeFetch(request,env,{base,readAuthority,authority,ctx,meetingPreview}){
 const url=new URL(request.url),path=url.pathname,machine=path.startsWith(machinePrefix),page=path==='/xiaoye',api=path.startsWith('/api/xiaoye/'),inspection=path==='/xiaoye/inspect'||path.startsWith('/api/xiaoye-inspection/');
 if(!machine&&!page&&!api&&!inspection)return null;
 try{
  if(machine){const installed=await install(request,env);if(installed)return installed;}
  const c=await settings(env);
  if(inspection)return await inspectionFetch(request,env,c,{record,load,membership,linePerson,currentPerson,base,approved:t=>approved(env,c,t,authority,base)});
  if(machine){
   const action=path.slice(machinePrefix.length),runnerMode=action.startsWith('runner/'),key=request.headers.get('Authorization')||'';
   if(runnerMode){if(await digest(key)!==c.runnerHash)throw fail('Unauthorized',401);}else if(!env.LEAF_TASK_SERVICE_KEY||await digest(key)!==await digest('Bearer '+env.LEAF_TASK_SERVICE_KEY))throw fail('Unauthorized',401);
   if(action==='health'&&request.method==='GET')return json({ok:true,contract:XIAOYE_CONTRACT,approvalRequired:true,enabled:true,eventDriven:!!env.XIAOYE_EVENTS});
   if(action==='runner/events/ws'&&request.method==='GET'){if(!env.XIAOYE_EVENTS)throw fail('事件服務尚未啟用。',503);return eventStub(env).fetch(new Request('https://secretary.internal/socket',{headers:{Upgrade:request.headers.get('Upgrade')||''}}));}
   if(request.method!=='POST')throw fail('Method not allowed',405);const v=await body(request);if(v.tenantKey!==env.LEAF_TASK_TENANT)throw fail('Tenant mismatch',403);
   if(action==='reporter')return json(await resultRequest(env,c,base,v,{record,load,linePerson,digest,fail,docsInsert,transaction}));
   if(action==='runner/event-inspect')return json(await inspectEvent(env,c,v));
   if(action==='runner/record-legacy-capability')return json(await recordLegacyCapability(env,c,v));
   if(action==='runner/record-deploy-reconciliation')return json(await recordDeployReconciliation(env,c,v));
   if(action==='runner/auto-resume')return json(await autoResume(env,c,v));
   if(action==='evidence-check')return json(await runner(env,c,base,authority,action,v));
   if(action==='owner')return json(await ownerRequest(env,c,base,v,{record,load,linePerson,membership,digest,fail,docsInsert,transaction,retireProposal,imageBytes,uuidFrom}));
   if(action==='intake')return json(await intake(env,c,base,v));
   if(action==='withdraw')return json(await withdraw(env,c,v));
   if(action==='sessions'){const rows=(await env.DB.prepare("SELECT key,json_extract(value,'$.until') AS until,json_extract(value,'$.mode') AS mode FROM documents WHERE namespace='xiaoye-intake-sessions' AND json_extract(value,'$.until')>? LIMIT 500").bind(Date.now()).all()).results;const ownerSessions=(await env.DB.prepare("SELECT key,json_extract(value,'$.until') AS until FROM documents WHERE namespace='xiaoye-owner-sessions' AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>? LIMIT 500").bind(Date.now()).all()).results;return json({ok:true,sessions:rows,ownerSessions});}
   if(action==='active'){const key=await digest(JSON.stringify([v.botUserId,v.type,v.conversationId,v.userId])),r=await record(env.DB,'xiaoye-intake-sessions',key);const active=!!r&&r.value.until>Date.now();const waiting=active?[]:await waitingCases(env,v);return json({ok:true,active:active||waiting.length>0,conversationalPending:active&&r.value.mode==='conversation-pending',waitingForReporter:waiting.length>0,needsCaseSelection:waiting.length>1});}
   if(runnerMode){const result=await runner(env,c,base,authority,action.slice(7),v,meetingPreview);return result instanceof Response?result:json(result);}
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
   return json({ok:true,csrf:a.csrf,owner:a.account===c.ownerAccount,autoResolutionEnabled:c.autoResolutionEnabled===true,viewerAccount:a.account,account:c.account,projects:c.projects,tasks:rows.map(t=>view(t,a.account,c)),journals,notifications:notices});
  }
  const match=path.match(/^\/api\/xiaoye\/issues\/(work-[0-9a-f-]{36})\/(approve|pause|confirm|reopen|supplement|feedback|resume)$/);if(!match||request.method!=='POST')throw fail('Not found',404);
  const v=await body(request,['supplement','feedback','reopen'].includes(match[2])?16*1024*1024:40000),old=await load(env.DB,match[1]);if(!old||!visible(old.task,a.account,c))throw fail('找不到問題。',404);const t=structuredClone(old.task),s=t.secretary,action=match[2],actor={account:a.account,name:a.profile?.name||a.user?.name||a.account,team:a.profile?.team||''};
  const previous=await replay(env,t.id,v.operationId,{...v,action},actor);if(previous)return json({ok:true,task:view(previous,a.account,c),replayed:true});
  if(v.version!==t.version)throw fail('問題已有更新，請重新檢查。');const extras=[];
  if(action==='approve'){
   if(await ownerDraftActive(env,t.id))throw fail('請先送出或取消LINE中正在填寫的建議，再核准方案。');
   if(a.account!==c.ownerAccount)throw fail('請由指定負責人核准。',403);if(s.sourceWithdrawn||!['awaiting_approval','approved','paused'].includes(s.stage)||!s.proposal||v.proposalHash!==s.proposal.hash||v.confirm!==true)throw fail('請先檢查目前有效來源與方案再核准。');await membership(env,c,t.primaryParentId);
   const token=/\bdailylog_session=([a-f0-9]{64})\b/.exec(request.headers.get('cookie')||'')?.[1];if(!token)throw fail('請使用本人登入核准。',403);
   s.approval={account:a.account,hash:s.proposal.hash,sourceVersion:s.sourceVersion,sessionHash:await digest(token),at:new Date().toISOString()};s.stage='approved';s.blocker='';t.status='pending';
  }else if(action==='feedback'){
   if(a.account!==c.ownerAccount)throw fail('請由指定負責人提供方案建議。',403);
   if(s.sourceWithdrawn||!s.proposal||v.proposalHash!==s.proposal.hash||!['awaiting_approval','approved','blocked','paused','executing'].includes(s.stage))throw fail('方案已有更新，請查看目前版本後再提供建議。');
   await membership(env,c,t.primaryParentId);
   const detail=text(v.detail||(v.image?'提供建議圖片':''),4000),entry={id:v.operationId,author:actor,at:new Date().toISOString(),proposalVersion:s.proposal.version,proposalHash:s.proposal.hash,text:detail,attachmentIds:[]};
   if(v.image){const image=imageBytes(v.image),id='att-'+uuidFrom(await digest(t.id+':'+v.operationId)),at=entry.at;entry.attachmentIds.push(id);extras.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'normal',t.id,image.name.replace('問題截圖','主管建議圖片'),image.mime,image.bytes.length,await digest(image.bytes),actor.account,actor.name,at));for(let p=0,n=0;p<image.bytes.length;p+=262144,n++)extras.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(id,n,image.bytes.slice(p,p+262144).buffer));}
   s.ownerFeedback=[...(s.ownerFeedback||[]),entry];retireProposal(s);s.sourceVersion++;s.revisionRequested=true;s.waitingForReporter=false;s.stage='clarifying';s.blocker='';t.status='pending';
  }else if(action==='resume'){
   if(a.account!==c.ownerAccount||v.confirm!==true)throw fail('請由指定負責人要求重新查核。',403);if(await ownerDraftActive(env,t.id))throw fail('請先送出或取消目前建議。');if(t.primaryParentId)await membership(env,c,t.primaryParentId);else for(const p of c.projects)await membership(env,c,p.id);restartAnalysis(t,retireProposal);
  }else if(action==='pause'){
   if(a.account!==c.ownerAccount)throw fail('請由指定負責人暫緩。',403);s.stage='paused';s.approval=null;s.autoAuthorization=null;s.lease=null;s.leaseUntil=0;t.status='blocked';
  }else if(action==='confirm'){
   if(!s.reporters.some(p=>p.account===a.account)||s.stage!=='awaiting_confirmation'||v.confirm!==true)throw fail('請由原回報人確認目前的處理結果。',403);s.stage='closed';s.confirmedAt=new Date().toISOString();t.status='done';t.completedAt=s.confirmedAt;
  }else{
   const reopening=action==='reopen';
   if(!s.reporters.some(p=>p.account===a.account))throw fail('請由原回報人補充。',403);
   if(reopening&&!['closed','awaiting_confirmation','paused','blocked'].includes(s.stage)||!reopening&&['closed','duplicate'].includes(s.stage))throw fail('案件已有更新，請重新讀取目前狀態。');
   if(v.images!==undefined&&!Array.isArray(v.images))throw fail('圖片格式錯誤。',400);
   const inputImages=[...(v.images||[]),...(v.image?[v.image]:[])];if(inputImages.length>10)throw fail('最多10張圖片、合計10MB。',413);
   const images=inputImages.map(imageBytes);if(images.reduce((n,i)=>n+i.bytes.length,0)>10*1024*1024)throw fail('最多10張圖片、合計10MB。',413);
   const detail=text(v.detail||(images.length?(reopening?'仍有問題，補充圖片':'補充圖片'):''),4000),at=new Date().toISOString();
   const source={type:'web',account:a.account,eventId:v.operationId,at,text:detail,attachmentIds:[]};
   for(const [index,image]of images.entries()){const id='att-'+uuidFrom(await digest(t.id+':'+v.operationId+':'+index));source.attachmentIds.push(id);extras.push(env.DB.prepare('INSERT INTO task_attachments(id,scope,target_id,name,mime,size,digest,actor,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'normal',t.id,image.name,image.mime,image.bytes.length,await digest(image.bytes),actor.account,actor.name,at));for(let p=0,n=0;p<image.bytes.length;p+=262144,n++)extras.push(env.DB.prepare('INSERT INTO task_attachment_chunks(attachment_id,part,content) VALUES(?,?,?)').bind(id,n,image.bytes.slice(p,p+262144).buffer));}
   t.description+='\n\n'+(reopening?'仍有問題：':'同仁補充：')+detail;s.sources.push(source);s.sourceVersion++;s.sourceWithdrawn=false;retireResult(s);retireProposal(s);s.waitingForReporter=false;s.stage='clarifying';s.blocker='';t.status='pending';t.completedAt=null;
  }
  await a.verify();const saved=await transaction(env,old,t,v.operationId,{...v,action},actor,action==='resume'?'本人要求沿原卡重新查核；原執行資格停止，新方案仍須本人核准。':action==='feedback'?'收到主管對第 '+entryVersion(s)+' 版的建議，舊核准失效，等待整理新版。':action==='approve'?'本人已核准目前方案。':action==='pause'?'本人暫緩處理。':action==='confirm'?'原回報人確認問題已解決。':action==='supplement'?'收到原回報人的補充，接續原卡釐清。':'原回報人表示仍有問題，重新釐清。',extras,action==='approve'?noOwnerDraftSql:'1',action==='approve'?[t.id,Date.now()]:[]);
  return json({ok:true,task:view(saved,a.account,c)});
 }catch(e){if(page&&e.status===401){url.searchParams.delete('openExternalBrowser');url.searchParams.delete('openInAppBrowser');return Response.redirect(new URL('/login?returnTo='+encodeURIComponent(url.pathname+url.search),env.PUBLIC_ORIGIN).href,303);}return json({ok:false,...e.code?{code:e.code}:{},error:e.status?e.message:'葉小蝸服務暫時無法完成，請稍後重試。'},e.status||503);}
}
export async function xiaoyeGuard(request,env,readAuthority){
 const path=new URL(request.url).pathname,task=path.match(/^\/api\/tasks\/(work-[0-9a-f-]{36})(?:\/|$)/),attachment=path.match(/^\/api\/attachments\/normal\/(work-[0-9a-f-]{36})(?:\/|$)/);
 if(!task&&!attachment)return null;const t=(await load(env.DB,(task||attachment)[1]))?.task;if(!t?.secretary){if(task&&request.method==='POST'){const b=await request.clone().json().catch(()=>({}));if((b.collaboratorAccounts||[]).includes(AI)){const c=await settings(env);if(!c.projects.some(p=>p.id===t?.id))return json({error:'葉小蝸試行帳號目前只參與已指定的四個專案。'},409);}}return null;}const c=await settings(env),a=await readAuthority(request,env);if(!a||!visible(t,a.account,c))return json({error:'找不到問題。'},404);await a.verify();
 if(attachment&&request.method!=='GET')return json({error:'補圖請在原 LINE 回報期間傳送，或先從原問題頁補充說明。'},409);if(task&&request.method!=='GET')return json({error:'請從葉小蝸問題頁核准、確認或重新開啟，原任務保留。',url:link(env,t.id)},409);return null;
}
export async function xiaoyeResponse(request,response,env,readAuthority){
 const url=new URL(request.url),path=url.pathname,returnTo=url.searchParams.get('returnTo'),safeReturn=typeof returnTo==='string'&&/^\/xiaoye(?:\?issue=work-[a-f0-9-]{36}(?:&review=[a-f0-9]{64}&action=(?:approve|feedback))?)?$/.test(returnTo);
 if(['/login','/login.html'].includes(path)&&safeReturn&&[301,302,303,307,308].includes(response.status)){const dest=new URL(response.headers.get('Location')||'/',env.PUBLIC_ORIGIN);if(dest.origin===env.PUBLIC_ORIGIN&&dest.pathname==='/'){const headers=new Headers(response.headers);headers.set('Location',returnTo);return new Response(response.body,{status:response.status,headers});}}
 if(response.status!==200)return response;
 if(['/login','/login.html'].includes(path)&&safeReturn&&response.headers.get('Content-Type')?.includes('text/html')){const html=await response.text(),headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(html.replace(/(src=["'])(\/login\.js(?:\?[^"']*)?)(["'])/g,(_,a,b,c)=>a+b+(b.includes('?')?'&':'?')+'xiaoye=v1'+c),{status:200,headers});}
 if(path==='/login.js'){let source=await response.text();const modern='const returnTo=requestedReturn&&',legacy='const workTarget=';if(source.split(modern).length===2)source=source.replace(modern,"const returnTo=/^\\/xiaoye(?:\\?issue=work-[a-f0-9-]{36}(?:&review=[a-f0-9]{64}&action=(?:approve|feedback))?)?$/.test(requestedReturn||'')?requestedReturn:requestedReturn&&");else if(source.split(legacy).length===2)source=source.replace(legacy,"const xiaoyeReturn=new URLSearchParams(location.search).get('returnTo');const workTarget=/^\\/xiaoye(?:\\?issue=work-[a-f0-9-]{36}(?:&review=[a-f0-9]{64}&action=(?:approve|feedback))?)?$/.test(xiaoyeReturn||'')?xiaoyeReturn:");const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(source,{status:200,headers});}
 if(['/', '/index.html'].includes(path)&&response.headers.get('Content-Type')?.includes('text/html')){const content=await response.text();const entry='<a href="/xiaoye" style="display:block;padding:14px;border-radius:9px;text-decoration:none">我回報的問題・葉小蝸</a>';let changed=false;const html=content.replace(/(<nav\b[^>]*id=["'](?:managerNav|employeeNav)["'][^>]*>)([\s\S]*?)(<\/nav>)/g,(_,a,b,z)=>{changed=true;return a+b+entry+z;});return new Response(changed?html:content.replace('</body>',entry+'</body>'),{status:response.status,headers:response.headers});}
 if(!path.startsWith('/api/tasks')||!response.headers.get('Content-Type')?.includes('application/json'))return response;
 let c;try{c=await settings(env);}catch{return response;}const a=await readAuthority(request,env);if(!a)return response;
 const data=await response.json(),filter=v=>Array.isArray(v)?v.filter(x=>!x?.secretary||visible(x,a.account,c)).map(filter):v&&typeof v==='object'?Object.fromEntries(Object.entries(v.secretary?view(v,a.account,c):v).map(([k,x])=>[k,filter(x)])):v;
 const result=filter(data);if(path==='/api/tasks/people'&&Array.isArray(result.people)&&!result.people.some(p=>p.account===AI))result.people.push({account:AI,name:c.account.name,team:'AI 秘書',type:'ai'});
 return json(result);
}
export async function xiaoyeEnvironment(env){try{const c=await settings(env);return {...env,XIAOYE_SERVICE_PERSON:JSON.stringify({account:AI,name:c.account.name,team:'AI 秘書',type:'ai'})};}catch{return env;}}

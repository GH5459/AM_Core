import {CASE_EVIDENCE_CONTRACT,CASE_EVIDENCE_PATH,evidenceDigest,evidenceSignature,meetingReference} from './xiaoye-evidence-protocol.mjs';
const fail=(message,status=403)=>Object.assign(Error(message),{status});
const ns='xiaoye-meeting-evidence-grants';
export const findingFields=['cause','impact','nextStep','progress'];
export function plainFinding(value){
 if(!value||!['confirmed','suspected'].includes(value.certainty))throw fail('請區分已證實的原因與待確認的推測。',400);
 const result={certainty:value.certainty};for(const field of findingFields){const text=value[field];if(typeof text!=='string'||!text.trim()||text.length>700)throw fail('請用簡短文字說明原因、影響、下一步與目前進度。',400);if(/原服務提供|唯讀派發證據|失效守衛|lease|binding|原卡重新審核/i.test(text))throw fail('請改用一般同仁能理解的文字，並說明由誰接續處理。',400);result[field]=text.trim();}return result;
}
export async function prepareMeetingEvidence(env,c,task,context,{check,record,preview}={}){
 const reference=meetingReference(task);if(!reference)return {available:false,reason:'這份回報沒有可核對的原會議連結。',nextStep:'請回報人補上該場會議的連結，葉小蝸會接續原案件查核。'};
 if(!env.AMCORE_MEETING_MANAGEMENT_SECRET)return {available:false,reason:'葉小蝸還讀不到這場會議的派發結果。',nextStep:'由系統維護人員補好本案的查核連線；你不需要重新回報。'};
 let origin;try{const url=new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com');if(url.protocol!=='https:'||!['am.hozorental.com','am-platform-2ymf.onrender.com'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();origin=url.origin;}catch{throw fail('這場會議的查核連線設定需要由維護人員修正。',503);}
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),grant=await evidenceDigest(token);
 const value={...context,meetingId:reference.id,accountId:c.account.id,credentialHash:c.runnerHash,until:Date.now()+120000};
 await env.DB.prepare('INSERT INTO documents(namespace,key,value,revision) VALUES(?,?,?,1)').bind(ns,grant,JSON.stringify(value)).run();
 const body=JSON.stringify({contract:CASE_EVIDENCE_CONTRACT,tenantKey:env.LEAF_TASK_TENANT,grant:token,meetingId:reference.id,caseId:task.id,caseVersion:task.version}),time=String(Date.now());
 await check();
 const response=await fetch(origin+CASE_EVIDENCE_PATH,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','x-xiaoye-case-time':time,'x-xiaoye-case-signature':await evidenceSignature(env.AMCORE_MEETING_MANAGEMENT_SECRET,time,body)},body,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw fail(response.status===403?'本案目前沒有閱讀這場會議的資格，請由會議主持人確認分享範圍。':'這場會議的查核連線暫時無法使用；請由系統維護人員檢查，原案件保留。',response.status===403?403:503);
 const data=await response.json();await check();
 if(data.contract!==CASE_EVIDENCE_CONTRACT||data.caseId!==task.id||data.meetingId!==reference.id||!Array.isArray(data.items)||data.items.length>60)throw fail('會議查核結果與本案不一致，請由系統維護人員檢查。',503);
 const tasks=(await env.DB.prepare("SELECT id,value FROM work_items WHERE json_extract(value,'$.meetingSource.workspaceId')=?").bind(reference.id).all()).results.map(r=>{const t=JSON.parse(r.value);return {id:t.id,todoId:t.meetingSource.todoId,status:t.status,startDate:t.startDate,dueDate:t.dueDate};});
 const diagnosis=data.previewPayload&&preview?await preview(data.previewPayload):null;
 delete data.previewPayload;
 const evidence={...data,available:true,readOnly:true,checkedAt:new Date().toISOString(),existingTasks:tasks,diagnosis};
 evidence.digest=await evidenceDigest(JSON.stringify(evidence));
 await check();
 await env.DB.prepare('INSERT OR IGNORE INTO documents(namespace,key,value,revision) VALUES(?,?,?,1)').bind('xiaoye-case-evidence',evidence.digest,JSON.stringify({caseId:task.id,caseVersion:task.version,sourceVersion:task.secretary.sourceVersion,eventId:context.eventId||null,ownerInspectionGrant:context.ownerInspectionGrant||null,evidence})).run();
 return evidence;
}
export async function verifyMeetingGrant(env,c,input,h,check){
 if(input.contract!==CASE_EVIDENCE_CONTRACT||!/^[a-f0-9]{64}$/.test(input.grant||''))throw fail('查核資格無效。');
 const context=(await h.record(env.DB,ns,await evidenceDigest(input.grant)))?.value;
 if(!context||context.id!==input.caseId||context.version!==input.caseVersion||context.meetingId!==input.meetingId||context.until<=Date.now()||context.accountId!==c.account.id||context.credentialHash!==c.runnerHash)throw fail('本案查核資格已變更或到期。');
 const {task}=await check(context);if(meetingReference(task)?.id!==input.meetingId)throw fail('原會議連結已變更。');
 return {ok:true,caseId:task.id,caseVersion:task.version,meetingId:input.meetingId,reporterIds:[...new Set(task.secretary.reporters.map(p=>p.source?.userId).filter(id=>/^U[a-f0-9]{32}$/i.test(id||'')))]};
}
// Uses the currently deployed meeting receiver and task core, with only a local
// in-memory DB. No production write, queue, notification or network is reachable.
export async function previewMeetingDelivery(payload,core,publishAssignments,origin){
 const people=[...new Map([payload.host,...payload.tasks.map(t=>t.owner)].map(p=>[p.account,{account:p.account,name:p.name||p.account}])).values()];
 const DB={prepare(sql){return {bind(){return {first:async()=>null};}};},batch:async()=>{throw Object.assign(Error('preview-complete'),{previewComplete:true});}};
 try{await publishAssignments(payload,{DB,LEAF_TASK_TENANT:payload.host.tenantKey,PUBLIC_ORIGIN:origin},{now:Date.now,directory:async()=>({people}),permission:()=>true,core,publish(){throw Error('Preview must not publish.');}});return {state:'passed',writes:0};}
 catch(error){if(error.previewComplete)return {state:'passed',writes:0};const date=error.message==='截止日不能早於執行日期。',today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);return {state:'failed',code:date?'START_AFTER_DUE':'VALIDATION_FAILED',message:date?error.message:'任務資料未通過建立檢查。',items:date?payload.tasks.filter(t=>t.due<today).map(t=>({todoId:t.id,sourceDate:payload.date,defaultStartDate:today,dueDate:t.due})):[],writes:0};}
}

import {CASE_EVIDENCE_CONTRACT,CASE_EVIDENCE_PATH,verifyEvidenceSignature} from '../../core/xiaoye-evidence-protocol.mjs';
import {todos} from './workspace-model.js';
export function createMeetingCaseEvidence({pool,store,platform,env,conversation,assertRead,now=Date.now}){
 const fail=(text,status=403)=>Object.assign(Error(text),{status});
 return async function handle(req,res,url){
  if(url.pathname!==CASE_EVIDENCE_PATH)return false;
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(req.method!=='POST')throw fail('不支援此查核方式。',405);
   let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>4096)throw fail('查核內容過長。',413);}
   // Same original management connection as conversation-service and multilingual.
   // Existing deployments may keep it under the owner API setting name.
   const secret=env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY;
   if(!secret||secret.length<32)throw fail('會議查核尚未接上原管理連線，請由維護人員檢查設定。',503);
   if(!await verifyEvidenceSignature(secret,req.headers['x-xiaoye-case-time'],body,req.headers['x-xiaoye-case-signature'],now()))throw fail('查核來源無效。');
   let input;try{input=JSON.parse(body);}catch{throw fail('查核格式錯誤。',400);}
   if(input.contract!==CASE_EVIDENCE_CONTRACT||!/^work-[a-f0-9-]{36}$/.test(input.caseId||'')||!/^[a-f0-9]{64}$/.test(input.meetingId||'')||!Number.isSafeInteger(input.caseVersion))throw fail('查核案件無效。');
   const verify=async()=>{const result=await platform.secretaryEvidenceCheck?.(input);if(!result?.ok||result.caseId!==input.caseId||result.caseVersion!==input.caseVersion||result.meetingId!==input.meetingId)throw fail('原案件查核已停止或變更。');return result;};
   const checked=await verify(),r=await store.get(input.meetingId);if(!r||r.state!=='published')throw fail('找不到本案已發布的會議。',404);
   const row=await conversation(r);if(row.enabled===false||['left','blocked'].includes(row.connection_state))throw fail('這場會議目前無法查核。');
   let readable=false;for(const id of checked.reporterIds||[]){try{await assertRead(r,row,id);readable=true;break;}catch{}}
   if(!readable)throw fail('原回報人目前沒有閱讀這場會議的資格。');
   const q=(await pool.query('SELECT * FROM central_archive.meeting_task_dispatches WHERE workspace_id=$1',[r.id])).rows[0];
   const identities=new Map();for(const id of new Set([r.host_id,...todos(r.fields).map(t=>t.ownerId).filter(Boolean)])){try{identities.set(id,await platform.meetingTaskIdentity?.(id));}catch{identities.set(id,null);}}
   const items=todos(r.fields).map(t=>({id:t.id,content:t.content,dueDate:t.due||null,ownerName:t.ownerId?(identities.get(t.ownerId)?.name||r.receipt?.ownerNames?.[t.ownerId]||'已指定同仁'):null,ownerSelected:!!t.ownerId,workConnectionReady:t.ownerId?!!identities.get(t.ownerId):null,state:!t.ownerId?'unassigned':JSON.stringify(q?.applied_fields?.[t.id])===JSON.stringify(r.fields[t.id])?'delivered':'pending'}));
   const current=await store.get(r.id);if(Number(current.revision)!==Number(r.revision))throw fail('會議已更新，請重新查核。',409);
   await verify();res.statusCode=200;res.end(JSON.stringify({contract:CASE_EVIDENCE_CONTRACT,caseId:input.caseId,meetingId:r.id,meetingRevision:Number(r.revision),meetingDate:r.fields.settings.date,hostReady:!!identities.get(r.host_id),items,delivery:{pending:items.filter(t=>t.state==='pending').length,delivered:items.filter(t=>t.state==='delivered').length,unassigned:items.filter(t=>t.state==='unassigned').length,message:q?.error_code||'',lastCheckedAt:q?.updated_at||null,lastFailure:q?.result?.lastFailure||null},previewPayload:q?.payload||null}));
  }catch(error){res.statusCode=error.status||503;res.end(JSON.stringify({ok:false,error:error.status?error.message:'本案會議查核暫時無法使用。'}));}
  return true;
 };
}

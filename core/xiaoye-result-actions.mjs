import {resultCommand} from './xiaoye-result-card.mjs';
import {sameResultVersion} from './xiaoye-case-evidence.mjs';
export async function resultRequest(env,c,base,v,h){
 const {linePerson,record,load,digest,docsInsert,transaction,fail}=h,source=v.source,command=resultCommand(source?.postbackData);
 if(!command||source?.eventType!=='postback'||source.type!=='user'||source.userId!==source.conversationId||source.botUserId!==c.oaBotUserId||source.userId!==v.sender?.userId||source.botUserId!==v.sender?.botUserId)throw fail('請在原葉小蝸私訊確認自己的案件。',403);
 if(typeof source.eventId!=='string'||!source.eventId||source.eventId.length>180||!Number.isSafeInteger(source.timestamp)||source.timestamp>Date.now()+60000||Date.now()-source.timestamp>10*60000)throw fail('這次操作已過期，請重新開啟案件。',403);
 const actor=await linePerson(env,base,v.sender),op='line-result:'+await digest(source.botUserId+':'+source.eventId),fingerprint=await digest(JSON.stringify(v));
 const old=await load(env.DB,command.taskId),t=old&&structuredClone(old.task),s=t?.secretary;
 if(!s||t.deletedAt||t.mergedInto||s.sourceWithdrawn||!s.reporters.some(p=>p.account===actor.account))throw fail('請由原回報人確認自己的案件。',403);
 const reporter=s.reporters.find(p=>p.account===actor.account);if(reporter.source?.type==='user'&&(reporter.source.userId!==source.userId||reporter.source.botUserId!==source.botUserId))throw fail('原回報來源已變更，請從案件頁查核。',403);
 if(command.reopen||command.followup){
  const valid=command.reopen?sameResultVersion(t,command.version)&&s.stage==='awaiting_confirmation'&&!!s.result:t.version===command.version&&s.stage==='clarifying'&&!!s.waitingForReporter;
  if(!valid)throw fail('案件已有更新，請從最新通知或案件頁確認。');
  const key=await digest(JSON.stringify([source.botUserId,'user',source.userId,source.userId]));
  const current=await record(env.DB,'xiaoye-intake-sessions',key),owner=await record(env.DB,'xiaoye-owner-sessions',key);
  if(current?.value.until>Date.now()&&current.value.mode==='draft')throw fail('請先完成目前的回報，再接續這件問題。');
  if(owner?.value.mode==='feedback'&&owner.value.until>Date.now())throw fail('請先完成目前的建議，再接續這件問題。');
  const event='reopen:'+await digest(source.botUserId+':'+source.eventId),prior=await record(env.DB,'xiaoye-reopen-events',event);
  if(prior){if(prior.value.taskId!==t.id||current?.value.taskId!==t.id||current.value.until<=Date.now())throw fail('案件已有更新，請查看目前狀態。');return {ok:true,handled:true,resume:true,taskId:t.id,until:current.value.until,replayed:true};}
  const until=Date.now()+24*3600000,session={mode:'followup',taskId:t.id,until};
  const sessionGuard=current?'EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=?)';
  const guard="EXISTS(SELECT 1 FROM work_items WHERE id=? AND revision=?) AND "+sessionGuard+" AND NOT EXISTS(SELECT 1 FROM documents WHERE namespace='xiaoye-owner-sessions' AND key=? AND json_extract(value,'$.mode')='feedback' AND json_extract(value,'$.until')>?)";
  try{await env.DB.batch([env.DB.prepare('INSERT INTO xiaoye_draft_operations(id,guard) VALUES(?,CASE WHEN '+guard+' THEN 1 ELSE 0 END)').bind(event,t.id,old.revision,'xiaoye-intake-sessions',key,...(current?[current.revision]:[]),key,Date.now()),docsInsert(env.DB,'xiaoye-intake-sessions',key,session),docsInsert(env.DB,'xiaoye-reopen-events',event,{taskId:t.id})]);}catch{throw fail('目前回報已有更新，請重新操作。');}
  return {ok:true,handled:true,resume:true,taskId:t.id,until};
 }
 const prior=await record(env.DB,'xiaoye-result-events',op);
 if(prior){if(prior.value.fingerprint!==fingerprint||prior.value.account!==actor.account)throw fail('這次操作與原紀錄不符。');if(s.stage!=='closed'||t.version!==(prior.value.completedVersion||command.version+1))throw fail('案件已有更新，請查看目前狀態。');return {...prior.value.result,replayed:true};}
 if(!sameResultVersion(t,command.version)||s.stage!=='awaiting_confirmation'||!s.result)throw fail('案件已有更新，請從最新完成通知或案件頁確認。');
 s.stage='closed';s.confirmedAt=new Date().toISOString();t.status='done';t.completedAt=s.confirmedAt;
 const result={ok:true,handled:true,confirmed:true};
 await linePerson(env,base,v.sender);
 await transaction(env,old,t,op,{action:'confirm',source,version:command.version},actor,'原回報人在LINE確認問題已解決。',[docsInsert(env.DB,'xiaoye-result-events',op,{account:actor.account,fingerprint,taskId:t.id,version:command.version,completedVersion:t.version+1,result})]);
 return result;
}

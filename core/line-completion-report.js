import crypto from 'node:crypto';
export const COMPLETION_REPORT_POLICY='line-completion-confirm-original-group-v1';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>=32&&x.length===y.length&&crypto.timingSafeEqual(x,y);};
export function createCompletionReporter({tenants,config,call,identity,line}){
 async function source(t,c,ctx){
  if(!/^C[0-9a-f]{32}$/i.test(ctx.groupId||'')||!/^U[0-9a-f]{32}$/i.test(ctx.requester?.userId||''))throw fail('原 LINE 群組來源無法確認。');
  const p=await identity(ctx.requester.userId,t,ctx.groupId,{readOnly:true},c);
  if(!p||p.account!==ctx.requester.account||p.bindingId!==ctx.requester.bindingId)throw fail('原交辦人的群組或帳號綁定已改變。');
  const group=await line.lineGet('/v2/bot/group/'+ctx.groupId+'/summary',{timeoutMs:5000});
  if(group.groupId!==ctx.groupId||!group.groupName)throw fail('原群組暫時無法確認。');
  return {requesterName:p.name||p.account,groupName:String(group.groupName).slice(0,200)};
 }
 return async function completionReport(input,bearer){
  const t=tenants.find(t=>t.runtimeEnabled!==false&&t.key===input.tenantKey),c=t&&await config(t);
  if(!c||!equal(bearer,c.key))throw fail('Unauthorized',401);
  if(input.action==='health')return {ok:true,policy:COMPLETION_REPORT_POLICY,automaticSend:false};
  if(input.action==='preview'){
   const v=await call(t,c,'completion-context',{taskId:input.taskId});
   return {ok:true,...await source(t,c,v.context)};
  }
  if(input.action!=='send'||!/^[a-f0-9]{64}$/.test(input.id||''))throw fail('回報格式錯誤。',400);
  const claim=await call(t,c,'completion-claim',{id:input.id});if(claim.sent)return {ok:true,report:claim.report};
  const ctx=claim.context;let pushing=false;
  const receipt=(state,value={})=>call(t,c,'completion-receipt',{id:ctx.id,lease:ctx.lease,state,...value});
  try{
   await source(t,c,ctx);
   const text=ctx.completionActor.name+' 已完成任務：'+ctx.title+'\n\n完成結果：\n'+ctx.result+'\n\n原任務卡：\n'+ctx.url;
   if(text.length>16000)throw fail('完成結果太長，請先整理結果再確認回報。');
   const chunks=[];let chunk='';for(const ch of text){if(chunk.length+ch.length>4500){chunks.push({type:'text',text:chunk});chunk='';}chunk+=ch;}if(chunk)chunks.push({type:'text',text:chunk});
   await call(t,c,'completion-validate',{id:ctx.id,lease:ctx.lease});
   pushing=true;
   const sent=await line.pushLineMessage(ctx.groupId,{type:'textV2',text:'{requester}\n任務完成回報',substitution:{requester:{type:'mention',mentionee:{type:'user',userId:ctx.requester.userId}}}},null,{retryKey:ctx.retryKey,suppressEvidenceLogs:true,timeoutMs:8000,additionalMessages:chunks});
   if(!sent?.ok)throw fail('回報尚未確認。',503);
   return {ok:true,report:(await receipt('sent',{requestId:sent.acceptedRequestId||sent.requestId||''})).report};
  }catch(e){
   await receipt(pushing&&!e.lineStatus?'unknown':'failed').catch(()=>{});
   throw fail(e.status?e.message:'回報尚未確認，請稍後重試原回報。',e.status||503);
  }
 };
}

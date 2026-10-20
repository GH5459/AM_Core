import crypto from 'node:crypto';
export const PERSONAL_COMPLETION_POLICY='line-completion-confirm-selected-person-v1';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>=32&&x.length===y.length&&crypto.timingSafeEqual(x,y);};
export function createPersonalCompletionReporter({tenants,config,call,recipient,line}){
 async function target(t,ctx){
  const p=await recipient({tenantKey:t.key,account:ctx.recipient?.account});
  if(!p||!/^U[a-f0-9]{32}$/i.test(p.userId||'')||p.account!==ctx.recipient?.account)throw fail('這位同仁目前無法確認 LINE 身分，請選擇其他同仁。');
  if(ctx.recipient.userId&&ctx.recipient.userId!==p.userId)throw fail('收件人的 LINE 身分已變更，原回報停止。');
  return {account:p.account,userId:p.userId,name:p.name||p.account};
 }
 return async function personalReport(input,bearer){
  const t=tenants.find(t=>t.runtimeEnabled!==false&&t.key===input.tenantKey),c=t&&await config(t);
  if(!c||!equal(bearer,c.key))throw fail('Unauthorized',401);
  if(input.action==='health')return {ok:true,policy:PERSONAL_COMPLETION_POLICY,automaticSend:false};
  if(input.action==='directory')return call(t,c,'meeting-sharing-directory',{account:input.account});
  if(input.action==='preview'){
   const v=await call(t,c,'personal-completion-context',{taskId:input.taskId,recipientAccount:input.recipientAccount});
   return {ok:true,recipient:await target(t,v.context)};
  }
  if(input.action!=='send'||!/^[a-f0-9]{64}$/.test(input.id||''))throw fail('回報格式錯誤。',400);
  const claim=await call(t,c,'personal-completion-claim',{id:input.id});if(claim.sent)return {ok:true,report:claim.report};
  const ctx=claim.context;let pushing=false;
  const receipt=(state,value={})=>call(t,c,'personal-completion-receipt',{id:ctx.id,lease:ctx.lease,state,...value});
  try{
   const p=await target(t,ctx);
   const text='任務完成回報\n'+ctx.completionActor.name+' 已完成任務：'+ctx.title+'\n\n完成結果：\n'+ctx.result+'\n\n原任務卡：\n'+ctx.url;
   if(text.length>16000)throw fail('完成結果太長，請先整理結果再確認回報。');
   const chunks=[];let chunk='';for(const ch of text){if(chunk.length+ch.length>4500){chunks.push({type:'text',text:chunk});chunk='';}chunk+=ch;}if(chunk)chunks.push({type:'text',text:chunk});
   await call(t,c,'personal-completion-validate',{id:ctx.id,lease:ctx.lease});
   const current=await target(t,ctx);if(current.userId!==p.userId)throw fail('收件人的 LINE 身分已變更，原回報停止。');
   pushing=true;
   const sent=await line.pushLineMessage(p.userId,chunks[0],null,{retryKey:ctx.retryKey,suppressEvidenceLogs:true,timeoutMs:8000,additionalMessages:chunks.slice(1)});
   if(!sent?.ok)throw fail('回報尚未確認。',503);
   return {ok:true,report:(await receipt('sent',{requestId:sent.acceptedRequestId||sent.requestId||''})).report};
  }catch(e){await receipt(pushing&&!e.lineStatus?'unknown':'failed').catch(()=>{});throw fail(e.status?e.message:'回報尚未確認，請稍後重試原回報。',e.status||503);}
 };
}

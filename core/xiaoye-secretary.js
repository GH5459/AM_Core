import crypto from 'node:crypto';
export const XIAOYE_CONTRACT='xiaoye-secretary-pilot-v1';
export function secretaryCommand(event){
 if(event?.type!=='message'||event.message?.type!=='text')return null;
 const mentions=event.message.mention?.mentionees||[];if(mentions.some(m=>m.type==='all'||m.type==='user'&&!m.isSelf))return null;
 let value=event.message.text;for(const m of mentions.filter(m=>m.isSelf).toSorted((a,b)=>b.index-a.index))value=value.slice(0,m.index)+value.slice(m.index+m.length);
 value=value.trim().replace(/^小葉[，,:：\s]*/u,'');const start=value.match(/^回報問題(?:[：:\s]+([\s\S]*))?$/u);
 const resume=value.match(/^接續回報\s+(work-[a-f0-9-]{36})$/i);if(resume)return {resumeTaskId:resume[1]};
 if(start)return {start:true,text:start[1]?.trim()||''};if(value==='結束回報')return {end:true};if(value==='小葉'||event.message.text.trim()==='小葉')return {help:true};return null;
}
export function createXiaoyeSecretary({tasks,line,env=process.env,logger=console}){
 let running=false,enabled=false,sessions=new Map(),sessionMutation=0;const botUserId=env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID;
 const call=(route,input={})=>tasks.secretaryCall(route,input);
 const sessionKey=s=>crypto.createHash('sha256').update(JSON.stringify([s.botUserId,s.type,s.conversationId,s.userId])).digest('hex');
 async function restore(){const version=sessionMutation;try{const r=await call('sessions');enabled=true;if(version===sessionMutation)sessions=new Map((r.sessions||[]).map(s=>[s.key,s.until]));}catch(e){if(e.code==='SECRETARY_DISABLED'){enabled=false;sessions.clear();}}}
 async function capture(events){const consumed=[];
  for(const e of events){if(e.type==='unsend'&&enabled&&['user','group'].includes(e.source?.type)&&e.unsend?.messageId){try{await call('withdraw',{messageId:String(e.unsend.messageId),source:{botUserId,type:e.source.type,conversationId:e.source.type==='group'?e.source.groupId:e.source.userId,eventId:String(e.webhookEventId||'unsend:'+e.unsend.messageId)}});}catch(error){if(error.code!=='SECRETARY_DISABLED')throw error;}continue;}if(e.type!=='message'||!['text','image'].includes(e.message?.type)||!['user','group'].includes(e.source?.type)||!/^U[a-f0-9]{32}$/i.test(e.source.userId||''))continue;
   const command=secretaryCommand(e);if(e.message.mention?.mentionees?.some(m=>m.type==='all'||m.type==='user'&&!m.isSelf))continue;
   const source={botUserId,type:e.source.type,conversationId:e.source.type==='group'?e.source.groupId:e.source.userId,userId:e.source.userId,eventId:String(e.webhookEventId||e.message.id),messageId:String(e.message.id),timestamp:e.timestamp};
   const key=sessionKey(source);if(!command&&!(sessions.get(key)>Date.now()))continue;
   const who=await tasks.meetingShareIdentity(e.source.userId);if(!who)continue;
   if(e.source.type==='group'){const tenant=(await tasks.groupServices()).find(t=>t.key===who.tenantKey);if(!tenant||!(await tasks.resolveTaskGroupIdentity(e.source.userId,tenant,e.source.groupId)))continue;}
   if(command?.help){if(e.replyToken)await line.replyLineMessage(e.replyToken,'我是小葉 AI 秘書。請輸入「回報問題：你的問題」，再補充截圖；「結束回報」結束這段補充。方案由負責人核准後才執行。').catch(()=>{});consumed.push(e);continue;}
   if(command?.start&&!command.text){if(e.replyToken)await line.replyLineMessage(e.replyToken,'請在「回報問題：」後簡單說明遇到的情況，再傳截圖；有問題內容後才建立工作卡。').catch(()=>{});consumed.push(e);continue;}
   let image;if(e.message.type==='image'){const raw=await line.downloadLineContent(e.message.id,{tries:1});if(raw.buffer.byteLength>10*1024*1024)throw Error('xiaoye_image_too_large');image={base64:Buffer.from(raw.buffer).toString('base64')};}
   let value;try{value=await call('intake',{...command,source,sender:{...who,userId:e.source.userId,botUserId},text:command?.start?command.text:e.message.type==='text'?e.message.text:'',...(image?{image}:{})});}catch(error){if(error.status===403){consumed.push(e);continue;}throw error;}
   enabled=true;
   sessionMutation++;if(command?.end||!value.handled)sessions.delete(key);else sessions.set(key,Date.now()+15*60000);if(value.handled||command?.end)consumed.push(e);
  }return consumed;
 }
 async function drain(){if(running)return;running=true;try{await restore();for(let i=0;i<3;i++){
  const result=await call('notifications/claim'),n=result.notification;if(!n)break;let state='failed',requestId='',error='';
  try{const available=await tasks.groupServices();if(available.length!==1)throw Error('service_changed');const recipient=await tasks.meetingShareRecipient({tenantKey:available[0].key,account:n.account});if(!recipient||n.expectedUserId&&recipient.userId!==n.expectedUserId)throw Error('recipient_changed');await call('notifications/validate',{id:n.id,lease:n.lease});const sent=await line.pushLineMessage(recipient.userId,{type:'text',text:n.message.slice(0,4900)},null,{retryKey:'xiaoye:'+n.id,suppressEvidenceLogs:true});state='sent';requestId=sent.acceptedRequestId||sent.requestId||'';}
  catch(e){state=e.lineStatus&&e.lineStatus<500?'failed':'unknown';error='LINE 通知尚未確認，原問題與結果保留。';}
  await call('notifications/receipt',{id:n.id,lease:n.lease,state,requestId,error});
 }}catch{logger.warn('Xiaoye notification queue deferred.');}finally{running=false;}}
 return {capture,drain,restore,health:()=>({contract:XIAOYE_CONTRACT,approvalRequired:true,intake:'explicit-report-command',identity:'existing-confirmed-work-identity',scope:'original-oa-only'})};
}

import crypto from 'node:crypto';
export const XIAOYE_CONTRACT='xiaoye-secretary-pilot-v1';
export function secretaryCommand(event){
 if(event?.type==='postback'){const data=event.postback?.data;if(data==='xiaoye:report')return {begin:true};if(data==='xiaoye:finish')return {finish:true};if(data==='xiaoye:cancel')return {cancel:true};if(data==='xiaoye:end')return {end:true};return null;}
 if(event?.type!=='message'||event.message?.type!=='text')return null;
 const mentions=event.message.mention?.mentionees||[];if(mentions.some(m=>m.type==='all'||m.type==='user'&&!m.isSelf))return null;
 let value=event.message.text;for(const m of mentions.filter(m=>m.isSelf).toSorted((a,b)=>b.index-a.index))value=value.slice(0,m.index)+value.slice(m.index+m.length);
 value=value.trim().replace(/^葉小蝸[，,:：\s]*/u,'');const start=value.match(/^回報問題(?:[：:\s]+([\s\S]*))?$/u);
 const resume=value.match(/^接續回報\s+(work-[a-f0-9-]{36})$/i);if(resume)return {resumeTaskId:resume[1]};
 if(start)return start[1]?.trim()?{start:true,text:start[1].trim()}:{begin:true};if(['完成回報','結束回報'].includes(value))return {finish:true};if(value==='取消回報')return {cancel:true};if(value==='結束補充')return {end:true};if(value==='葉小蝸'||event.message.text.trim()==='葉小蝸')return {help:true};return null;
}
export function createXiaoyeSecretary({tasks,line,env=process.env,logger=console}){
 let running=false,enabled=false,sessions=new Map(),sessionMutation=0;const botUserId=env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID;
 const call=(route,input={})=>tasks.secretaryCall(route,input);
 const sessionKey=s=>crypto.createHash('sha256').update(JSON.stringify([s.botUserId,s.type,s.conversationId,s.userId])).digest('hex');
 async function restore(){const version=sessionMutation;try{const r=await call('sessions');enabled=true;if(version===sessionMutation)sessions=new Map((r.sessions||[]).map(s=>[s.key,s.until]));}catch(e){if(e.code==='SECRETARY_DISABLED'){enabled=false;sessions.clear();}}}
 async function capture(events){const consumed=[];
  for(const e of events){if(e.type==='unsend'&&enabled&&['user','group'].includes(e.source?.type)&&e.unsend?.messageId){try{await call('withdraw',{messageId:String(e.unsend.messageId),source:{botUserId,type:e.source.type,conversationId:e.source.type==='group'?e.source.groupId:e.source.userId,eventId:String(e.webhookEventId||'unsend:'+e.unsend.messageId)}});}catch(error){if(error.code!=='SECRETARY_DISABLED')throw error;}continue;}if(!['message','postback'].includes(e.type)||e.type==='message'&&!['text','image'].includes(e.message?.type)||!['user','group'].includes(e.source?.type)||!/^U[a-f0-9]{32}$/i.test(e.source.userId||''))continue;
   const command=secretaryCommand(e);if(e.type==='postback'&&!command)continue;if(e.message?.mention?.mentionees?.some(m=>m.type==='all'||m.type==='user'&&!m.isSelf))continue;
   const source={botUserId,type:e.source.type,conversationId:e.source.type==='group'?e.source.groupId:e.source.userId,userId:e.source.userId,eventId:String(e.webhookEventId||e.message?.id||e.replyToken),messageId:String(e.message?.id||'postback:'+e.webhookEventId),timestamp:e.timestamp};
   const key=sessionKey(source);if(!command&&!(sessions.get(key)>Date.now()))continue;
   const who=await tasks.meetingShareIdentity(e.source.userId);if(!who){if(e.type==='postback'&&e.source.type==='user'){if(e.replyToken)await line.replyLineMessage(e.replyToken,'請先從下方「工作日誌」完成本人登入與LINE工作身分確認，再按「回報問題」。若尚未開通，請聯絡管理者。').catch(()=>{});consumed.push(e);}continue;}
   if(e.source.type==='group'){const tenant=(await tasks.groupServices()).find(t=>t.key===who.tenantKey);if(!tenant||!(await tasks.resolveTaskGroupIdentity(e.source.userId,tenant,e.source.groupId)))continue;}
   if(command?.help)Object.assign(command,{begin:true});
   let image;if(e.message?.type==='image'){const raw=await line.downloadLineContent(e.message.id,{tries:1});if(raw.buffer.byteLength>10*1024*1024)throw Error('xiaoye_image_too_large');image={base64:Buffer.from(raw.buffer).toString('base64')};}
   let value;try{value=await call('intake',{...command,source,sender:{...who,userId:e.source.userId,botUserId},text:command?.start?command.text:e.message?.type==='text'&&!command?e.message.text:'',...(image?{image}:{})});}catch(error){if(error.status===403){if(e.type==='postback'&&e.source.type==='user'&&e.replyToken)await line.replyLineMessage(e.replyToken,'目前無法確認你的工作身分或使用資格。請先從「工作日誌」完成本人確認，或聯絡管理者。').catch(()=>{});consumed.push(e);continue;}throw error;}
   enabled=true;
   if(e.replyToken&&value.handled&&!value.duplicate){const url=value.url||'https://dailylog.chatgpt-673.workers.dev/xiaoye',quickReply={items:[{type:'action',action:{type:'postback',label:value.draft?'完成回報':'開始新回報',data:value.draft?'xiaoye:finish':'xiaoye:report'}},{type:'action',action:{type:'uri',label:'查看我的案件',uri:url}},{type:'action',action:{type:'postback',label:value.draft?'取消回報':'結束補充',data:value.draft?'xiaoye:cancel':'xiaoye:end'}}]};let text;if(value.begun)text='有什麼問題需要葉小蝸幫忙？\n請直接說明是哪個功能、想做什麼、實際發生什麼情況，也可以直接傳照片或截圖。\n可以分多次補充，全部說完後按「完成回報」，我會整理標題並建立一張任務。\n你目前有 '+value.open+' 件進行中案件；「查看我的案件」可看狀態與處理歷程。';else if(value.cancelled)text='本次未送出的回報已取消，沒有建立任務。';else if(value.ended)text='已結束這段補充，原問題與進度保留。';else if(value.needsBegin)text='目前沒有待送出的回報，請按「開始新回報」。';else if(value.needsDescription)text='請先說明問題或傳照片，再按「完成回報」。';else if(value.submitted)text='已建立問題：'+value.title+'\n葉小蝸會先釐清並提出方案，由負責人核准後才處理。你還可以直接補充，或從案件頁補圖。\n'+url;else if(value.draft)text='已暫存 '+value.texts+' 段說明、'+value.images+' 張圖片。可以繼續補充，說完後按「完成回報」。';if(text)await line.replyLineMessage(e.replyToken,{type:'text',text,quickReply}).catch(()=>{});}
   sessionMutation++;if(command?.end||value.cancelled||value.ended||value.needsBegin||!value.handled)sessions.delete(key);else sessions.set(key,Date.now()+24*3600000);if(value.handled||command?.end)consumed.push(e);
  }return consumed;
 }
 async function drain(){if(running)return;running=true;try{await restore();for(let i=0;i<3;i++){
  const result=await call('notifications/claim'),n=result.notification;if(!n)break;let state='failed',requestId='',error='';
  try{const available=await tasks.groupServices();if(available.length!==1)throw Error('service_changed');const recipient=await tasks.meetingShareRecipient({tenantKey:available[0].key,account:n.account});if(!recipient||n.expectedUserId&&recipient.userId!==n.expectedUserId)throw Error('recipient_changed');await call('notifications/validate',{id:n.id,lease:n.lease});const sent=await line.pushLineMessage(recipient.userId,n.kind==='approval'&&n.lineMessage?.type==='flex'?n.lineMessage:{type:'text',text:n.message.slice(0,4900)},null,{retryKey:'xiaoye:'+n.id,suppressEvidenceLogs:true});state='sent';requestId=sent.acceptedRequestId||sent.requestId||'';}
  catch(e){state=e.lineStatus&&e.lineStatus<500?'failed':'unknown';error='LINE 通知尚未確認，原問題與結果保留。';}
  await call('notifications/receipt',{id:n.id,lease:n.lease,state,requestId,error});
 }}catch{logger.warn('Xiaoye notification queue deferred.');}finally{running=false;}}
 return {capture,drain,restore,health:()=>({contract:XIAOYE_CONTRACT,approvalRequired:true,intake:'guided-rich-menu-draft',identity:'existing-confirmed-work-identity',scope:'original-oa-only'})};
}

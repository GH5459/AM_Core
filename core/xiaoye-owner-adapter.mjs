import crypto from 'node:crypto';
import {ownerCommand,ownerFeedbackCard} from './xiaoye-owner-line.mjs';
import {isIntakeImage} from './xiaoye-intake-card.mjs';
export function createOwnerAdapter({tasks,line,botUserId,isEnabled,logger}){
 let sessions=new Map(),revision=0;const pending=new Map();
 async function process(e,key,command){
  const wasActive=sessions.get(key)>Date.now(),reply=async(text,state={})=>{if(e.replyToken)try{await line.replyLineMessage(e.replyToken,ownerFeedbackCard(text,state));}catch{logger?.warn?.('Owner LINE reply not confirmed; event result remains saved.');}};
  if(e.source.type!=='user'){if(command)await reply('請在葉小蝸私訊中操作方案。');return !!command;}
  const sender=await tasks.meetingShareIdentity(e.source.userId);if(!sender){if(command||wasActive)await reply('目前無法確認你的工作身分，請先完成原工作日誌身分確認。');return !!command||wasActive;}
  const source={botUserId,type:'user',conversationId:e.source.userId,userId:e.source.userId,eventId:String(e.webhookEventId||e.message?.id||'unsend:'+e.unsend?.messageId),messageId:String(e.message?.id||e.unsend?.messageId||'postback:'+e.webhookEventId),timestamp:e.timestamp,eventType:e.type,...e.type==='postback'?{postbackData:e.postback.data}:{}};
  let image;try{
   if(e.type==='message'&&['image','file'].includes(e.message?.type)){
    if(Number(e.message.fileSize)>10*1024*1024)throw Object.assign(Error('建議圖片上限為10MB，原草稿保留。'),{status:413});const raw=await line.downloadLineContent(e.message.id,{tries:1,maxBytes:10*1024*1024,timeoutMs:15000}),bytes=Buffer.from(raw.buffer);if(bytes.length>10*1024*1024||!isIntakeImage(bytes))throw Object.assign(Error('請提供PNG、JPEG或WebP圖片，原草稿保留。'),{status:400});image={base64:bytes.toString('base64')};
   }
   if(wasActive&&e.type==='message'&&e.message.type==='text'&&['回報問題','完成回報','取消回報','結束補充'].includes(e.message.text?.trim())){await reply('目前正在填寫方案建議，請先按「送出建議」或「取消建議」，再開始其他回報。');return true;}
   const value=await tasks.secretaryCall('owner',{source,sender:{...sender,userId:e.source.userId,botUserId},text:e.message?.type==='text'?e.message.text:'',...(image?{image}:{})});
   if(!value.keepSession){revision++;if(value.draft)sessions.set(key,value.until);else sessions.delete(key);}
   if(e.type==='unsend')return !!value.handled;
   if(value.resumed)await reply('已沿原案件接續查核，會先確認已有動作並整理新版方案，再請你核准。');
   else if(value.approved)await reply(value.alreadyApproved?'這一版已經核准，沒有重複啟動工作。':'已收到你對第 '+value.proposalVersion+' 版方案的同意，將依核准範圍接續處理。');
   else if(value.submitted)await reply('建議已送出，會依你的文字與圖片整理新版方案，再請你核准。');
   else if(value.cancelled)await reply('已取消這次未送出的建議，原方案保留。');
   else if(value.keepSession)await reply('這個操作已處理過，請使用目前的建議按鈕。');
   else if(value.draft)await reply((value.empty?'目前還沒有內容。':'')+'正在提供「'+value.title+'」第 '+value.proposalVersion+' 版的建議。\n直接輸入希望的做法，也可以傳照片或圖片檔；可以分段補充。\n已暫存 '+value.texts+' 段文字、'+value.images+' 張圖片。說完後按「送出建議」，取消則不修改原方案。',value);
   return !!value.handled;
  }catch(error){if(e.type==='unsend')return false;if(command||wasActive){await reply(error.status&&error.status<500?error.message:'這次操作的結果尚未確認，請重按原按鈕；會核對避免重複。');return true;}return false;}
 }
 async function capture(e){
  if(!/^U[a-f0-9]{32}$/i.test(e.source?.userId||'')||!['user','group'].includes(e.source?.type)||!['message','postback','unsend'].includes(e.type))return false;const command=e.type==='postback'?ownerCommand(e.postback?.data):null;
  if(e.type==='message'&&!['text','image','file'].includes(e.message?.type))return false;
  const key=crypto.createHash('sha256').update(JSON.stringify([botUserId,e.source.type,e.source.type==='group'?e.source.groupId:e.source.userId,e.source.userId])).digest('hex');
  if(!command&&!(sessions.get(key)>Date.now())&&!pending.has(key)&&!(e.type==='unsend'&&isEnabled()))return false;
  const previous=pending.get(key)||Promise.resolve(),job=previous.catch(()=>{}).then(()=>process(e,key,command));pending.set(key,job);try{return await job;}finally{if(pending.get(key)===job)pending.delete(key);}
 }
 return {capture,version:()=>revision,restore:(rows,expected)=>{if(revision===expected)sessions=new Map((rows||[]).map(x=>[x.key,x.until]));}};
}

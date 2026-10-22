import {resultCommand} from './xiaoye-result-card.mjs';
export function createResultAdapter({tasks,line,botUserId}){
 return {async capture(event){
  if(event?.type!=='postback'||!resultCommand(event.postback?.data))return false;
  if(event.mode==='standby'||event.source?.type!=='user'||!/^U[a-f0-9]{32}$/i.test(event.source?.userId||'')||!event.webhookEventId)return true;
  let message='目前無法確認這次操作，請從案件頁查看，原紀錄保留。';
  try{
   const who=await tasks.meetingShareIdentity(event.source.userId);if(!who)throw Error('identity');
   const result=await tasks.secretaryCall('reporter',{sender:{...who,userId:event.source.userId,botUserId},source:{eventType:'postback',type:'user',botUserId,userId:event.source.userId,conversationId:event.source.userId,eventId:event.webhookEventId,timestamp:event.timestamp,postbackData:event.postback.data}});
   if(result.confirmed)message='謝謝確認，這件問題已結案。';
  }catch(error){if(error.status>=400&&error.status<500)message='案件已有更新，或這不是你的案件。請從最新完成通知或原案件頁確認。';}
  if(event.replyToken)await line.replyLineMessage(event.replyToken,message).catch(()=>{});
  return true;
 }};
}

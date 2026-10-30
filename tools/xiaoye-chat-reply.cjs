'use strict';

// Only a deliberately structured final answer is forwarded. Ordinary Codex
// progress, tool output and unmarked final text stay in the case chat.
function parseReporterReply(items){
 const message=(items||[]).filter(item=>item?.type==='agentMessage'&&typeof item.text==='string').at(-1)?.text?.trim();
 if(!message?.startsWith('小葉回覆JSON：'))return null;
 let value;try{value=JSON.parse(message.slice('小葉回覆JSON：'.length));}catch{return null;}
 if(!value||!['question','answer'].includes(value.type)||typeof value.text!=='string'||!value.text.trim()||value.text.trim().length>2000)return null;
 if(value.type==='answer'){
  if(!value.explanation||!['cause','handling','outcome'].every(k=>typeof value.explanation[k]==='string'&&value.explanation[k].trim()&&value.explanation[k].length<=120))return null;
  if(!Array.isArray(value.evidence)||!value.evidence.length||!value.evidence.every(e=>typeof e==='string'&&e.trim()&&e.length<=2000))return null;
 }
 return {type:value.type,text:value.text.trim(),...(value.type==='answer'?{explanation:value.explanation,evidence:value.evidence}:{})};
}
async function deliverReporterReply({reply,job,check,call,savePath}){
 if(!reply||job?.kind!=='analyze')return false;
 const current=await check(),task=current.task,s=task?.secretary;
 if(current.job?.id!==job.id||current.job?.lease!==job.lease||task?.id!==job.taskId||s?.sourceVersion!==job.sourceVersion)throw Error('原案件或事件已變更');
 // Codex may already have used the ordinary answer/clarify/propose API.
 if(s.stage!=='clarifying'||s.waitingForReporter)return false;
 const base={id:task.id,version:task.version,operationId:'chat-reply-'+job.id,eventId:job.id,eventLease:job.lease};
 if(reply.type==='question')await call('clarify',{...base,question:reply.text},savePath);
 else {
  const projectId=task.primaryParentId||current.projects?.find(p=>p.key==='am')?.id;
  if(!projectId)throw Error('無法確認原案件服務專案');
  await call('answer',{...base,projectId,result:reply.text,explanation:reply.explanation,evidence:reply.evidence},savePath);
 }
 return true;
}
module.exports={parseReporterReply,deliverReporterReply};

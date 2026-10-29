import {taskDates} from './line-task-dates.mjs';
const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
const userId=s=>/^U[a-f0-9]{32}$/i.test(s||'');
const taskId=s=>/^work-[a-f0-9-]{36}$/i.test(s||'');
const operationId=s=>/^op-[a-f0-9-]{36}$/i.test(s||'');
export async function readLineDirectTask(value,env,{directory,permission,makeEditor}){
 const a=value.actor,s=value.source;if(!taskId(value.taskId)||!userId(a?.userId)||typeof a.account!=='string'||!a.account||typeof a.bindingId!=='string'||!a.bindingId||!/^C[a-f0-9]{32}$/i.test(s?.groupId||''))throw fail('INVALID_REQUEST');
 const members=await directory(),actor=members.people.find(p=>p.account===a.account);if(!actor||!permission(a.account))throw fail('ACCESS_DISABLED',403);
 const row=await env.DB.prepare('SELECT value FROM work_items WHERE id=?').bind(value.taskId).first();if(!row)throw fail('TASK_NOT_FOUND',404);
 const raw=JSON.parse(row.value),source=raw.lineSelfSource;if(!source||!['line-group-bot-direct-create-v2','line-group-bot-direct-assignment-v2'].includes(source.contract)||source.groupId!==s.groupId)throw fail('TASK_SOURCE_MISMATCH',403);
 const who={...actor,id:actor.id||actor.userId||actor.user_id||'uof:'+actor.account},current=await makeEditor(members).get(who,value.taskId);await members.assertCurrent?.();if(!permission(a.account))throw fail('ACCESS_DISABLED',403);
 return {ok:true,version:current.version,title:current.title,description:current.description,startDate:current.startDate,dueDate:current.dueDate,status:current.status};
}
export async function updateLineDirectTask(value,env,{now=Date.now,directory,permission,makeEditor,publish}){
 const s=value.source,a=value.actor,change=value.change;
 if(!taskId(value.taskId)||!operationId(value.operationId)||!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<1||!userId(a?.userId)||typeof a.account!=='string'||!a.account||typeof a.bindingId!=='string'||!a.bindingId||!/^C[a-f0-9]{32}$/i.test(s?.groupId||'')||typeof s.eventId!=='string'||!s.eventId||!Number.isSafeInteger(s.timestamp)||s.timestamp<0||s.timestamp>now()+60000||!change||!['date','content','cancel'].includes(change.action))throw fail('INVALID_REQUEST');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('line-task-reply:'+s.groupId+':'+s.eventId+':'+value.taskId)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const expected='op-'+[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');if(value.operationId!==expected)throw fail('INVALID_OPERATION_ID');
 if(change.action==='date'){let dates;try{dates=taskDates(change.executionDate,s.timestamp);}catch{throw fail('INVALID_EXECUTION_DATE');}if(change.dueDate!==dates.dueDate||change.dueAt!==dates.dueAt)throw fail('INVALID_DUE_DATE');}
 if(change.action==='content'&&(typeof change.title!=='string'||!change.title.trim()||change.title.length>200||typeof change.description!=='string'||!change.description.trim()||change.description.length>4000))throw fail('INVALID_CONTENT');
 const members=await directory(),actor=members.people.find(p=>p.account===a.account);if(!actor||!permission(a.account))throw fail('ACCESS_DISABLED',403);
 const row=await env.DB.prepare('SELECT value FROM work_items WHERE id=?').bind(value.taskId).first();if(!row)throw fail('TASK_NOT_FOUND',404);
 const raw=JSON.parse(row.value),source=raw.lineSelfSource;
 if(!source||!['line-group-bot-direct-create-v2','line-group-bot-direct-assignment-v2'].includes(source.contract)||source.groupId!==s.groupId)throw fail('TASK_SOURCE_MISMATCH',403);
 const service=makeEditor(members),who={...actor,id:actor.id||actor.userId||actor.user_id||'uof:'+actor.account};
 const current=await service.get(who,value.taskId);
 const prior=raw.history?.find(event=>event.id===value.operationId);if(prior){if(prior.actor?.account!==a.account)throw fail('OPERATION_CONFLICT',409);return {ok:true,replayed:true,taskId:value.taskId,version:current.version,action:change.action,title:current.title,startDate:current.startDate,dueDate:current.dueDate,status:current.status};}
 if(current.version!==value.expectedVersion)throw fail('VERSION_CONFLICT',409);
 if(change.action==='date'){try{taskDates(change.executionDate,now());}catch{throw fail('INVALID_EXECUTION_DATE');}}
 const input=change.action==='cancel'?{kind:'status',status:'cancelled',text:'LINE 回覆取消任務'}:{kind:'edit',title:change.action==='content'?change.title:current.title,description:change.action==='content'?change.description:current.description,acceptance:current.acceptance||'',leadAccount:current.lead.account,collaboratorAccounts:(current.collaborators||[]).map(p=>p.account),dueDate:change.action==='date'?change.dueDate:current.dueDate??null,dueAt:change.action==='date'?change.dueAt:current.dueAt??null,...change.action==='date'?{startDate:change.executionDate}:{}};
 await members.assertCurrent?.();if(!permission(a.account))throw fail('ACCESS_DISABLED',403);
 const updated=await service.update(who,value.taskId,{...input,operationId:value.operationId,version:current.version},env.PUBLIC_ORIGIN);
 publish(updated);return {ok:true,taskId:value.taskId,version:updated.version,action:change.action,title:updated.title,startDate:updated.startDate,dueDate:updated.dueDate,status:updated.status};
}

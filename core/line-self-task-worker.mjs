// Called inside the original task-service authentication boundary only.
import {taskDates} from './line-task-dates.mjs';
export const SELF_TASK_CONTRACT='line-group-bot-quick-create-v1';
export const DIRECT_SELF_TASK_CONTRACT='line-group-bot-direct-create-v2';
export const DIRECT_GROUP_TASK_CONTRACT='line-group-bot-direct-assignment-v2';
export async function createLineSelfTask(value,env,{now=Date.now,directory,permission,makeService,publish,trustedInputs,assignmentContract}){
 const fail=(code,status=400)=>Object.assign(Error(code),{code,status}),db=env.DB;
 const uid=s=>/^U[a-f0-9]{32}$/i.test(s||''),text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const a=value.actor,s=value.source,d=value.draft,c=value.confirmation;
 const group=value.contract===DIRECT_GROUP_TASK_CONTRACT,direct=value.contract===DIRECT_SELF_TASK_CONTRACT||group;
 if(![SELF_TASK_CONTRACT,DIRECT_SELF_TASK_CONTRACT,DIRECT_GROUP_TASK_CONTRACT].includes(value.contract)||!/^[a-f0-9]{64}$/.test(value.id||'')||!uid(value.botUserId)||!uid(a?.userId)||!text(a.account,100)||!text(a.bindingId,200)||!/^C[a-f0-9]{32}$/i.test(s?.groupId||'')||!text(s.messageId,200)||!text(s.eventId,200)||!text(s.text,10000)||!Number.isSafeInteger(s.timestamp)||s.timestamp<0||s.timestamp>now()+60000||!Number.isSafeInteger(value.revision)||value.revision<1||(!direct&&(c?.userId!==a.userId||!text(c.eventId,200)||!Number.isSafeInteger(c.timestamp)||c.timestamp<s.timestamp||c.timestamp>now()+60000))||!text(d?.title,200)||!text(d.description,4000)||typeof d.acceptance!=='string'||d.acceptance.length>4000)throw fail('INVALID_SELF_TASK');
 const recipients=group?value.recipients:[a];
 if(!Array.isArray(recipients)||recipients.length<1||recipients.length>20||recipients.some(p=>!uid(p.userId)||!text(p.account,100)||!text(p.bindingId,200))||new Set(recipients.map(p=>p.account)).size!==recipients.length||new Set(recipients.map(p=>p.userId)).size!==recipients.length)throw fail('INVALID_RECIPIENT');
 if(group&&(!trustedInputs||!assignmentContract))throw fail('ASSIGNMENT_SERVICE_UNAVAILABLE',503);
 if(direct){let dates;try{dates=taskDates(d.executionDate,s.timestamp);}catch{throw fail('INVALID_EXECUTION_DATE');}if(d.dueDate!==dates.dueDate||d.dueAt!==dates.dueAt)throw fail('INVALID_DUE_DATE');}
 if(d.dueDate!==null&&!date(d.dueDate))throw fail('INVALID_DUE_DATE');
 if(d.dueAt!==null&&(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\+08:00$/.test(d.dueAt||'')||!Number.isFinite(Date.parse(d.dueAt))||d.dueAt.slice(0,10)!==d.dueDate))throw fail('INVALID_DUE_DATE');
 // Roster and current eligibility are checked on replays too; a receipt grants no access.
 const members=await directory(),actor=members.people.find(p=>p.account===a.account);
 if(!actor||!permission(a.account)||recipients.some(p=>!members.people.some(m=>m.account===p.account)||!permission(p.account)))throw fail('ACCESS_DISABLED',403);
 const namespace='line-self-task-receipts',key=env.LEAF_TASK_TENANT+':'+value.id,inputHash=await hash(JSON.stringify(value));
 const prior=await db.prepare('SELECT value FROM documents WHERE namespace=? AND key=?').bind(namespace,key).first();
 async function replay(receipt){if(receipt.hash!==inputHash)throw fail('IDEMPOTENCY_CONFLICT',409);await members.assertCurrent?.();if(!permission(a.account)||recipients.some(p=>!permission(p.account)))throw fail('ACCESS_DISABLED',403);const current=await db.prepare('SELECT value FROM work_items WHERE id=?').bind(receipt.taskIds[0]).first();if(!current)throw fail('TASK_NOT_FOUND',409);publish(JSON.parse(current.value));return {ok:true,taskIds:receipt.taskIds,contract:value.contract};}
 if(prior)return replay(JSON.parse(prior.value));
 if(direct){try{taskDates(d.executionDate,now());}catch{throw fail('INVALID_EXECUTION_DATE');}}
 const raw=await hash('self-task:'+key),id='work-'+[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-');
 const sourceDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
 const description=[d.description,'',group?'來源：LINE 群組交辦任務。':direct?'來源：LINE 群組本人任務指令。':'來源：LINE 群組，由本人確認建立。','原始訊息：'+s.text.slice(0,6000)+(s.text.length>6000?'（完整原文保留於原群組來源）':''),'原始時間：'+new Date(s.timestamp).toISOString()].join('\n');
 const assignment=group?{contract:assignmentContract,sourceId:value.id,assignmentState:'issued',detailsState:'needs_requester_details',taskPurpose:'',achievementGoal:'',detailsCompletedAt:null,multipleRecipients:recipients.length>1,issuedAt:new Date(now()).toISOString()}:null;
 const taskInput={id,title:d.title,description,acceptance:d.acceptance,dueDate:d.dueDate,dueAt:d.dueAt,sourceDate,leadAccount:recipients[0].account,collaboratorAccounts:recipients.slice(1).map(p=>p.account),level:1,workSource:group?'assigned':'self',workSchema:2};
 if(group)trustedInputs.set(taskInput,assignment);
 const task=await makeService(members).create({...actor,id:actor.id||actor.userId||actor.user_id||'uof:'+actor.account},taskInput,env.PUBLIC_ORIGIN);
 Object.assign(task,{lineSelfSource:{contract:value.contract,id:value.id,messageId:s.messageId,groupId:s.groupId,timestamp:s.timestamp,...direct?{originalText:s.text}:{confirmedAt:c.timestamp},revision:value.revision},startDate:direct?d.executionDate:sourceDate,initialStartDate:direct?d.executionDate:sourceDate,startDateHistory:[],department:actor.team||'部門待確認',departmentId:actor.teamId||'',departmentResolved:!!actor.team,departmentAccount:actor.account,workSource:'self',level:1,kind:'task',workSchema:2,priority:'normal',primaryParentId:null,relatedProjectIds:[],dependencyIds:[],projectFields:{},dueDate:d.dueDate,dueAt:d.dueAt,helpRequest:'',finalResult:''});
 if(group){const lead=members.people.find(p=>p.account===recipients[0].account);Object.assign(task,{assignment,workSource:'assigned',department:lead.team||'部門待確認',departmentId:lead.teamId||'',departmentResolved:!!lead.team,departmentAccount:lead.account});}
 await members.assertCurrent?.();if(!permission(a.account)||recipients.some(p=>!permission(p.account)))throw fail('ACCESS_DISABLED',403);
 const nonce=crypto.randomUUID(),receipt={hash:inputHash,nonce,taskIds:[id]};
 await db.batch([
  db.prepare('INSERT INTO documents(namespace,key,value,revision) VALUES(?,?,?,1) ON CONFLICT(namespace,key) DO NOTHING').bind(namespace,key,JSON.stringify(receipt)),
  db.prepare("INSERT INTO work_items(id,level,department,department_id,value,revision) SELECT ?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND json_extract(value,'$.nonce')=?)").bind(id,task.department,task.departmentId,JSON.stringify(task),task.version,namespace,key,nonce)
 ]);
 const saved=await db.prepare('SELECT value FROM documents WHERE namespace=? AND key=?').bind(namespace,key).first();return replay(JSON.parse(saved.value));
}

// Invoked only inside the existing authenticated task-service machine route.
// The AM caller verifies current LINE membership and established work identity.
export async function publishMeetingAssignments(value,env,{now=Date.now,directory,permission,makeService,publish,core}){
 const fail=(message,status=400)=>Object.assign(Error(message),{code:message,status});
 if(!/^[a-f0-9]{64}$/.test(value.id||'')||!/^U[a-f0-9]{32}$/i.test(value.host?.userId||'')||!value.host.account||!value.host.bindingId||!Array.isArray(value.tasks)||value.tasks.length>60||!value.source||!/^https:\/\//.test(value.url||''))throw fail('INVALID_MEETING');
 if(value.revision!==undefined||value.deliverySequence!==undefined)return reviseMeetingAssignments(value,env,{now,directory,permission,makeService,publish,core});
 const encoded=JSON.stringify(value),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encoded)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const prior=await env.DB.prepare('SELECT input_hash,result FROM meeting_task_receipts WHERE id=? AND tenant=?').bind(value.id,env.LEAF_TASK_TENANT).first();
 if(prior){if(prior.input_hash!==hash)throw fail('IDEMPOTENCY_CONFLICT',409);return {ok:true,...JSON.parse(prior.result)};}
 const members=await directory(),map=new Map(members.people.map(p=>[p.account,p]));
 const active=account=>map.has(account)&&permission(account);
 if(!active(value.host.account))throw fail('HOST_ACCESS_DISABLED',403);
 const date=value.date;
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!validDate(date))throw fail('INVALID_MEETING_DATE');
 for(const t of value.tasks){if(!/^todo:[a-f0-9-]{36}$/.test(t.id||'')||typeof t.content!=='string'||!t.content.trim()||t.content.length>4000||!validDate(t.due)||!active(t.owner?.account)||!t.owner.bindingId||!/^U[a-f0-9]{32}$/i.test(t.owner.userId||'')||typeof t.evidence!=='string'||t.evidence.length>4000)throw fail('INVALID_MEETING_TASK');}
 const actor=map.get(value.host.account),service=makeService(members),made=[],at=new Date(now()).toISOString();
 for(const t of value.tasks){
  const raw=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('meeting:'+value.id+':'+t.id)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const id='work-'+[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-'),owner=map.get(t.owner.account);
  const description=[t.content,'','會議來源：'+value.url,'會議日期：'+date,'來源錄音：'+String(value.source.filename||''),'原始訊息：'+String(value.source.messageId||''),'來源時間：'+String(value.source.timestamp||''),'討論依據：'+(t.evidence||'由主持人確認的會議待辦'),'專案／目標：'+String(value.goal||'待補充')].join('\n');
  const task=await service.create({id:actor.id||actor.userId||actor.user_id||'uof:'+actor.account,...actor},{id,title:t.content.slice(0,200),description,acceptance:'',dueDate:t.due,dueAt:t.due+'T23:59:59+08:00',sourceDate:date,leadAccount:t.owner.account,collaboratorAccounts:[],level:1,workSource:'assigned',workSchema:2},env.PUBLIC_ORIGIN);
  Object.assign(task,{meetingSource:{workspaceId:value.id,todoId:t.id,url:value.url,notionId:value.notionId,source:value.source,evidence:t.evidence,goal:value.goal||''},startDate:date,initialStartDate:date,startDateHistory:[],department:owner.team||'部門待確認',departmentId:owner.teamId||'',departmentResolved:!!owner.team,departmentAccount:t.owner.account,workSource:'assigned',level:1,kind:'task',workSchema:2,priority:'normal',primaryParentId:null,relatedProjectIds:[],dependencyIds:[],projectFields:{},helpRequest:'',finalResult:'',dueDate:t.due,dueAt:t.due+'T23:59:59+08:00'});made.push(task);
 }
 await members.assertCurrent?.();if(!active(value.host.account)||value.tasks.some(t=>!active(t.owner.account)))throw fail('ACCESS_CHANGED',403);
 const result={tasks:made.map(t=>({id:t.id,owner:t.lead.account,due:t.dueDate}))},nonce=crypto.randomUUID();
 const batch=[env.DB.prepare('INSERT INTO meeting_task_receipts(id,tenant,input_hash,result,nonce) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(value.id,env.LEAF_TASK_TENANT,hash,JSON.stringify(result),nonce),...made.map(t=>env.DB.prepare('INSERT INTO work_items(id,level,department,department_id,value,revision) SELECT ?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_task_receipts WHERE id=? AND nonce=?)').bind(t.id,t.department,t.departmentId,JSON.stringify(t),t.version,value.id,nonce))];
 await env.DB.batch(batch);
 const saved=await env.DB.prepare('SELECT input_hash,result FROM meeting_task_receipts WHERE id=? AND tenant=?').bind(value.id,env.LEAF_TASK_TENANT).first();if(saved?.input_hash!==hash)throw fail('IDEMPOTENCY_CONFLICT',409);
 for(const t of made)publish(t);return {ok:true,...JSON.parse(saved.result)};
}

async function reviseMeetingAssignments(value,env,{now,directory,permission,publish,core}){
 const fail=(code,status=409)=>Object.assign(Error(code),{code,status}),digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const delivery=value.deliverySequence!==undefined;
 if(delivery&&(!Number.isSafeInteger(value.deliverySequence)||value.deliverySequence<1)||!Number.isSafeInteger(value.revision)||value.revision<(delivery?1:2)||!Array.isArray(value.removed)||value.removed.length>60||value.removed.some(id=>!/^todo:[a-f0-9-]{36}$/.test(id))||new Set([...value.removed,...value.tasks.map(t=>t.id)]).size!==value.removed.length+value.tasks.length)throw fail('INVALID_MEETING_REVISION',400);
 const operation=value.id+(delivery?':delivery:'+value.deliverySequence:':revision:'+value.revision),hash=await digest(JSON.stringify(value)),db=env.DB;
 if(value.knownTaskIds!==undefined&&(!Array.isArray(value.knownTaskIds)||value.knownTaskIds.length>1200||value.knownTaskIds.some(id=>!/^work-[a-f0-9-]{36}$/.test(id))))throw fail('INVALID_TASK_SOURCE',400);
 const prior=await db.prepare('SELECT input_hash,result FROM meeting_task_receipts WHERE id=? AND tenant=?').bind(operation,env.LEAF_TASK_TENANT).first();if(prior){if(prior.input_hash!==hash)throw fail('IDEMPOTENCY_CONFLICT');return {ok:true,...JSON.parse(prior.result)};}
 const roster=await directory(),map=new Map(roster.people.map(p=>[p.account,p])),active=a=>map.has(a)&&permission(a),actor=map.get(value.host.account);
 if(!active(value.host.account))throw fail('HOST_ACCESS_DISABLED',403);
 for(const id of value.knownTaskIds||[]){const saved=await db.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first();if(!saved)throw fail('MEETING_TASK_SERVICE_CHANGED',403);const task=JSON.parse(saved.value);if(task.meetingSource?.workspaceId!==value.id||task.requester?.account!==value.host.account)throw fail('MEETING_TASK_SOURCE_MISMATCH',403);}
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&new Date(s).toISOString().slice(0,10)===s;
 if(!validDate(value.date))throw fail('INVALID_MEETING_DATE',400);
 for(const t of value.tasks)if(!/^todo:[a-f0-9-]{36}$/.test(t.id||'')||typeof t.content!=='string'||!t.content.trim()||t.content.length>4000||!validDate(t.due)||!active(t.owner?.account)||!t.owner.bindingId||!/^U[a-f0-9]{32}$/i.test(t.owner.userId||'')||typeof t.evidence!=='string'||t.evidence.length>4000)throw fail('INVALID_MEETING_TASK',400);
 if(!core?.createTaskService)throw fail('MEETING_REVISION_NOT_READY',503);
 const staged=[],at=new Date(now()).toISOString(),memory=new Map();
 const service=core.createTaskService({now,canUse:async a=>active(a),employees:async()=>roster.people,read:async id=>structuredClone(memory.get(id)||null),list:async()=>[],save:async(task,version)=>{const old=memory.get(task.id);if(version===null?!!old:old?.version!==version)return false;memory.set(task.id,structuredClone(task));return true;}});
 for(const todoId of [...value.tasks.map(t=>t.id),...value.removed]){
  const raw=await digest('meeting:'+value.id+':'+todoId),id='work-'+[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-');
  const saved=await db.prepare('SELECT value,revision FROM work_items WHERE id=?').bind(id).first(),old=saved?JSON.parse(saved.value):null,t=value.tasks.find(t=>t.id===todoId);
  if(old&&(old.meetingSource?.workspaceId!==value.id||old.meetingSource?.todoId!==todoId||old.requester?.account!==value.host.account))throw fail('MEETING_TASK_SOURCE_MISMATCH',403);
  if(!t&&!old)continue;if(old)memory.set(id,structuredClone(old));
  const rawOperation=await digest(operation+':'+todoId),operationId='op-'+[rawOperation.slice(0,8),rawOperation.slice(8,12),rawOperation.slice(12,16),rawOperation.slice(16,20),rawOperation.slice(20,32)].join('-'),user={...actor,id:actor.id||actor.userId||'uof:'+actor.account};
  let task;
  if(!t){await service.update(user,id,{kind:'comment',operationId,version:old.version,text:'主持人於會議修訂中取消此項指派；原任務及執行進度保留。來源：'+value.url,mentions:[]},env.PUBLIC_ORIGIN);task=memory.get(id);task.meetingSource={...old.meetingSource,withdrawn:true,withdrawnAt:at,revision:value.revision};}
  else {
   const description=[t.content,'','會議來源：'+value.url,'會議日期：'+value.date,'來源錄音：'+String(value.source.filename||''),'原始訊息：'+String(value.source.messageId||''),'來源時間：'+String(value.source.timestamp||''),'討論依據：'+(t.evidence||'由主持人修訂的會議待辦'),'專案／目標：'+String(value.goal||'待補充')].join('\n');
   const owner=map.get(t.owner.account);
   const details={title:t.content.slice(0,200),description,acceptance:old?.acceptance||'',dueDate:t.due,dueAt:t.due+'T23:59:59+08:00',leadAccount:t.owner.account,collaboratorAccounts:(old?.collaborators||[]).map(p=>p.account).filter(a=>a!==t.owner.account)};
   if(old)await service.update(user,id,{...details,kind:'edit',operationId,version:old.version},env.PUBLIC_ORIGIN);else await service.create(user,{...details,id,sourceDate:value.date,level:1,workSource:'assigned',workSchema:2},env.PUBLIC_ORIGIN);
   task=memory.get(id);Object.assign(task,{department:owner.team||'部門待確認',departmentId:owner.teamId||'',departmentAccount:t.owner.account,departmentResolved:!!owner.team});
   if(!old)Object.assign(task,{startDate:value.date,initialStartDate:value.date,startDateHistory:[],workSource:'assigned',level:1,kind:'task',workSchema:2,priority:'normal',primaryParentId:null,relatedProjectIds:[],dependencyIds:[],projectFields:{},helpRequest:'',finalResult:''});
   task.meetingSource={workspaceId:value.id,todoId,url:value.url,notionId:value.notionId,source:value.source,evidence:t.evidence,goal:value.goal||'',revision:value.revision,withdrawn:false};
  }
  task.meetingRevisionHistory=[...(old?.meetingRevisionHistory||[]),{revision:value.revision,at,actor:value.host.account,before:old?{title:old.title,owner:old.lead?.account,due:old.dueDate}:null,after:t?{title:task.title,owner:task.lead.account,due:task.dueDate}:null,source:value.url}];
  staged.push({task,version:saved?.revision??null});
 }
 await roster.assertCurrent?.();if(!active(value.host.account)||value.tasks.some(t=>!active(t.owner.account)))throw fail('ACCESS_CHANGED',403);
 // A single receipt insert tests every expected task version. Every write is
 // gated by that insert, so concurrent task progress can never be overwritten.
 const nonce=crypto.randomUUID(),conditions=[],args=[];
 for(const s of staged){conditions.push(s.version===null?'NOT EXISTS(SELECT 1 FROM work_items WHERE id=?)':'EXISTS(SELECT 1 FROM work_items WHERE id=? AND revision=?)');args.push(s.task.id,...s.version===null?[]:[s.version]);}
 const result={tasks:staged.map(s=>({id:s.task.id,owner:s.task.lead?.account,due:s.task.dueDate,withdrawn:!!s.task.meetingSource.withdrawn}))};
 const batch=[db.prepare('INSERT INTO meeting_task_receipts(id,tenant,input_hash,result,nonce) SELECT ?,?,?,?,? WHERE '+(conditions.join(' AND ')||'1')+' ON CONFLICT(id) DO NOTHING').bind(operation,env.LEAF_TASK_TENANT,hash,JSON.stringify(result),nonce,...args)];
 for(const s of staged)batch.push(s.version===null?db.prepare('INSERT INTO work_items(id,level,department,department_id,value,revision) SELECT ?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_task_receipts WHERE id=? AND nonce=?)').bind(s.task.id,s.task.department,s.task.departmentId,JSON.stringify(s.task),s.task.version,operation,nonce):db.prepare('UPDATE work_items SET value=?,revision=?,department=?,department_id=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM meeting_task_receipts WHERE id=? AND nonce=?)').bind(JSON.stringify(s.task),s.task.version,s.task.department,s.task.departmentId,s.task.id,s.version,operation,nonce));
 await db.batch(batch);const saved=await db.prepare('SELECT input_hash,result FROM meeting_task_receipts WHERE id=? AND tenant=?').bind(operation,env.LEAF_TASK_TENANT).first();if(!saved)throw fail('TASK_CHANGED_RETRY');if(saved.input_hash!==hash)throw fail('IDEMPOTENCY_CONFLICT');for(const s of staged)publish(s.task);return {ok:true,...JSON.parse(saved.result)};
}

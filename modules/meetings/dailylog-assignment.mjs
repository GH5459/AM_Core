// Invoked only inside the existing authenticated task-service machine route.
// The AM caller verifies current LINE membership and established work identity.
export async function publishMeetingAssignments(value,env,{now=Date.now,directory,permission,makeService,publish}){
 const fail=(message,status=400)=>Object.assign(Error(message),{code:message,status});
 if(!/^[a-f0-9]{64}$/.test(value.id||'')||!/^U[a-f0-9]{32}$/i.test(value.host?.userId||'')||!value.host.account||!value.host.bindingId||!Array.isArray(value.tasks)||value.tasks.length>60||!value.source||!/^https:\/\//.test(value.url||''))throw fail('INVALID_MEETING');
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

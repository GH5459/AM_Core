export const TASK_PROGRESS_CONTRACT='meeting-live-task-progress-v1';
// Called through the existing authenticated, tenant-checked meeting machine route.
export async function readMeetingProgress(value,env,{directory,permission,core,now=Date.now}){
 const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
 if(value.contract!==TASK_PROGRESS_CONTRACT||value.tenantKey!==env.LEAF_TASK_TENANT||!/^[a-f0-9]{64}$/.test(value.id||'')||!value.host?.account||!value.host.bindingId||!Array.isArray(value.todoIds)||value.todoIds.length>60||new Set(value.todoIds).size!==value.todoIds.length||value.todoIds.some(id=>!/^todo:[a-f0-9-]{36}$/.test(id)))throw fail('INVALID_MEETING_PROGRESS');
 const roster=await directory(),active=a=>roster.people.some(p=>p.account===a)&&permission(a);
 if(!active(value.host.account))throw fail('HOST_ACCESS_DISABLED',403);
 const viewer=roster.people.find(p=>p.account===value.viewer?.account&&active(p.account)),items=[];
 const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 for(const todoId of value.todoIds){
  const raw=await digest('meeting:'+value.id+':'+todoId),id='work-'+[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-');
  const saved=await env.DB.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first();
  if(!saved){items.push({todoId,status:'unknown'});continue;}
  const task=JSON.parse(saved.value);
  if(task.meetingSource?.workspaceId!==value.id||task.meetingSource?.todoId!==todoId||task.requester?.account!==value.host.account)throw fail('MEETING_TASK_SOURCE_MISMATCH',403);
  let visible=false;
  if(viewer&&core){const service=core.createTaskService({now,canUse:async a=>active(a),employees:async()=>roster.people,read:async key=>key===id?structuredClone(task):null,list:async()=>[],save:async()=>{throw Error('READ_ONLY');}});try{await service.get({...viewer,id:viewer.id||'uof:'+viewer.account},id);visible=true;}catch(e){if(![403,404].includes(e.status))throw e;}}
  const result=typeof task.finalResult==='string'?task.finalResult.trim():'',status=task.meetingSource.withdrawn?'withdrawn':task.status==='done'&&!result?'pending_confirmation':task.status;
  const url=new URL(env.PUBLIC_ORIGIN);if(url.protocol!=='https:')throw fail('INVALID_TASK_ORIGIN',503);url.search='';url.hash='';url.searchParams.set('task',id);
  items.push({todoId,status,due:task.dueDate||'',updatedAt:task.updatedAt||null,completedAt:task.completedAt||null,hasEvidence:!!result,result:visible?result:'',evidenceRestricted:!!result&&!visible,url:url.href});
 }
 await roster.assertCurrent?.();
 return {ok:true,contract:TASK_PROGRESS_CONTRACT,items};
}

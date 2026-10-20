import {todos,meetingToday} from './workspace-model.js';
export const TASK_PROGRESS_CONTRACT='meeting-live-task-progress-v1';
// Reads never enqueue delivery, write tasks or send LINE messages.
export function meetingTaskProgress({pool,platform,now=Date.now}){
 return async function read(r,actor){
  if(r.state!=='published')return null;
  const entries=todos(r.fields),q=(await pool.query('SELECT * FROM central_archive.meeting_task_dispatches WHERE workspace_id=$1',[r.id])).rows[0]||{task_tenant:r.receipt?.taskTenant,applied_fields:r.receipt?.tasksSaved&&!r.receipt?.taskDispatch?r.fields:{}};
  const items=entries.map(t=>({todoId:t.id,status:t.ownerId?'pending_delivery':'unassigned',due:t.due||'',overdue:false}));
  let available=true,checkedAt=null;
  const assigned=entries.filter(t=>t.ownerId&&q?.applied_fields?.[t.id]?.ownerId===t.ownerId);
  if(assigned.length){
   try{
    if(!q.task_tenant||!platform.readMeetingTaskProgress)throw Error('unavailable');
    const result=await platform.readMeetingTaskProgress({tenantKey:q.task_tenant,id:r.id,hostId:r.host_id,actorId:actor.id,todoIds:assigned.map(t=>t.id)});
    if(result?.contract!==TASK_PROGRESS_CONTRACT||!Array.isArray(result.items))throw Error('invalid_progress');
    for(const t of assigned){const item=items.find(i=>i.todoId===t.id),v=result.items.find(i=>i.todoId===t.id);
     if(!v){item.status='unknown';available=false;continue;}
     const statuses=['pending','in_progress','blocked','done','pending_confirmation','withdrawn','cancelled'];
     item.status=statuses.includes(v.status)?v.status:'unknown';if(item.status==='unknown')available=false;
     if(v.due===''||/^\d{4}-\d{2}-\d{2}$/.test(v.due||''))item.due=v.due;
     item.updatedAt=v.updatedAt||null;item.completedAt=v.completedAt||null;
     item.hasEvidence=v.hasEvidence===true;item.result=typeof v.result==='string'?v.result.slice(0,10000):'';item.evidenceRestricted=v.evidenceRestricted===true;
     if(typeof v.url==='string'){const u=new URL(v.url);if(u.protocol==='https:'&&!u.username&&!u.password)item.url=u.href;}
    }
    checkedAt=new Date(now()).toISOString();
   }catch{available=false;for(const t of assigned)Object.assign(items.find(i=>i.todoId===t.id),{status:'unknown',result:'',url:undefined,hasEvidence:false});}
  }
  const today=meetingToday(now()),counts={total:items.length,done:0,pending_confirmation:0,in_progress:0,blocked:0,pending:0,unassigned:0,pending_delivery:0,unknown:0,withdrawn:0,cancelled:0,overdue:0};
  for(const item of items){item.overdue=!['done','withdrawn','cancelled','unknown'].includes(item.status)&&!!item.due&&item.due<today;counts[item.status]++;if(item.overdue)counts.overdue++;}
  return {contract:TASK_PROGRESS_CONTRACT,available,checkedAt,counts,items};
 };
}

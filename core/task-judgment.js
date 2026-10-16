export const TASK_SPEED_POLICY='line-task-fast-notice-v1';
export function checkedAssignments(assignments,count){
 if(!Array.isArray(assignments)||assignments.length>5)throw Error('invalid_task_judgment');
 return assignments.map(a=>{
  if(!a||typeof a.title!=='string'||!a.title.trim()||a.title.length>200||typeof a.description!=='string'||!a.description.trim()||a.description.length>4000||!Array.isArray(a.recipientIndices)||!a.recipientIndices.length||new Set(a.recipientIndices).size!==a.recipientIndices.length||a.recipientIndices.some(i=>!Number.isInteger(i)||i<0||i>=count))throw Error('invalid_task_judgment');
  return {title:a.title.trim(),description:a.description.trim(),recipientIndices:[...a.recipientIndices]};
 });
}
export const assignmentSchema={type:'array',items:{type:'object',properties:{title:{type:'string'},description:{type:'string'},recipientIndices:{type:'array',items:{type:'integer'}}},required:['title','description','recipientIndices']}};

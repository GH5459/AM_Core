export const TASK_ELIGIBILITY_POLICY='line-task-silent-ineligible-v1';
export const taskIneligible=()=>Object.assign(Error('task_ineligible'),{code:'TASK_INELIGIBLE'});
export const isTaskIneligible=e=>e?.code==='TASK_INELIGIBLE'||e?.code==='ACCESS_DISABLED';
// A previously deferred login request must never resume after the person signs in.
export const wasWaitingForTaskIdentity=p=>p.mode==='task'&&(
  p.people?.some(x=>['login','unverified','linked'].includes(x.state))||
  p.notices?.some(x=>x.startsWith('login:')||x.startsWith('identity-scope:')));
export function ignoreTask(p){return {...p,phase:'ignored',closedReason:TASK_ELIGIBILITY_POLICY,people:[],frozenTaskPeople:undefined,taskJudgment:undefined};}

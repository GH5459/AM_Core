export const TASK_ELIGIBILITY_POLICY='line-task-silent-ineligible-v1';
// Called only inside the existing service-authenticated and tenant-checked scope.
// A terminal queue receipt prevents later grants/login from reviving old work.
export async function suppressLineTask(value,env,now=Date.now){
 const fail=(code,status)=>Object.assign(Error(code),{code,status});
 if(value.policy!==TASK_ELIGIBILITY_POLICY||!/^[a-f0-9]{64}$/.test(value.id||'')||typeof value.leaseToken!=='string')throw fail('INVALID_REQUEST',400);
 const row=await env.DB.prepare('SELECT state,lease_token,lease_until FROM line_assignment_intake WHERE id=? AND tenant=?').bind(value.id,env.LEAF_TASK_TENANT).first();
 if(!row)throw fail('NOT_FOUND',404);
 if(row.state==='suppressed')return {ok:true,suppressed:true,policy:TASK_ELIGIBILITY_POLICY};
 if(row.lease_token!==value.leaseToken||row.lease_until<now())throw fail('LEASE_CHANGED',409);
 if(!['queued','judged'].includes(row.state))throw fail('INVALID_STATE',409);
 const result=await env.DB.prepare("UPDATE line_assignment_intake SET state='suppressed',result=?,lease_token=NULL,lease_until=0 WHERE id=? AND tenant=? AND state IN ('queued','judged') AND lease_token=? AND lease_until>=?").bind(JSON.stringify({assignments:[],ruleVersion:TASK_ELIGIBILITY_POLICY}),value.id,env.LEAF_TASK_TENANT,value.leaseToken,now()).run();
 if(result.meta.changes!==1)throw fail('LEASE_CHANGED',409);
 return {ok:true,suppressed:true,policy:TASK_ELIGIBILITY_POLICY};
}

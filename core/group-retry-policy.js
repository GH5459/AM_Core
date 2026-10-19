export const GROUP_RETRY_POLICY='group-silent-bounded-retry-v1';
export const GROUP_RETRY_LIMIT=3;
const setupErrors=new Set(['GOOGLE_NOT_CONNECTED','CALENDAR_NOT_WRITABLE','ACCESS_DISABLED','ACCOUNT_NOT_FOUND']);
export const groupConnectionRequired=p=>p.people?.some(x=>x.state==='login'||setupErrors.has(x.error));
export function stopGroupRetry(p,at,reason){return {...p,phase:'ignored',closedReason:GROUP_RETRY_POLICY,stoppedAt:at,stopReason:reason};}
export function retryGroupFailure(p,at){
 const next={...p,retryFailures:(p.retryFailures||0)+1};
 return next.retryFailures>=GROUP_RETRY_LIMIT?{value:stopGroupRetry(next,at,'retry_limit'),delay:0}:{value:next,delay:next.retryFailures===1?60:300};
}

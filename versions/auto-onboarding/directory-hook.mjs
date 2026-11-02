import {applyDirectoryPolicy,targetGroupIds} from './policy.mjs';
import {groupQuery} from './coordinator.mjs';
import {enqueue,processAccount,tick} from './coordinator.mjs';
const flights=new WeakMap();

// Capture the pre-sync membership once, so a temporary hierarchy failure does
// not silently classify newly arrived people as the starting baseline.
export function rememberBaseline(access,eligible){
 if(access.autoOnboarding||access.autoOnboardingBootstrap)return;
 const people=access.personnelDetails?.people;if(!people||typeof people!=='object'||!Array.isArray(access.employees)||typeof eligible!=='function')return;
 const entries={};for(const p of access.employees){if(!eligible(access,p))continue;const account=p.account,detail=people[account];if(!/^\d{1,20}$/.test(account)||!Array.isArray(detail?.units))throw Error('AUTO_BASELINE_INVALID');entries[account]={units:detail.units.map(u=>({id:u.id,active:u.active===true}))};}
 access.autoOnboardingBootstrap={schemaVersion:1,people:entries};
}
export function evaluateDirectory(access,groups,eligible,now){
 targetGroupIds(groups);
 if(!access.autoOnboarding){const baseline=access.autoOnboardingBootstrap;if(!baseline||baseline.schemaVersion!==1||!baseline.people)throw Error('AUTO_BASELINE_UNAVAILABLE');const people=Object.keys(baseline.people).map(account=>({account}));applyDirectoryPolicy(access,people,{people:baseline.people},groups,()=>true,now);}
 if(!Array.isArray(access.employees)||!access.personnelDetails?.people)throw Error('AUTO_DIRECTORY_UNAVAILABLE');
 const result=applyDirectoryPolicy(access,access.employees,access.personnelDetails,groups,eligible,now);delete access.autoOnboardingBootstrap;access.autoOnboardingNeedsEvaluation=false;access.autoOnboardingNextEvaluationAt=0;return result;
}
export async function refreshPending(app,eligible,now=Date.now()){
 const current=await app.store.get('access');if(!current||current.autoOnboarding&&!current.autoOnboardingNeedsEvaluation||current.autoOnboardingNextEvaluationAt>now)return;
 try{const groups=await app.api.readQuery(groupQuery(),5000);targetGroupIds(groups);await app.store.update('access',a=>{rememberBaseline(a,eligible);evaluateDirectory(a,groups,eligible,now);return a;});}
 catch{await app.store.update('access',a=>{a.autoOnboardingNeedsEvaluation=true;a.autoOnboardingNextEvaluationAt=now+300000;return a;});}
}
export function maintenance(app,eligible,recheck){
 if(flights.has(app))return flights.get(app);
 const task=(async()=>{await refreshPending(app,eligible);await tick(app,{recheck});})().finally(()=>flights.delete(app));flights.set(app,task);return task;
}
export async function confirmed(app,account,recheck){await enqueue(app,account);return processAccount(app,account,{recheck});}

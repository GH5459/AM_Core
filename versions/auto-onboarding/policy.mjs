// Pure classification for the explicitly approved organization. No network or storage.
export const TARGET_GROUP='735865f2-6933-435b-860d-0f1670b79449';
export const TARGET_PARENT='271fa13e-d14b-bda2-5bde-8f60c92f5171';
const id=v=>typeof v==='string'?v.toLowerCase():'';

export function targetGroupIds(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>=5000)throw Error('GROUP_SOURCE_INCOMPLETE');
 const map=new Map();for(const r of rows){const key=id(r.id);if(!key||map.has(key)||![true,false,0,1].includes(r.active)||typeof r.kind!=='string')throw Error('GROUP_SOURCE_INVALID');map.set(key,{...r,id:key,parentId:id(r.parentId)});}
 const root=map.get(TARGET_GROUP);if(!root||!root.active||root.kind!=='Department'||root.parentId!==TARGET_PARENT)throw Error('TARGET_GROUP_UNCONFIRMED');
 const parent=map.get(TARGET_PARENT);if(!parent||!parent.active||parent.kind!=='Department')throw Error('TARGET_PARENT_UNCONFIRMED');
 const result=new Set();for(const r of map.values()){
  if(!r.active||r.kind!=='Department')continue;let current=r;const visited=new Set();
  while(current){if(visited.has(current.id))throw Error('GROUP_CYCLE');visited.add(current.id);if(!current.active)break;if(current.id===TARGET_GROUP){result.add(r.id);break;}if(!current.parentId||current.parentId==='company')break;current=map.get(current.parentId);if(!current)throw Error('GROUP_PARENT_MISSING');}
 }
 return result;
}

// The access object is mutated only inside its caller's existing atomic update.
// First run baselines current members; later entrants are granted once. Seen
// members are never re-granted, even after a transfer or manual revocation.
export function applyDirectoryPolicy(access,people,details,groups,eligible,now){
 if(!access||!Array.isArray(people)||!details?.people||typeof eligible!=='function'||!Number.isFinite(now))throw Error('DIRECTORY_INPUT_INVALID');
 const scope=targetGroupIds(groups),old=access.autoOnboarding;
 if(old!==undefined&&(!old||old.schemaVersion!==1||old.root!==TARGET_GROUP||!Array.isArray(old.seen)||old.seen.some(x=>!/^\d{1,20}$/.test(x))||new Set(old.seen).size!==old.seen.length||typeof old.meetings!=='object'||!old.meetings||Array.isArray(old.meetings)))throw Error('AUTO_STATE_INVALID');
 const seen=new Set(old?.seen||[]),meetings={...(old?.meetings||{})},first=!old,line=new Set(access.enabledAccounts||[]),daily=new Set(access.dailylogEnabledAccounts||[]),added=[],members=[];
 for(const p of people){
  if(!p||!/^\d{1,20}$/.test(p.account||'')||!eligible(access,p))continue;
  const entry=details.people[p.account];if(!entry||!Array.isArray(entry.units))throw Error('MEMBERSHIP_SOURCE_INCOMPLETE');
  const inScope=entry.units.some(u=>u.active===true&&scope.has(id(u.id)));if(!inScope)continue;members.push(p.account);
  if(!seen.has(p.account)){
   seen.add(p.account);const manuallyManaged=!!access.accountPolicies?.[p.account];meetings[p.account]={status:manuallyManaged?'manual-hold':'pending',registeredAt:new Date(now).toISOString()};
   if(!first&&!manuallyManaged){line.add(p.account);daily.add(p.account);added.push(p.account);}
  }
 }
 access.autoOnboarding={schemaVersion:1,root:TARGET_GROUP,seen:[...seen].sort(),members:members.sort(),meetings,scanNeeded:true,startedAt:old?.startedAt||new Date(now).toISOString()};
 if(added.length){access.enabledAccounts=[...line].sort();access.dailylogEnabledAccounts=[...daily].sort();access.revision++;access.savedAt=new Date(now).toISOString();access.savedBy='auto-onboarding';}
 return {baseline:first,added:added.sort()};
}

// A previously modified meeting setting is a human decision; never override it.
export function meetingDecision({account,entry,active,inScope,identity,conversation}){
 if(!entry||entry.status!=='pending'||!active||!inScope)return 'wait';
 if(!identity||identity.state!=='confirmed'||identity.account!==account||identity.conflict)return 'wait';
 if(!conversation)return 'wait-conversation';
 if(conversation.type!=='user'||conversation.account!==account||conversation.identityState!=='confirmed')return 'wait';
 if(['left','blocked'].includes(conversation.connection))return 'wait';
 if(conversation.enabled)return 'complete';
 if(!Number.isSafeInteger(conversation.version)||conversation.version<1)return 'wait';
 if(conversation.version>1)return 'manual-hold';
 return 'enable';
}

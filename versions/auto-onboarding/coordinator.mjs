import {targetGroupIds,TARGET_GROUP} from './policy.mjs';
const GROUP_SQL="SELECT CONVERT(nvarchar(36),GROUP_ID) AS id,CONVERT(nvarchar(36),PARENT_GROUP_ID) AS parentId,COALESCE(GROUP_TYPE,N'') AS kind,ACTIVE AS active FROM dbo.TB_EB_GROUP";
const identity=/^U[a-f0-9]{32}$/i,accountPattern=/^\d{1,20}$/,flights=new WeakMap();
const delay=n=>[60000,300000,900000,3600000][Math.min(Math.max(n-1,0),3)];
export const groupQuery=()=>GROUP_SQL;
export function membershipQuery(account){if(!accountPattern.test(account||''))throw Error('INVALID_ACCOUNT');return `SELECT CONVERT(nvarchar(36),g.GROUP_ID) AS id FROM dbo.TB_EB_USER u JOIN dbo.TB_EB_EMPL_DEP ed ON ed.USER_GUID=u.USER_GUID JOIN dbo.TB_EB_GROUP g ON g.GROUP_ID=ed.GROUP_ID AND g.GROUP_TYPE=N'Department' AND g.ACTIVE=1 WHERE u.USER_TYPE IN (N'Employee',N'Member') AND ISNULL(u.IS_SUSPENDED,0)=0 AND ISNULL(u.IS_LOCKED_OUT,0)=0 AND (u.EXPIRE_DATE IS NULL OR u.EXPIRE_DATE>SYSDATETIMEOFFSET()) AND LTRIM(RTRIM(u.ACCOUNT))=N'${account}'`;}
function allowed(a,account,now){const p=a?.autoOnboarding,e=p?.meetings?.[account],fetched=Date.parse(a?.directory?.fetchedAt),catalog=a?.accountCatalog;return p?.schemaVersion===1&&p.root===TARGET_GROUP&&p.members?.includes(account)&&e&&['pending','queued'].includes(e.status)&&a.enabledAccounts?.includes(account)&&a.dailylogEnabledAccounts?.includes(account)&&a.accountPolicies?.[account]?.status!=='disabled'&&a.employees?.some(x=>x.account===account)&&(!catalog||catalog.people?.some(x=>x.account===account&&x.sourceEligible!==false))&&Number.isFinite(fetched)&&now-fetched<36*3600000&&fetched-now<60000;}
async function mutate(app,fn){await app.store.update('access',a=>{if(a?.autoOnboarding?.schemaVersion===1)fn(a,a.autoOnboarding);return a;});}
export async function enqueue(app,account,now=Date.now()){
 if(!accountPattern.test(account||''))return false;let queued=false;
 await mutate(app,(a,p)=>{if(!allowed(a,account,now))return;const e=p.meetings[account];if(e.status==='pending'){p.meetings[account]={...e,status:'queued',nextAt:now,attempts:0};queued=true;}});return queued;
}
async function retry(app,account,now){await mutate(app,(_a,p)=>{const e=p.meetings[account];if(e?.status==='queued'){const attempts=(e.attempts||0)+1;p.meetings[account]={...e,attempts,nextAt:now+delay(attempts)};}});}
async function finish(app,account,status,now){await mutate(app,(_a,p)=>{const e=p.meetings[account];if(e?.status==='queued')p.meetings[account]={...e,status,completedAt:new Date(now).toISOString()};});}
export async function processAccount(app,account,{recheck,now=Date.now}={}){
 if(!accountPattern.test(account||'')||typeof recheck!=='function')return {status:'invalid'};
 if(!flights.has(app))flights.set(app,new Set());const active=flights.get(app);if(active.has(account))return {status:'busy'};active.add(account);
 try{
  const time=now(),a=await app.store.get('access');if(!allowed(a,account,time))return {status:'not-eligible'};
  const e=a.autoOnboarding.meetings[account];if(e.status!=='queued'||(e.nextAt||0)>time)return {status:'waiting'};
  const bot=app.env.AMCORE_MEETING_BOT_USER_ID;if(!identity.test(bot||''))throw Error('BOT_UNAVAILABLE');
  const all=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'inventory',botUserId:bot});if(!all?.ok||!Array.isArray(all.items))throw Error('IDENTITY_UNAVAILABLE');
  const pairs=all.items.filter(x=>x.account===account&&identity.test(x.lineUserId||''));if(pairs.length!==1){if(pairs.length===0){await mutate(app,(_a,p)=>{const x=p.meetings[account];if(x?.status==='queued')p.meetings[account]={...x,status:'pending'};});return {status:'awaiting-identity'};}throw Error('IDENTITY_AMBIGUOUS');}
  const lineUserId=pairs[0].lineUserId,[groups,units]=await Promise.all([app.api.readQuery(GROUP_SQL,5000),app.api.readQuery(membershipQuery(account),5000)]);const scope=targetGroupIds(groups);if(!Array.isArray(units)||!units.some(x=>scope.has(String(x.id||'').toLowerCase()))){await mutate(app,(_a,p)=>{const x=p.meetings[account];if(x?.status==='queued')p.meetings[account]={...x,status:'pending'};});return {status:'not-in-group'};}
  const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${bot}:user:${lineUserId}`))),n=>n.toString(16).padStart(2,'0')).join('');
  await recheck(app,{account,key});const latest=await app.store.get('access');if(!allowed(latest,account,now()))return {status:'not-eligible'};
  const result=await app.env.DAILYLOG_MANAGEMENT.autoOnboardingPersonal({account,botUserId:bot,lineUserId});
  if(!result?.ok||!['enabled','already_enabled','manual_hold','unavailable'].includes(result.status))throw Error('REMOTE_UNAVAILABLE');
  if(result.status==='unavailable')throw Error('REMOTE_UNAVAILABLE');
  await finish(app,account,result.status==='manual_hold'?'manual-hold':'complete',now());return {status:result.status};
 }catch{await retry(app,account,now());return {status:'retry'};}finally{active.delete(account);}
}
// Scan once after each successful directory sync. The scheduler only processes
// existing queued work and uses its pre-existing tick; no new timer is created.
export async function scanConfirmed(app,now=Date.now()){
 const a=await app.store.get('access'),p=a?.autoOnboarding;if(!p?.scanNeeded||(p.nextScanAt||0)>now)return;
 try{const bot=app.env.AMCORE_MEETING_BOT_USER_ID;if(!identity.test(bot||''))throw Error('BOT_UNAVAILABLE');const data=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'inventory',botUserId:bot});if(!data?.ok||!Array.isArray(data.items))throw Error('IDENTITY_UNAVAILABLE');const counts=new Map();for(const x of data.items)if(accountPattern.test(x.account||'')&&identity.test(x.lineUserId||''))counts.set(x.account,(counts.get(x.account)||0)+1);
  await mutate(app,(latest,state)=>{if(latest.directory?.revision!==a.directory?.revision)return;for(const account of state.members||[])if(counts.get(account)===1&&allowed(latest,account,now)){const e=state.meetings[account];if(e.status==='pending')state.meetings[account]={...e,status:'queued',nextAt:now,attempts:0};}state.scanNeeded=false;state.nextScanAt=0;});
 }catch{await mutate(app,(_a,state)=>{state.nextScanAt=now+300000;});}
}
export async function tick(app,options={}){const now=(options.now||Date.now)();await scanConfirmed(app,now);const a=await app.store.get('access'),p=a?.autoOnboarding;if(!p)return;const account=(p.members||[]).find(id=>allowed(a,id,now)&&p.meetings[id]?.status==='queued'&&(p.meetings[id].nextAt||0)<=now);if(account)await processAccount(app,account,options);}

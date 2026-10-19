import {verifyLegacyIdentity} from './common-line-uof.mjs';
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=()=>Object.assign(Error('本人 LINE 身分已變更或有衝突，請重新確認。'),{status:409});
async function mappings(app){
 const bot=app.env.AMCORE_MEETING_BOT_USER_ID;
 const [saved,remote,registry,access]=await Promise.all([app.store.get('bindings',[]),app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'inventory',botUserId:bot}),app.store.get('common-line-identities',{items:[]}),app.sharedAccess.snapshot()]);
 if(!remote?.ok||!Array.isArray(access.effectiveActiveAccounts))throw Object.assign(Error('LINE 身分暫時無法確認。'),{status:503});
 const values=[...saved.map(p=>({account:p.account,lineUserId:p.userId,legacy:p})),...remote.items,...registry.items],unique=new Map();
 for(const p of values){if(!/^\d{1,20}$/.test(p.account||'')||!/^U[a-f0-9]{32}$/i.test(p.lineUserId||''))continue;const key=p.account+':'+p.lineUserId;if(!unique.has(key)||p.legacy)unique.set(key,p);}
 return {bot,values:[...unique.values()],active:new Set(access.effectiveActiveAccounts)};
}
export async function commonPersonnelInventory(app,data){
 const {bot,values,active}=await mappings(app),byKey=new Map();
 for(const p of values){const key=await sha(bot+':user:'+p.lineUserId);if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(p);}
 return {contract:data.contract,tenants:data.tenants||[],conversations:(data.conversations||[]).filter(r=>r.type==='user').map(r=>{const matches=byKey.get(r.key)||[],p=matches[0],valid=matches.length===1&&active.has(p.account)&&values.filter(v=>v.account===p.account).length===1;return {...r,account:valid?p.account:'',identityState:valid?'confirmed':matches.length?'needs_review':'unlinked'};})};
}
export async function commonMeetingRecheck(app,row){
 const {bot,values,active}=await mappings(app),matches=values.filter(p=>p.account===row.account);if(!active.has(row.account)||matches.length!==1||await sha(bot+':user:'+matches[0].lineUserId)!==row.key)throw fail();
 const p=matches[0];if(p.legacy)await verifyLegacyIdentity(app,p.legacy);
 const check=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'lookup',botUserId:bot,lineUserId:p.lineUserId,account:p.account});if(!check?.ok||check.conflict||check.items.some(x=>x.account!==p.account||x.lineUserId!==p.lineUserId))throw fail();
}

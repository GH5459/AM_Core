// Explicit service-local grants. Identity is resolved afresh on each request.
export function meetingStartAuthority({env,platform,plan,botId}){
 let grants=[];try{const value=JSON.parse(env.AMCORE_MEETING_START_OPERATORS||'[]');if(Array.isArray(value))grants=value.filter(g=>g&&typeof g.tenantKey==='string'&&/^\d{1,20}$/.test(g.account));}catch{}
 const granted=who=>!!who&&grants.some(g=>g.tenantKey===who.tenantKey&&g.account===who.account);
 async function allows(userId,r,row,readIdentity){
  if(!grants.length||!r||row?.bot_id!==botId)return false;
  try{const who=await (readIdentity?readIdentity(userId):platform.meetingShareIdentity?.(userId));if(!granted(who))return false;
   // A workspace read supplies a fresh, request-local identity reader. A write
   // retains the original independent identity checks and their ordering.
   const [p,owner]=readIdentity?await Promise.all([plan(r.id),readIdentity(r.host_id)]):[await plan(r.id),await platform.meetingShareIdentity?.(r.host_id)];
   return !!owner&&owner.tenantKey===who.tenantKey&&(!p?.tenant_key||p.tenant_key===who.tenantKey);
  }catch{return false;}
 }
 return {granted,allows};
}

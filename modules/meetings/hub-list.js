async function parallel(values, read) {
 const results=new Array(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(5,values.length)},async()=>{
  while(next<values.length){const index=next++;results[index]=await read(values[index]);}
 }));
 return results;
}

// Only this inventory operation shares source reads. A fresh source/member
// check at the end excludes revocations while the other meetings were checked.
export async function visibleMeetingRows({rows,actor,who,getConversation,assertMember,publicationReader,startAuthority}) {
 const sources=new Map(),sourceRows=new Map(),currentSources=new Map(),uses=new Map();
 async function alternate(r,row){
  if(startAuthority?.granted(who)&&await startAuthority.allows(actor.id,r,row))return '整理協助會議';
  return await publicationReader(r,actor.id)?'發布群組會議':'';
 }
 function sourceMember(key){
  uses.set(key,(uses.get(key)||0)+1);
  if(!sources.has(key))sources.set(key,(async()=>{
   const row=await getConversation(key);sourceRows.set(key,row);
   try{await assertMember(row,actor.id);return row;}catch{return null;}
  })());
  return sources.get(key);
 }
 const visible=await parallel(rows,async r=>{
  let kind=r.host_id===actor.id?'本人會議':'';
  if(!kind&&r.tenant_key===who.tenantKey&&r.participants?.some(p=>p.account===who.account))kind='受邀會議';
  if(!kind&&await sourceMember(r.conversation_key))kind='來源對話';
  if(!kind)kind=await alternate(r,sourceRows.get(r.conversation_key));
  return {r,kind};
 });
 const confirmed=new Set();
 await parallel([...new Set(visible.filter(x=>x.kind==='來源對話').map(x=>x.r.conversation_key))],async key=>{
  if(uses.get(key)===1){confirmed.add(key);return;}
  const before=await sources.get(key),current=await getConversation(key);currentSources.set(key,current);
  if(!current||['key','bot_id','source_kind','source_id','tenant_key'].some(field=>current[field]!==before[field]))return;
  try{await assertMember(current,actor.id);confirmed.add(key);}catch{}
 });
 return (await parallel(visible,async entry=>{
  if(entry.kind==='來源對話'&&!confirmed.has(entry.r.conversation_key))entry.kind=await alternate(entry.r,currentSources.get(entry.r.conversation_key));
  return entry;
 })).filter(entry=>entry.kind);
}

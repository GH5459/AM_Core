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
 const sources=new Map(),sourceRows=new Map(),currentSources=new Map(),groups=new Map();
 async function alternate(r,row){
  if(startAuthority?.granted(who)&&await startAuthority.allows(actor.id,r,row))return '整理協助會議';
  return await publicationReader(r,actor.id)?'發布群組會議':'';
 }
 const visible=rows.map(r=>{
  let kind=r.host_id===actor.id?'本人會議':'';
  if(!kind&&r.tenant_key===who.tenantKey&&r.participants?.some(p=>p.account===who.account))kind='受邀會議';
  const entry={r,kind};
  if(!kind){if(!groups.has(r.conversation_key))groups.set(r.conversation_key,[]);groups.get(r.conversation_key).push(entry);}
  return entry;
 });
 // Schedule distinct sources, not rows waiting on the same source promise.
 // Keep every row in database order and leave alternate authority per meeting.
 await parallel([...groups],async([key,entries])=>{
  const row=await getConversation(key);sourceRows.set(key,row);
  try{await assertMember(row,actor.id);sources.set(key,row);for(const entry of entries)entry.kind='來源對話';}catch{}
 });
 await parallel(visible.filter(entry=>!entry.kind),async entry=>{
  entry.kind=await alternate(entry.r,sourceRows.get(entry.r.conversation_key));
 });
 const confirmed=new Set();
 await parallel([...new Set(visible.filter(x=>x.kind==='來源對話').map(x=>x.r.conversation_key))],async key=>{
  if(groups.get(key).length===1){confirmed.add(key);return;}
  const before=sources.get(key),current=await getConversation(key);currentSources.set(key,current);
  if(!current||['key','bot_id','source_kind','source_id','tenant_key'].some(field=>current[field]!==before[field]))return;
  try{await assertMember(current,actor.id);confirmed.add(key);}catch{}
 });
 return (await parallel(visible,async entry=>{
  if(entry.kind==='來源對話'&&!confirmed.has(entry.r.conversation_key))entry.kind=await alternate(entry.r,currentSources.get(entry.r.conversation_key));
  return entry;
 })).filter(entry=>entry.kind);
}

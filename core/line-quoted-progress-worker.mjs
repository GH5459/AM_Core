// Called only after the existing task-service authentication boundary.
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const uid=s=>/^U[0-9a-f]{32}$/i.test(s||'');
const gid=s=>/^C[0-9a-f]{32}$/i.test(s||'');
const prefix='LINE 群組回覆：\n';
const validText=s=>typeof s==='string'&&s.trim().length>0&&s.length<=2000-prefix.length;
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const parse=row=>{try{return JSON.parse(row.value);}catch{return null;}};

export async function recordQuotedProgress(value,env,{now=Date.now,directory,permission,makeEditor,publish}){
 const a=value.actor,s=value.source,db=env.DB;
 if(!uid(value.botUserId)||!uid(a?.userId)||!gid(s?.groupId)||typeof a.account!=='string'||!a.account||typeof a.bindingId!=='string'||!a.bindingId||!/^\d{15,30}$/.test(s.quotedMessageId||'')||!/^\d{15,30}$/.test(s.messageId||'')||!validText(s.text)||!Number.isSafeInteger(s.timestamp)||s.timestamp<0||s.timestamp>now()+60000)throw fail('INVALID_REQUEST');
 // The authenticated AM task service resolves the current LINE binding and group
 // membership before this call. Both legacy AM and DailyLog bindings are valid.
 const members=await directory(),person=members.people.find(p=>p.account===a.account);if(!person||!permission(a.account))throw fail('ACCESS_DISABLED',403);
 const sources=await db.prepare("SELECT state,input,result FROM line_assignment_intake WHERE tenant=? AND json_extract(input,'$.groupId')=? AND json_extract(input,'$.messageId')=? LIMIT 2").bind(env.LEAF_TASK_TENANT,s.groupId,s.quotedMessageId).all();
 if((sources.results||[]).length>1)return {ok:true,recorded:false,reason:'ambiguous'};
 let candidates=[];
 for(const row of sources.results||[]){let input;try{input=JSON.parse(row.input);}catch{throw fail('INVALID_SOURCE',409);}if(input.sourceRemoved||input.sourceEdited||row.state==='suppressed')continue;if(row.state!=='issued')throw fail('SOURCE_PENDING',503);let result;try{result=JSON.parse(row.result);}catch{throw fail('INVALID_SOURCE',409);}for(const id of result.taskIds||[])candidates.push(id);}
 const direct=await db.prepare("SELECT id FROM work_items WHERE json_extract(value,'$.lineSelfSource.groupId')=? AND json_extract(value,'$.lineSelfSource.messageId')=? AND json_extract(value,'$.lineSelfSource.contract')='line-group-bot-direct-assignment-v2' LIMIT 2").bind(s.groupId,s.quotedMessageId).all();
 candidates=[...new Set([...candidates,...(direct.results||[]).map(r=>r.id)])];
 if(candidates.length!==1)return {ok:true,recorded:false,reason:candidates.length?'ambiguous':'not_found'};
 const id=candidates[0],row=await db.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first(),raw=row&&parse(row);
 if(!raw||raw.deletedAt||['done','cancelled'].includes(raw.status)||![raw.lead,...raw.collaborators||[]].some(p=>p?.account===a.account))return {ok:true,recorded:false,reason:'not_eligible'};
 const digest=await hash('line-quoted-progress:'+value.botUserId+':'+s.groupId+':'+s.messageId+':'+id),operationId='op-'+[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');
 const who={...person,id:person.id||person.userId||person.user_id||'uof:'+person.account},service=makeEditor(members),text=prefix+s.text;
 for(let attempt=0;attempt<3;attempt++){
  await members.assertCurrent?.();if(!permission(a.account))throw fail('ACCESS_DISABLED',403);
  const current=await service.get(who,id);if(current.deletedAt||['done','cancelled'].includes(current.status))return {ok:true,recorded:false,reason:'not_eligible'};
  if(![current.lead,...current.collaborators||[]].some(p=>p?.account===a.account))return {ok:true,recorded:false,reason:'not_eligible'};
  try{const updated=await service.update(who,id,{kind:'comment',operationId,version:current.version,text,mentions:[]},env.PUBLIC_ORIGIN);publish(updated);return {ok:true,recorded:true};}catch(e){if(e.status!==409||attempt===2)throw e;}
 }
}

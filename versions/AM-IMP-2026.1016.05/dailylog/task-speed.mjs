export const TASK_SPEED_POLICY='line-task-fast-notice-v1';
const digest=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function photoPlan(env,tenant,source,now=Date.now){
 const row=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-task-photos' AND key=?").bind('pilot:'+tenant).first(),pilot=row?JSON.parse(row.value):null,h=await digest(source.groupId);
 const editEnabled=!!pilot?.groups.includes(h)&&Number.isFinite(pilot.since?.[h])&&source.timestamp>=pilot.since[h];
 const pending=editEnabled&&/^\d{15,30}$/.test(source.quotedMessageId||'');
 return {speedPolicy:TASK_SPEED_POLICY,editEnabled,...(pending?{photo:{state:'pending',attempts:0,queuedAt:new Date(now()).toISOString()}}:{})};
}
export async function photoQueue(request,env,{now=Date.now}={}){
 const action=new URL(request.url).pathname.match(/^\/api\/integrations\/leaf-snail\/tasks\/(photo-next|photo-result|photo-defer)$/)?.[1];if(!action)return null;
 try{
  const key=env.LEAF_TASK_SERVICE_KEY;if(!key||key.length<32||await digest(request.headers.get('Authorization')||'')!==await digest('Bearer '+key))return json({ok:false,code:'UNAUTHORIZED'},401);
  if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
  // Small control packets; never accept message/photo data or arbitrary task updates here.
  const reader=request.body?.getReader();let bytes=[],size=0;if(!reader)return json({ok:false,code:'INVALID_REQUEST'},400);
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4096){await reader.cancel();return json({ok:false,code:'BODY_TOO_LARGE'},413);}bytes.push(...r.value);}
  const v=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))),tenant=env.LEAF_TASK_TENANT,db=env.DB;
  if(!tenant||v.tenantKey!==tenant)return json({ok:false,code:'TENANT_MISMATCH'},403);
  if(action==='photo-next'){
   const lease=crypto.randomUUID(),row=await db.prepare("UPDATE line_assignment_intake SET lease_token=?,lease_until=?,result=json_set(result,'$.photo.attempts',coalesce(json_extract(result,'$.photo.attempts'),0)+1) WHERE id=(SELECT id FROM line_assignment_intake WHERE tenant=? AND state='issued' AND notified=1 AND json_extract(result,'$.speedPolicy')=? AND json_extract(result,'$.photo.state')='pending' AND next_attempt<=? AND lease_until<=? ORDER BY created_at LIMIT 1) RETURNING *").bind(lease,now()+180000,tenant,TASK_SPEED_POLICY,now(),now()).first();
   return json({ok:true,job:row?{id:row.id,leaseToken:lease,state:'issued',input:JSON.parse(row.input),result:JSON.parse(row.result)}:null});
  }
  if(!/^[a-f0-9]{64}$/.test(v.id||'')||typeof v.leaseToken!=='string')return json({ok:false,code:'INVALID_REQUEST'},400);
  const row=await db.prepare('SELECT * FROM line_assignment_intake WHERE id=? AND tenant=?').bind(v.id,tenant).first();
  if(!row||row.state!=='issued'||row.notified!==1||row.lease_token!==v.leaseToken||row.lease_until<now())return json({ok:false,code:'LEASE_CHANGED'},409);
  const source=JSON.parse(row.input),result=JSON.parse(row.result);if(result.speedPolicy!==TASK_SPEED_POLICY||result.photo?.state!=='pending')return json({ok:false,code:'INVALID_STATE'},409);
  const cancelled=source.sourceRemoved||source.sourceEdited;
  let state=cancelled?'cancelled':action==='photo-defer'?(result.photo.attempts>=5?'failed':'pending'):v.state;
  if(!['pending','complete','unavailable','failed','cancelled'].includes(state))return json({ok:false,code:'INVALID_STATE'},400);
  if(action==='photo-result'&&!cancelled&&!['complete','unavailable'].includes(v.state))return json({ok:false,code:'INVALID_STATE'},400);
  const stored=new Map();if(state!=='pending')for(const taskId of result.taskIds){const h=await digest(row.id+':'+taskId+':'+source.quotedMessageId),attachmentId='att-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-'),file=await db.prepare('SELECT id,removed_at FROM task_attachments WHERE id=? AND scope=? AND target_id=?').bind(attachmentId,'normal',taskId).first();stored.set(taskId,!!file&&!file.removed_at);}
  if(state==='complete'&&result.taskIds.some(id=>!stored.get(id)))state='unavailable';
  const at=new Date(now()).toISOString(),next={...result,photo:{...result.photo,state,updatedAt:at}},nextAttempt=state==='pending'?now()+Math.min(300000,10000*2**Math.min(5,result.photo.attempts)):0;
  const changes=[db.prepare('UPDATE line_assignment_intake SET result=?,lease_until=0,next_attempt=? WHERE id=? AND tenant=? AND input=? AND lease_token=? AND lease_until>=?').bind(JSON.stringify(next),nextAttempt,row.id,tenant,row.input,v.leaseToken,now())];
  if(state!=='pending')for(const id of result.taskIds)changes.push(db.prepare("UPDATE work_items SET value=json_set(value,'$.assignment.photoImport',json(?),'$.version',json_extract(value,'$.version')+1,'$.updatedAt',?),revision=revision+1 WHERE id=? AND coalesce(json_extract(value,'$.deletedAt'),'')='' AND json_extract(value,'$.assignment.sourceId')=? AND json_extract(value,'$.requester.account')=? AND EXISTS(SELECT 1 FROM line_assignment_intake WHERE id=? AND tenant=? AND input=? AND lease_token=? AND json_extract(result,'$.photo.state')=?)").bind(JSON.stringify({...next.photo,state:stored.get(id)?'complete':state}),at,id,row.id,source.sender.account,row.id,tenant,row.input,v.leaseToken,state));
  const written=await db.batch(changes);if(written[0].meta.changes!==1)return json({ok:false,code:'LEASE_CHANGED'},409);
  return json({ok:true,state});
 }catch{return json({ok:false,code:'PHOTO_QUEUE_UNAVAILABLE'},503);}
}

export async function taskSpeedResponse(request,response){
 if(request.method!=='GET'||new URL(request.url).pathname!=='/tasks.js'||response.status!==200)return response;
 let s=await response.text();const needle="function bindCard(){const node=dialog();node.removeAttribute('data-task-overview');";if(s.split(needle).length!==2)throw Error('Task card status anchor changed');
 const status="node.querySelector('.task-photo-import-status')?.remove();const photoState=active?.task?.assignment?.photoImport?.state;if(photoState){const status=document.createElement('p');status.className='task-photo-import-status';status.setAttribute('role','status');status.textContent=({pending:'引用照片正在背景附入，可先編輯任務；稍後重新開啟查看。',complete:'引用照片已附入，可在下方查看。',unavailable:'引用照片未自動加入，請在附件區上傳原圖。',failed:'引用照片暫時無法加入，請在附件區上傳原圖；任務已交辦。',cancelled:'引用來源已變更，照片未繼續自動加入。'})[photoState]||'';if(status.textContent){const body=node.querySelector('.dialog-body'),taskId=active?.task?.id;body?.prepend(status);queueMicrotask(()=>{if(body?.isConnected&&active?.task?.id===taskId)body.prepend(status);});}}";
 s=s.replace(needle,needle+status);const headers=new Headers(response.headers);for(const k of ['Content-Length','ETag','Content-Encoding','Last-Modified'])headers.delete(k);headers.set('Cache-Control','private, no-store');headers.set('X-DailyLog-Task-Speed',TASK_SPEED_POLICY);return new Response(s,{status:200,headers});
}

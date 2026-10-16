// Authenticated by assignmentMachine's existing purpose-specific service key.
// No external URLs are accepted; AM submits verified same-conversation bytes.
export const PHOTO_CONTRACT='line-task-photo-selection-v1';
const error=(code,status=400)=>Object.assign(Error(code),{code,status});
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function readBody(request,max){const reader=request.body?.getReader();if(!reader)throw error('INVALID_REQUEST');const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw error('BODY_TOO_LARGE',413);}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes;}
export async function taskPhotoMachine(request,env,{tenant,now=Date.now,directory,permission,createAttachmentStore}){
 try{
  const action=new URL(request.url).pathname.split('/').at(-1),db=env.DB;
  if(action==='health'&&request.method==='GET')return json({ok:true,contract:PHOTO_CONTRACT});
  if(request.method!=='POST')throw error('METHOD_NOT_ALLOWED',405);
  const upload=action==='upload',bytes=await readBody(request,upload?10*1024*1024+65536:65536);
  const form=upload?await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData():null;
  let v;try{v=JSON.parse(upload?String(form.get('context')):new TextDecoder().decode(bytes));}catch{throw error('INVALID_REQUEST');}
  if(v.tenantKey!==tenant||!/^C[a-f0-9]{32}$/i.test(v.groupId||''))throw error('SOURCE_MISMATCH',403);
  const pilotKey='pilot:'+tenant,pilot=await db.prepare("SELECT value,revision FROM documents WHERE namespace='line-task-photos' AND key=?").bind(pilotKey).first();
  if(action==='configure'){
   if(typeof v.enabled!=='boolean')throw error('INVALID_REQUEST');
   const policy=pilot?JSON.parse(pilot.value):{groups:[],since:{}},groups=new Set(policy.groups),since={...policy.since},id=await hash(v.groupId);if(v.enabled){if(!groups.has(id))since[id]=now();groups.add(id);}else{groups.delete(id);delete since[id];}
   // Operator configuration is serialized by the same existing AM admin API.
   const encoded=JSON.stringify({groups:[...groups],since}),saved=pilot?await db.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE namespace='line-task-photos' AND key=? AND revision=?").bind(encoded,pilotKey,pilot.revision).run():await db.prepare("INSERT OR IGNORE INTO documents(namespace,key,value) VALUES('line-task-photos',?,?)").bind(pilotKey,encoded).run();if(saved.meta.changes!==1)throw error('PHOTO_VERSION_CONFLICT',409);
   return json({ok:true,enabled:v.enabled,contract:PHOTO_CONTRACT});
  }
  const enabled=!!pilot&&JSON.parse(pilot.value).groups.includes(await hash(v.groupId));
  if(action==='enabled')return json({ok:true,enabled,since:enabled?JSON.parse(pilot.value).since?.[await hash(v.groupId)]:null,contract:PHOTO_CONTRACT});
  if(!enabled)throw error('PHOTO_PILOT_DISABLED',403);
  if(!/^[a-f0-9]{64}$/.test(v.id||''))throw error('INVALID_REQUEST');
  const row=await db.prepare('SELECT * FROM line_assignment_intake WHERE id=? AND tenant=?').bind(v.id,tenant).first();
  if(!row||row.state!=='issued')throw error('NOT_ISSUED',409);
  const source=JSON.parse(row.input),result=JSON.parse(row.result);
  if(source.groupId!==v.groupId||source.sender.userId!==v.userId||source.sender.account!==v.account||source.sender.bindingId!==v.bindingId)throw error('REQUESTER_ONLY',403);
  if(source.sourceRemoved||source.sourceEdited)throw error('SOURCE_CHANGED',409);
  const members=await directory(),accounts=[source.sender.account,...source.mentions.map(m=>m.account)];
  const assertCurrent=async()=>{await members.assertCurrent?.();if(accounts.some(a=>!permission(a)||!members.people.some(p=>p.account===a)))throw error('ACCESS_DISABLED',403);
   const latest=await db.prepare('SELECT input,state FROM line_assignment_intake WHERE id=? AND tenant=?').bind(v.id,tenant).first();
   if(latest?.state!=='issued'||latest.input!==row.input)throw error('SOURCE_CHANGED',409);
   if(v.taskId){const item=await db.prepare('SELECT value FROM work_items WHERE id=?').bind(v.taskId).first(),t=item&&JSON.parse(item.value);
    if(!result.taskIds.includes(v.taskId)||!t||t.deletedAt||t.deleted||t.assignment?.sourceId!==v.id||t.requester?.account!==v.account)throw error('TASK_CHANGED',403);}
  };
  await assertCurrent();
  if(action==='context')return json({ok:true,source,result});
  if(!result.taskIds.includes(v.taskId))throw error('TASK_CHANGED',403);
  const key=v.id+':'+v.taskId,stored=await db.prepare("SELECT value,revision FROM documents WHERE namespace='line-task-photos' AND key=?").bind(key).first();
  let state=stored?JSON.parse(stored.value):null;
  const save=async next=>{await assertCurrent();if(stored){const r=await db.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE namespace='line-task-photos' AND key=? AND revision=?").bind(JSON.stringify(next),key,stored.revision).run();if(r.meta.changes!==1)throw error('PHOTO_VERSION_CONFLICT',409);}else{const r=await db.prepare("INSERT OR IGNORE INTO documents(namespace,key,value) VALUES('line-task-photos',?,?)").bind(key,JSON.stringify(next)).run();if(r.meta.changes!==1)throw error('PHOTO_VERSION_CONFLICT',409);}await assertCurrent();state=next;};
  if(action==='open'&&(!state||state.expiresAt<now()||state.phase==='done')){
   if(!Array.isArray(v.candidates)||v.candidates.length>10||v.candidates.some(c=>!/^\d{15,30}$/.test(c.messageId||'')||typeof c.name!=='string'||c.name.length>240||!Number.isFinite(Date.parse(c.at))))throw error('INVALID_CANDIDATES');
   if(new Set(v.candidates.map(c=>c.messageId)).size!==v.candidates.length)throw error('INVALID_CANDIDATES');
   const prior=[];await save({version:(state?.version||0)+1,phase:'selecting',expiresAt:now()+3600000,candidates:v.candidates.map(({messageId,name,at})=>({messageId,name,at})),selected:[],imported:prior,operations:[]});
  }
  if(!state||state.expiresAt<now())throw error('PHOTO_SESSION_EXPIRED',409);
  if(action==='select'||action==='confirm'){
   if(typeof v.operationId!=='string'||v.operationId.length>200)throw error('INVALID_OPERATION');
   if(!state.operations.includes(v.operationId)){
    if(v.version!==state.version||state.phase!=='selecting')throw error('PHOTO_VERSION_CONFLICT',409);
    const next=structuredClone(state);next.version++;next.operations=[...next.operations,v.operationId].slice(-30);
    if(action==='select'){
     if(!next.candidates.some(c=>c.messageId===v.messageId)||typeof v.selected!=='boolean')throw error('INVALID_CANDIDATE');
     next.selected=next.selected.filter(id=>id!==v.messageId);if(v.selected)next.selected.push(v.messageId);
    }else{if(!next.selected.length)throw error('NO_PHOTOS_SELECTED');next.phase='importing';}
    await save(next);
   }
  }
  if(upload){
   if(state.phase!=='importing'||!state.selected.includes(v.messageId))throw error('PHOTO_NOT_SELECTED',403);
   const file=form.get('file');if(!file||form.getAll('file').length!==1||!['image/jpeg','image/png'].includes(file.type)||file.size===0)throw error('INVALID_IMAGE');
   const data=new Uint8Array(await file.arrayBuffer()),png=data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71,jpeg=data[0]===255&&data[1]===216&&data[2]===255;
   if(file.type==='image/png'?!png:!jpeg)throw error('INVALID_IMAGE');
   const h=await hash(key+':'+v.messageId),id='att-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
   const actor=members.people.find(p=>p.account===v.account);
   await createAttachmentStore(db).upload('normal',v.taskId,actor,id,file,assertCurrent);
   const next=structuredClone(state);next.imported=[...new Set([...next.imported,v.messageId])];next.version++;await save(next);
  }
  if(action==='finish'){
   if(state.phase!=='importing'||state.selected.some(id=>!state.imported.includes(id)))throw error('PHOTO_IMPORT_INCOMPLETE',409);
   await save({...state,phase:'done',version:state.version+1});
  }
  if(!['context','open','status','select','confirm','upload','finish'].includes(action))throw error('NOT_FOUND',404);
  await assertCurrent();return json({ok:true,state});
 }catch(e){return json({ok:false,code:e.code||'PHOTO_UNAVAILABLE'},e.status||503);}
}

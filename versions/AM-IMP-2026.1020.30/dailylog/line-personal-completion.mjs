export const PERSONAL_COMPLETION_POLICY='line-completion-confirm-selected-person-v1';
const ns='line-personal-completion-reports',prefix='/api/integrations/leaf-snail/tasks/personal-completion-';
const err=(message,status=409)=>Object.assign(Error(message),{status});
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const decode=s=>JSON.parse(s);
export async function personalAuthority(request,env,readAuthority,refresh){
 let auth=await readAuthority(request,env);
 if(!auth){await refresh(request,env);auth=await readAuthority(request,env);}
 if(!auth)throw err('名單更新中，請稍後重試。',503);
 return auth;
}
async function body(r){if(Number(r.headers.get('Content-Length')||0)>20000)throw err('內容太長。',413);const reader=r.body?.getReader();if(!reader)throw err('缺少確認內容。',400);let s='',n=0;const d=new TextDecoder();for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>20000){await reader.cancel();throw err('內容太長。',413);}s+=d.decode(v.value,{stream:true});}try{return JSON.parse(s+d.decode());}catch{throw err('確認內容格式錯誤。',400);}}
async function load(db,id){const r=await db.prepare('SELECT value,revision FROM documents WHERE namespace=? AND key=?').bind(ns,id).first();return r?{value:decode(r.value),revision:r.revision}:null;}
async function save(db,id,value,revision){const r=revision===null?await db.prepare('INSERT OR IGNORE INTO documents(namespace,key,value,revision) VALUES(?,?,?,1)').bind(ns,id,JSON.stringify(value)).run():await db.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=?').bind(JSON.stringify(value),ns,id,revision).run();return r.meta.changes===1;}
const publicReport=r=>r?{id:r.id,state:r.state,snapshot:r.snapshot,version:r.version,error:r.error||'',sentAt:r.sentAt||null,actor:r.actor,completionActor:r.completionActor,recipientName:r.recipientName,recipientAccount:r.recipient.account,result:r.result,url:r.url,title:r.title}:null;
async function context(env,id,recipientAccount){
 if(typeof recipientAccount!=='string'||!/^[-a-zA-Z0-9_.]{1,80}$/.test(recipientAccount))throw err('請先從組織名單選擇收件人。',400);
 if(!/^work-[0-9a-f-]{36}$/.test(id||''))throw err('找不到原任務。',404);
 const row=await env.DB.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first(),t=row&&decode(row.value);
 if(!t||t.deletedAt||t.workScope||t.hrExecution)throw err('這項任務目前無法回報完成。',404);
 if(t.status!=='done')throw err('請先完成整項任務，再確認回報。');
 const event=[...(t.history||[])].reverse().find(h=>(h.to==='done'&&h.from!=='done')||(h.wholeTo==='done'&&h.wholeFrom!=='done')||(h.after?.status==='done'&&h.before?.status!=='done'));
 if(!event?.id||!event.actor?.account)throw err('缺少可確認的完成紀錄。');
 if(t.meetingSource?.withdrawn||t.assignment?.sourceRemoved||t.assignment?.sourceEdited)throw err('原任務來源已撤回或變更，請先確認。');
 const recipient={account:recipientAccount};
 const result=(t.finalResult||event.resultChange?.after||event.text||'').trim();if(!result)throw err('請先填寫完成結果。');
 const reportId=await hash(id+':'+event.id+':'+recipientAccount),url=new URL('/?task='+encodeURIComponent(id),env.PUBLIC_ORIGIN).href;
 const snapshot=await hash(JSON.stringify([t.version,t.title,result,event.id,event.actor,recipientAccount]));
 return {taskId:id,version:t.version,title:t.title,result,url,cycle:event.id,id:reportId,snapshot,completionActor:event.actor,executors:[t.lead,...t.collaborators||[]].map(p=>p.account),recipient};
}
async function allowed(env,c,auth){if(!auth||!c.executors.includes(auth.account)||c.completionActor.account!==auth.account)throw err('請由完成整項任務的目前負責同仁確認回報。',403);await auth.verify?.();}
async function am(env,input){const origin=env.AMCORE_MEETING_MANAGEMENT_ORIGIN;if(!origin||!env.LEAF_TASK_SERVICE_KEY)throw err('LINE 回報服務尚未連接。',503);try{const r=await fetch(new URL('/integrations/task-personal-completion-report',origin),{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.LEAF_TASK_SERVICE_KEY},body:JSON.stringify({tenantKey:env.LEAF_TASK_TENANT,...input}),signal:AbortSignal.timeout(45000)}),v=await r.json();if(!r.ok||!v.ok)throw err(v.error||'回報尚未確認，請稍後重試原操作。',r.status>=400?r.status:503);return v;}catch(e){if(e.status)throw e;throw err('回報尚未確認，請稍後重試原操作。',503);}}
async function validateReport(env,r,authority){const c=await context(env,r.taskId,r.recipient.account);if(c.id!==r.id||c.snapshot!==r.taskSnapshot)throw err('任務已更新或重新開啟，原回報停止。');const auth=await authority(env,r.sessionHash,r.actor.account);await allowed(env,c,auth);return c;}
export async function personalCompletionRoute(request,env,{readAuthority,authority,now=Date.now}={}){
 const path=new URL(request.url).pathname,match=path.match(/^\/api\/tasks\/(work-[0-9a-f-]{36})\/line-personal-report$/),machine=path.startsWith(prefix);
 const directory=path==='/api/tasks/personal-completion-directory';if(!match&&!machine&&!directory)return null;
 try{
  if(directory){if(request.method!=='GET')throw err('Method not allowed',405);const a=await readAuthority(request,env);const data=await am(env,{action:'directory',account:a.account});await a.verify();return json(data);}
  if(machine){
   if(!env.LEAF_TASK_SERVICE_KEY||env.LEAF_TASK_SERVICE_KEY.length<32||await hash(request.headers.get('Authorization')||'')!==await hash('Bearer '+env.LEAF_TASK_SERVICE_KEY))throw err('Unauthorized',401);
   if(path===prefix+'health'&&request.method==='GET')return json({ok:true,policy:PERSONAL_COMPLETION_POLICY,automaticSend:false});
   if(request.method!=='POST')throw err('Method not allowed',405);
   const v=await body(request);if(v.tenantKey!==env.LEAF_TASK_TENANT)throw err('Tenant mismatch',403);
   if(path===prefix+'context')return json({ok:true,context:await context(env,v.taskId,v.recipientAccount)});
   let stored=await load(env.DB,v.id);if(!stored)throw err('找不到已確認的回報。',404);let r=stored.value;
   if(path===prefix+'receipt'){
    if(r.state==='sent')return json({ok:true,report:publicReport(r)});
    if(r.lease!==v.lease||!['sent','failed','unknown'].includes(v.state))throw err('回報確認碼已變更。');
    r={...r,state:v.state,error:v.state==='sent'?'':v.state==='unknown'?'傳送結果尚未確認，請重試原回報。':'尚未送出，請確認收件人身分後重試原回報。',sentAt:v.state==='sent'?new Date(now()).toISOString():null,requestId:String(v.requestId||'').slice(0,200),leaseUntil:0};
    if(!await save(env.DB,r.id,r,stored.revision))throw err('回報正在更新，請重試原操作。');return json({ok:true,report:publicReport(r)});
   }
   if(![prefix+'claim',prefix+'validate'].includes(path))throw err('Not found',404);
   if(r.state==='sent')return json({ok:true,report:publicReport(r),sent:true});
   await validateReport(env,r,authority);
   if(r.firstAttemptAt&&now()-r.firstAttemptAt>23*3600000)throw err('回報確認期限已過，請先查核原個人對話，避免重複傳送。');
   if(path===prefix+'validate'){if(r.lease!==v.lease||r.leaseUntil<now())throw err('回報確認碼已到期。');return json({ok:true,context:r});}
   if(r.leaseUntil>now())throw err('回報正在傳送，請稍後查看。');
   r={...r,state:'sending',firstAttemptAt:r.firstAttemptAt||now(),lease:crypto.randomUUID(),leaseUntil:now()+90000,error:''};
   if(!await save(env.DB,r.id,r,stored.revision))throw err('回報正在傳送，請稍後查看。');return json({ok:true,context:r});
  }
  if(!['GET','POST'].includes(request.method))throw err('Method not allowed',405);
  const auth=await readAuthority(request,env),input=request.method==='POST'?await body(request):{recipientAccount:new URL(request.url).searchParams.get('recipientAccount')},c=await context(env,match[1],input.recipientAccount);await allowed(env,c,auth);
  const stored=await load(env.DB,c.id);
  if(request.method==='GET'){
   const remote=stored?.value.state==='sent'?{recipient:{name:stored.value.recipientName}}:await am(env,{action:'preview',taskId:c.taskId,recipientAccount:c.recipient.account});await auth.verify();
   return json({ok:true,preview:{id:c.id,version:c.version,snapshot:stored?.value.snapshot||await hash(c.snapshot+':'+remote.recipient.userId),title:c.title,result:c.result,url:c.url,completionActor:c.completionActor,recipientName:remote.recipient.name,recipientAccount:c.recipient.account},report:publicReport(stored?.value)});
  }
  if(request.headers.get('Origin')!==env.PUBLIC_ORIGIN||request.headers.get('X-DailyLog-CSRF')!==auth.csrf)throw err('請重新登入後再確認回報。',403);
  const v=input;if(v.confirm!==true||v.id!==c.id)throw err('請先確認回報內容。',400);
  if(stored){if(stored.value.actor.account!==auth.account)throw err('這筆回報已由其他同仁確認。',403);if(stored.value.state==='sent')return json({ok:true,report:publicReport(stored.value)});if(v.snapshot!==stored.value.snapshot||c.snapshot!==stored.value.taskSnapshot)throw err('回報內容已改變，原回報停止，請先查核原個人對話。');
   if(!stored.value.leaseUntil||stored.value.leaseUntil<=now()){const token=/\bdailylog_session=([a-f0-9]{64})\b/.exec(request.headers.get('cookie')||'')?.[1];if(!await save(env.DB,c.id,{...stored.value,sessionHash:await hash(token)},stored.revision))throw err('回報正在更新，請稍後查看。');}
  }
  else{
   if(v.version!==c.version)throw err('任務已更新，請重新確認回報內容。');
   const remote=await am(env,{action:'preview',taskId:c.taskId,recipientAccount:c.recipient.account});await auth.verify();const current=await context(env,c.taskId,c.recipient.account);if(current.snapshot!==c.snapshot)throw err('任務已更新，請重新確認。');
   const cookie=/\bdailylog_session=([a-f0-9]{64})\b/.exec(request.headers.get('cookie')||'')?.[1];
   if(v.snapshot!==await hash(c.snapshot+':'+remote.recipient.userId))throw err('收件人身分或內容已變更，請重新預覽。');
   const r={...c,taskSnapshot:c.snapshot,snapshot:v.snapshot,actor:{account:auth.account,name:auth.profile.name||auth.user.name||auth.account},sessionHash:await hash(cookie),recipient:remote.recipient,recipientName:remote.recipient.name,state:'confirmed',retryKey:crypto.randomUUID(),createdAt:new Date(now()).toISOString(),leaseUntil:0};
   if(!await save(env.DB,c.id,r,null))throw err('這筆回報已確認，請重新查看。');
  }
  await am(env,{action:'send',id:c.id});const latest=await load(env.DB,c.id);return json({ok:true,report:publicReport(latest.value)});
 }catch(e){return json({ok:false,error:e.status?e.message:'回報服務暫時無法確認，請保留內容後重試。'},e.status||503);}
}

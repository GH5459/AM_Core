// Explicit, read-only snapshots. No LINE sending or task permission changes.
const ns='journal-shares-v1',previewNs='journal-share-previews-v1';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const load=async(db,space,key)=>{const r=await db.prepare('SELECT value,revision FROM documents WHERE namespace=? AND key=?').bind(space,key).first();return r?{...r,value:JSON.parse(r.value)}:null;};
async function body(request){const text=await request.text();if(new TextEncoder().encode(text).length>30000)throw fail('分享資料太長。',413);try{return JSON.parse(text);}catch{throw fail('分享格式不正確。',400);}}
async function roster(env,auth){
 const [central,directory,org,access]=await Promise.all([load(env.DB,'central-personnel','snapshot'),load(env.DB,'shared-directory','current'),load(env.DB,'settings','organization'),load(env.DB,'settings','access')]);
 const people=central?.value.employees||directory?.value.people;
 if(!Array.isArray(people))throw fail('公司同仁名單暫時無法確認。',503);
 // readAuthority checks the current central metadata before this projection.
 const placement=new Map((org?.value.people||[]).map(p=>[p.account,p]));
 return {revision:central?.value.revision||directory?.value.revision,people:people.map(p=>({account:p.account,name:p.name,department:p.department||p.team||'',canOpen:!!access?.value.accounts?.[p.account]?.enabled,departments:(placement.get(p.account)?.affiliations||[]).map(a=>a.departmentId)})),departments:org?.value.departments||[]};
}
async function taskContext(env,id,auth){
 if(!/^work-[a-f0-9-]{36}$/.test(id||''))throw fail('找不到任務。',404);
 const row=await env.DB.prepare('SELECT value,revision FROM work_items WHERE id=?').bind(id).first(),t=row&&JSON.parse(row.value);
 if(!t||t.deletedAt||t.workScope||t.hrExecution||![t.lead,...t.collaborators||[]].some(p=>p?.account===auth.account))throw fail('請由目前執行同仁分享這項任務。',403);
 if(t.meetingSource?.withdrawn||t.assignment?.sourceRemoved||t.assignment?.sourceEdited)throw fail('任務來源已變更，請先確認。');
 const own=(t.participantProgress||[]).find(p=>p.account===auth.account),events=(t.history||[]).filter(h=>h.actor?.account===auth.account);
 const last=events.filter(h=>h.resultChange?.after||['comment','progress','status','personal_status','result'].includes(h.kind)&&h.text&&!h.text.startsWith('上傳附件：')).at(-1);
 const done=t.status==='done',personalDone=!done&&own?.status==='done';
 const completeEvent=[...(t.history||[])].reverse().find(h=>h.to==='done'&&h.from!=='done'||h.wholeTo==='done'&&h.wholeFrom!=='done'||h.after?.status==='done'&&h.before?.status!=='done');
 const content=done?t.finalResult||completeEvent?.resultChange?.after||completeEvent?.text:personalDone?own?.result||own?.finalResult||last?.resultChange?.after||last?.text:last?.text||last?.resultChange?.after;
 if(!content?.trim())throw fail('請先儲存完成結果或進度，再分享。');
 const snapshot={taskId:id,version:t.version,title:t.title,category:done?'done':'progress',personalDone,result:content,actor:{account:auth.account,name:auth.profile?.name||auth.user?.name||auth.account},completedBy:done?completeEvent?.actor||null:null,updatedAt:t.updatedAt||last?.at||t.completedAt,completedAt:done?t.completedAt:null,meetingId:t.meetingSource?.workspaceId||null};
 return {row,t,snapshot,digest:await hash(row.value)};
}
async function remote(env,input){
 if(!env.AMCORE_MEETING_MANAGEMENT_ORIGIN||!env.LEAF_TASK_SERVICE_KEY)throw fail('群組與會議名單尚未連接。',503);
 try{const r=await fetch(new URL('/integrations/journal-sharing',env.AMCORE_MEETING_MANAGEMENT_ORIGIN),{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.LEAF_TASK_SERVICE_KEY},body:JSON.stringify({tenantKey:env.LEAF_TASK_TENANT,...input}),signal:AbortSignal.timeout(45000)}),v=await r.json();if(!r.ok||!v.ok)throw fail(v.error||'名單尚未確認，請稍後重試。',r.status>=400?r.status:503);return v;}catch(e){if(e.status)throw e;throw fail('名單暫時無法讀取，請稍後重試。',503);}
}
async function recipients(env,auth,input,context,org){
 const accounts=input.accounts||[];
 if(!Array.isArray(accounts)||accounts.length>1000||accounts.some(a=>typeof a!=='string'))throw fail('請重新選擇分享對象。',400);
 const known=new Map(org.people.map(p=>[p.account,p])),selected=new Set(accounts),sources=[],warnings=[];
 if(accounts.some(a=>!known.has(a)))throw fail('分享對象已不在公司名單，請重新選擇。');
 if(input.groupKey||input.meeting){
  if(input.meeting&&!context.snapshot.meetingId)throw fail('這不是會議指派的任務。',400);
  const r=await remote(env,{action:'resolve',account:auth.account,groupKey:input.groupKey||null,meetingId:input.meeting?context.snapshot.meetingId:null});
  for(const a of r.accounts||[]){if(known.has(a))selected.add(a);else warnings.push('部分對象已不在目前公司名單。');}
  sources.push(...r.sources||[]);warnings.push(...r.warnings||[]);
 }
 selected.delete(auth.account);if(!selected.size)throw fail('請至少選擇一位其他同仁。',400);
 const people=[...selected].sort().map(a=>known.get(a));if(people.length>1000)throw fail('一次分享人數過多。',400);
 const unopened=people.filter(p=>!p.canOpen);if(unopened.length)warnings.push(unopened.length+' 位同仁尚未開通工作日誌；分享會保留，開通後才能查看。');
 return {people,sources,warnings:[...new Set(warnings)]};
}
export async function journalSharingRoute(request,env,{readAuthority,now=Date.now}={}){
 const url=new URL(request.url),p=url.pathname;
 const old=/^\/api\/tasks\/(?:work-[a-f0-9-]{36}\/(?:line-personal-report|line-completion-report)|personal-completion-directory)$/.test(p)||/^\/api\/integrations\/leaf-snail\/tasks\/(?:personal-completion|completion)-(?:claim|validate|context)$/.test(p);
 if(!p.startsWith('/api/journal-sharing')&&!old)return null;
 try{
  const auth=await readAuthority(request,env);if(!auth)throw fail('請重新開啟工作日誌後再試。',401);
  if(old){await auth.verify();return json({error:'LINE 完成通知已停用，請改用「分享至工作日誌」。'},410);}
  if(!['GET','POST'].includes(request.method))throw fail('不支援此操作。',405);
  if(request.method==='POST'&&(request.headers.get('Origin')!==env.PUBLIC_ORIGIN||request.headers.get('X-DailyLog-CSRF')!==auth.csrf||!request.headers.get('Content-Type')?.startsWith('application/json')))throw fail('請重新整理後再分享。',403);
  if(p==='/api/journal-sharing/receipt'&&request.method==='GET'){const id=url.searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))throw fail('分享識別不正確。',400);const r=await load(env.DB,previewNs,id);if(!r||r.value.actor!==auth.account)throw fail('找不到本人分享。',404);await auth.verify();return json({state:r.value.state,date:r.value.date,previewId:id,snapshot:r.value.snapshot,...r.value.resolved});}
  const org=await roster(env,auth);
  if(p==='/api/journal-sharing/directory'&&request.method==='GET'){await auth.verify();return json({organization:org});}
  if(p==='/api/journal-sharing/groups'&&request.method==='GET'){const result=await remote(env,{action:'groups',account:auth.account,offset:Number(url.searchParams.get('offset')||0)});await auth.verify();return json(result);}
  if(p==='/api/journal-sharing/inbox'&&request.method==='GET'){
   const date=url.searchParams.get('date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date)))throw fail('日期不正確。',400);
   const prefix=auth.account+':'+date+':',after=url.searchParams.get('after')||prefix;
   if(!after.startsWith(prefix)||after.length>160)throw fail('頁次不正確。',400);
   const rows=(await env.DB.prepare('SELECT key,value FROM documents WHERE namespace=? AND key>? AND key<? ORDER BY key LIMIT 101').bind(ns,after,prefix+'~').all()).results;
   await auth.verify();return json({date,items:rows.slice(0,100).map(r=>JSON.parse(r.value)),next:rows.length>100?rows[99].key:null});
  }
  if(p!=='/api/journal-sharing/share'||request.method!=='POST')throw fail('找不到此分享入口。',404);
  const input=await body(request);
  if(input.action==='confirm'){
   if(!/^[a-f0-9-]{36}$/.test(input.previewId||''))throw fail('請先預覽分享內容。',400);
   const saved=await load(env.DB,previewNs,input.previewId),v=saved?.value;
   if(!v||v.actor!==auth.account)throw fail('找不到本人分享預覽。',404);
   if(v.state==='sent'){await auth.verify();return json({ok:true,state:'sent',count:v.people.length,date:v.date});}
   if(v.expiresAt<now())throw fail('預覽已過期，請重新確認內容及對象。');
   const c=await taskContext(env,v.taskId,auth);if(c.digest!==v.digest)throw fail('任務已更新，請重新預覽後分享。');
   const resolved=await recipients(env,auth,v.selection,c,org);
   if(JSON.stringify(resolved)!==JSON.stringify(v.resolved))throw fail('分享名單已變更，請重新預覽。');
   await auth.verify();
   const sentAt=new Date(now()).toISOString(),date=day(sentAt),receipt={...v,state:'sent',date,sentAt};
   const guard="EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND json_extract(value,'$.state')='sent' AND json_extract(value,'$.sentAt')=?)";
   const batch=[env.DB.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND revision=? AND EXISTS(SELECT 1 FROM work_items WHERE id=? AND value=?)").bind(JSON.stringify(receipt),previewNs,input.previewId,saved.revision,c.t.id,c.row.value)];
   // One atomic statement fans out to all recipients; retries cannot duplicate.
   const eventKey=await hash([v.taskId,c.t.version,auth.account,v.snapshot.category].join(':'));
   batch.push(env.DB.prepare(`INSERT OR IGNORE INTO documents(namespace,key,value) SELECT ?,json_extract(j.value,'$.account')||':'||?||':'||?,? FROM json_each(?) j WHERE ${guard}`).bind(ns,date,eventKey,JSON.stringify({...v.snapshot,id:eventKey,date,sharedAt:sentAt,sources:v.resolved.sources}),JSON.stringify(v.people),previewNs,input.previewId,sentAt));
   const result=await env.DB.batch(batch);if(result[0].meta.changes!==1){const latest=await load(env.DB,previewNs,input.previewId);if(latest?.value.state!=='sent')throw fail('內容或分享狀態已改變，請重新確認。');}
   return json({ok:true,state:'sent',count:v.people.length,date});
  }
  if(input.action!=='preview')throw fail('請先預覽分享內容。',400);
  const c=await taskContext(env,input.taskId,auth),selection={accounts:input.accounts||[],groupKey:input.groupKey||null,meeting:input.meeting===true},resolved=await recipients(env,auth,selection,c,org);
  await auth.verify();const id=crypto.randomUUID(),v={actor:auth.account,taskId:c.t.id,state:'preview',digest:c.digest,snapshot:c.snapshot,people:resolved.people,resolved,selection,expiresAt:now()+10*60000};
  await env.DB.prepare('INSERT INTO documents(namespace,key,value) VALUES(?,?,?)').bind(previewNs,id,JSON.stringify(v)).run();
  return json({ok:true,previewId:id,snapshot:c.snapshot,...resolved});
 }catch(e){return json({error:e.status?e.message:'分享暫時無法確認，請保留畫面並重試。'},e.status||503);}
}

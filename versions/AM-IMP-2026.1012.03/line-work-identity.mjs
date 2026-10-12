// Work identity is established by a private, authenticated OA entry plus the
// user's existing company login. This never enables or changes UOF approvals.
export const LINE_WORK_LOGIN_CONTRACT='line-first-work-login-v1';
const json=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const native=v=>typeof v==='string'&&/^U[a-f0-9]{32}$/i.test(v);
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const opaque=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function read(db,namespace,key){const r=await db.prepare('SELECT value,revision FROM documents WHERE namespace=? AND key=?').bind(namespace,key).first();return r?{value:JSON.parse(r.value),revision:r.revision}:null;}
async function input(request){const reader=request.body?.getReader();if(!reader)throw fail('請重新開啟工作日誌入口。');let size=0,chunks=[];for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8192){await reader.cancel();throw fail('請重新開啟工作日誌入口。');}chunks.push(r.value);}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('請重新開啟工作日誌入口。');}}
const identityKey=(bot,id)=>'line:'+bot+':'+id,accountKey=(bot,account)=>'account:'+bot+':'+account;
export async function claimLineWorkIdentity({db,ticket,auth,freshAuthenticated=false,now=Date.now}){
 if(!auth.authenticated||!auth.user?.account)throw fail('請先登入工作日誌。',401);
 if(auth.access?.enabled!==true)throw fail('工作日誌尚未開通，請聯絡管理者。',403);
 if(!/^[A-Za-z0-9_-]{43}$/.test(ticket||''))throw fail('登入入口已失效，請重新從葉小蝸開啟工作日誌。',410);
 const key=await hash(ticket),saved=await read(db,'line-work-entry-tickets',key),v=saved?.value,account=auth.user.account;
 if(!v||v.expiresAt<=now())throw fail('登入入口已過期，請重新從葉小蝸開啟工作日誌。',410);
 if(v.expectedAccount&&v.expectedAccount!==account)throw fail('目前登入帳號與原有 LINE 身分不一致，請改用本人的工作帳號。',409);
 if(v.claimedAccount&&v.claimedAccount!==account)throw fail('這個登入入口已使用，請重新從葉小蝸開啟。',409);
 const lineKey=identityKey(v.botUserId,v.lineUserId),reverseKey=accountKey(v.botUserId,account);
 const [line,reverse]=await Promise.all([read(db,'line-work-identities',lineKey),read(db,'line-work-identities',reverseKey)]);
 if(line&&line.value.account!==account||reverse&&reverse.value.lineUserId!==v.lineUserId)throw fail('這個 LINE 或公司帳號已有不同的身分紀錄，請聯絡管理者核對。',409);
 if(v.claimedAccount===account&&line?.value.account===account&&reverse?.value.lineUserId===v.lineUserId)return {ok:true,lineIdentityConfirmed:true,alreadyConfirmed:true};
 // A pre-existing browser session must never link a new LINE identity. Require
 // the successful result of this request's original company login handler.
 if(!freshAuthenticated&&v.expectedAccount!==account)throw fail('請登入本人的公司帳號，以確認 LINE 身分。',403);
 const value={contract:LINE_WORK_LOGIN_CONTRACT,identityId:line?.value.identityId||'work-line-'+crypto.randomUUID(),botUserId:v.botUserId,lineUserId:v.lineUserId,account,lineDisplayName:v.lineDisplayName,confirmedAt:new Date(now()).toISOString(),proof:'private-oa-entry-and-company-login'};
 const unused="EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-entry-tickets' AND key=? AND revision=? AND json_extract(value,'$.claimedAccount') IS NULL AND json_extract(value,'$.expiresAt')>?)";
 const lineStatement=db.prepare(`INSERT OR IGNORE INTO documents(namespace,key,value) SELECT 'line-work-identities',?,? WHERE ${unused} AND NOT EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-identities' AND key=? AND json_extract(value,'$.lineUserId')<>?)`).bind(lineKey,JSON.stringify(value),key,saved.revision,now(),reverseKey,v.lineUserId);
 const reverseStatement=db.prepare(`INSERT OR IGNORE INTO documents(namespace,key,value) SELECT 'line-work-identities',?,? WHERE ${unused} AND EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-identities' AND key=? AND json_extract(value,'$.account')=?)`).bind(reverseKey,JSON.stringify(value),key,saved.revision,now(),lineKey,account);
 const consume=db.prepare(`UPDATE documents SET value=json_set(value,'$.claimedAccount',?,'$.claimedAt',?),revision=revision+1 WHERE namespace='line-work-entry-tickets' AND key=? AND revision=? AND json_extract(value,'$.claimedAccount') IS NULL AND json_extract(value,'$.expiresAt')>? AND EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-identities' AND key=? AND json_extract(value,'$.account')=?) AND EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-identities' AND key=? AND json_extract(value,'$.lineUserId')=?)`).bind(account,now(),key,saved.revision,now(),lineKey,account,reverseKey,v.lineUserId);
 const results=await db.batch([lineStatement,reverseStatement,consume]);
 if(results[2].meta.changes!==1)throw fail('登入入口已使用或資料已變更，請重新從葉小蝸開啟。',409);
 return {ok:true,lineIdentityConfirmed:true};
}
async function session(request,env,ctx,base){const r=await base.fetch(new Request(new URL('/api/auth/session',request.url),{headers:{Cookie:request.headers.get('cookie')||''}}),env,ctx);if(!r.ok)throw fail('無法確認登入狀態，請稍後再試。',r.status);return r.json();}
export async function lineWorkIdentityFetch(request,env,ctx,base){
 const url=new URL(request.url),path=url.pathname,machine=['identity','login-entry','login-health'].some(name=>path==='/api/integrations/leaf-snail/tasks/'+name);
 const operation=path.split('/').at(-1);
 if(path==='/api/auth/login'&&request.method==='POST'&&request.headers.get('x-dailylog-line-entry')==='1'){
  try{
  const body=await input(request.clone());if(!body.lineEntry)return null;const ticket=body.lineEntry;delete body.lineEntry;
  const login=await base.fetch(new Request(request,{body:JSON.stringify(body)}),env,ctx);if(!login.ok)return login;
  const auth=await login.clone().json();try{const result=await claimLineWorkIdentity({db:env.DB,ticket,auth,freshAuthenticated:true});
   const headers=new Headers(login.headers);headers.set('Cache-Control','no-store');return new Response(JSON.stringify({...auth,...result}),{status:200,headers});
  }catch(e){const headers=new Headers(login.headers);headers.set('Content-Type','application/json');return new Response(JSON.stringify({error:'登入成功，但 LINE 身分未確認：'+e.message,lineIdentityConfirmed:false}),{status:e.status||503,headers});}
  }catch(e){return json({error:e.message||'請重新從葉小蝸開啟登入入口。'},e.status||400);}
 }
 if(path!=='/line-login'&&path!=='/api/auth/line-entry-info'&&path!=='/api/auth/line-work-identity'&&!(machine&&['identity','login-entry','login-health'].includes(operation)))return null;
 try{
  if(machine){
   if(!env.LEAF_TASK_SERVICE_KEY||await hash(request.headers.get('authorization')||'')!==await hash('Bearer '+env.LEAF_TASK_SERVICE_KEY))return json({ok:false,code:'UNAUTHORIZED'},401);
   if(operation==='login-health'&&request.method==='GET')return json({ok:true,contract:LINE_WORK_LOGIN_CONTRACT,tenant:env.LEAF_TASK_TENANT,manualPairingRequired:false,uofApprovalRequired:false});
   if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
   const v=await input(request);if(v.tenantKey!==env.LEAF_TASK_TENANT||!native(v.botUserId)||!native(v.lineUserId))return json({ok:false,code:'INVALID_IDENTITY_SOURCE'},403);
   if(operation==='identity'){const row=await read(env.DB,'line-work-identities',identityKey(v.botUserId,v.lineUserId));const p=row?.value;return json({ok:true,identity:p?{userId:p.lineUserId,account:p.account,identityId:p.identityId}:null});}
   if(typeof v.eventId!=='string'||!v.eventId||v.eventId.length>150||!Number.isSafeInteger(v.timestamp)||Math.abs(Date.now()-v.timestamp)>300000||typeof v.lineDisplayName!=='string'||v.lineDisplayName.length>120)throw fail('登入來源已失效。',403);
   if(v.expectedAccount!==undefined&&v.expectedAccount!==null&&(typeof v.expectedAccount!=='string'||!v.expectedAccount||v.expectedAccount.length>100))throw fail('登入來源已失效。',403);
   const eventKey=await hash(v.botUserId+':'+v.eventId),prior=await read(env.DB,'line-work-entry-events',eventKey);
   let ticket=prior?.value.expiresAt>Date.now()?prior.value.ticket:null;
   if(!ticket){ticket=opaque();const expiresAt=Date.now()+600000,value={botUserId:v.botUserId,lineUserId:v.lineUserId,lineDisplayName:v.lineDisplayName,expectedAccount:v.expectedAccount||null,expiresAt};
    const record={ticket,expiresAt};await env.DB.batch([env.DB.prepare("INSERT INTO documents(namespace,key,value) VALUES('line-work-entry-tickets',?,?)").bind(await hash(ticket),JSON.stringify(value)),env.DB.prepare("INSERT INTO documents(namespace,key,value) VALUES('line-work-entry-events',?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,revision=documents.revision+1").bind(eventKey,JSON.stringify(record))]);
   }
   return json({ok:true,loginUrl:new URL('/line-login?ticket='+ticket+'&openExternalBrowser=1',env.PUBLIC_ORIGIN).href,contract:LINE_WORK_LOGIN_CONTRACT});
  }
  if(path==='/api/auth/line-work-identity'){
   if(request.method!=='POST')throw fail('請重新登入。',405);const auth=await session(request,env,ctx,base);
   if(request.headers.get('origin')!==url.origin||request.headers.get('x-dailylog-csrf')!==auth.csrfToken||!request.headers.get('content-type')?.startsWith('application/json'))throw fail('登入驗證已失效，請重新整理。',403);
   const v=await input(request);return json(await claimLineWorkIdentity({db:env.DB,ticket:v.ticket,auth}));
  }
  if(path==='/api/auth/line-entry-info'){
   const ticket=url.searchParams.get('ticket');if(request.method!=='GET'||!/^[A-Za-z0-9_-]{43}$/.test(ticket||''))throw fail('登入入口已失效。',410);
   const row=await read(env.DB,'line-work-entry-tickets',await hash(ticket));if(!row||row.value.expiresAt<=Date.now())throw fail('登入入口已過期，請重新從葉小蝸開啟。',410);
   return json({ok:true,lineDisplayName:row.value.lineDisplayName,firstWorkLogin:true});
  }
  if(request.method!=='GET')throw fail('請重新開啟工作日誌。',405);const ticket=url.searchParams.get('ticket');if(!/^[A-Za-z0-9_-]{43}$/.test(ticket||''))throw fail('登入入口已失效，請重新從葉小蝸開啟。',410);
  const saved=await read(env.DB,'line-work-entry-tickets',await hash(ticket));if(!saved||saved.value.expiresAt<=Date.now())throw fail('登入入口已過期，請重新從葉小蝸開啟。',410);
  const auth=await session(request,env,ctx,base),value=saved.value;
  const linked=await read(env.DB,'line-work-identities',identityKey(value.botUserId,value.lineUserId));
  if(auth.authenticated&&auth.access?.enabled===true&&linked?.value.account===auth.user?.account)return Response.redirect(new URL('/',request.url),303);
  if(auth.authenticated&&auth.access?.enabled===true&&value.expectedAccount===auth.user?.account){await claimLineWorkIdentity({db:env.DB,ticket,auth});return Response.redirect(new URL('/',request.url),303);}
  return new Response(null,{status:303,headers:{Location:new URL('/login?lineEntry='+encodeURIComponent(ticket),request.url).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch(e){return json({ok:false,error:e.message||'無法確認 LINE 身分，請稍後再試。'},e.status||503);}
}

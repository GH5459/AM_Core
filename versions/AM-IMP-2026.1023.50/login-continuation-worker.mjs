const bytes=new TextEncoder(),hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',bytes.encode(s)));
const random=()=>{const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const failure=()=>Object.assign(Error('登入接續未完成，請使用原登入入口。'),{status:401});
const diagnostic=error=>/^CONTINUATION_[A-Z_]{1,50}$/.test(error?.diagnostic||'')?error.diagnostic:'CONTINUATION_UNCONFIRMED';
const secureHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
const json=(v,status=200)=>Response.json(v,{status,headers:secureHeaders});
const cookie=(site,value,ttl=0)=>'__Host-'+site+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+Math.max(0,Math.floor(ttl));
const readCookie=(request,name)=>request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const redirect=(url,cookies=[])=>{const headers=new Headers({...secureHeaders,Location:url});for(const c of cookies)headers.append('Set-Cookie',c);return new Response(null,{status:303,headers});};
const browserStep=(endpoint,fallback)=>{
  const data=JSON.stringify({endpoint,fallback}).replaceAll('<','\\u003c');
  return new Response('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>接續登入</title><p id="status">正在接續有效登入…</p><a id="retry" hidden>使用原登入入口</a><script>(async()=>{const b='+data+';history.replaceState(null,"",location.pathname);try{const r=await fetch(b.endpoint,{credentials:"same-origin",cache:"no-store"}),v=await r.json();if(!r.ok||!v.url)throw Error();location.replace(v.url);}catch{document.getElementById("status").textContent="正在返回原功能登入頁…";const a=document.getElementById("retry");a.href=b.fallback;a.hidden=false;location.replace(b.fallback);}})();</script></html>',{headers:{...secureHeaders,'Content-Type':'text/html; charset=utf-8'}});
};
const origins=env=>({dailylog:env.DAILYLOG_PUBLIC_ORIGIN||'https://dailylog.chatgpt-673.workers.dev',uof:env.UOF_PUBLIC_ORIGIN||'https://uof-line.ghotel.tw',meetings:env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com'});
const defaults={dailylog:'/',uof:'/Line/Review',meetings:'/meetings/review/hub'};
function allowedPath(site,u){return site==='dailylog'?['/','/index.html','/xiaoye','/supervisor','/tasks','/journal'].includes(u.pathname):site==='uof'?['/Line/Review','/Line/Control'].includes(u.pathname):u.pathname==='/meetings/review/hub'||/^\/meetings\/review\/work\/[a-f0-9]{64}$/.test(u.pathname);}
function navigation(env,v){const o=origins(env);if(!o[v.target]||!/^[a-f0-9]{64}$/.test(v.challenge||''))throw failure();const u=new URL(v.returnPath||defaults[v.target],o[v.target]);if(u.origin!==o[v.target]||u.hash||!allowedPath(v.target,u))throw failure();return {...v,returnPath:u.pathname+u.search};}
function originalLogin(env,target,returnPath){const o=origins(env),v=navigation(env,{target,returnPath,challenge:'0'.repeat(64)}),url=new URL(target==='dailylog'?'/login':target==='uof'?'/Account/Login':v.returnPath,o[target]);url.searchParams.set('continuation','skip');if(target!=='meetings')url.searchParams.set(target==='dailylog'?'returnTo':'ReturnUrl',v.returnPath);return url.href;}
export async function continuationCall(env,input){
  const secret=env.AMCORE_MEETING_MANAGEMENT_SECRET;if(!secret||secret.length<32)throw failure();const origin=new URL(origins(env).meetings);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)throw failure();
  const path='/login-continuation/machine',timestamp=String(Date.now()),actor='0',body=JSON.stringify({...input,nonce:random()}),digest=await hash(body),key=await crypto.subtle.importKey('raw',bytes.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await crypto.subtle.sign('HMAC',key,bytes.encode(['POST',path,timestamp,actor,digest].join('\n'))));
  const r=await fetch(origin.origin+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','x-meeting-time':timestamp,'x-meeting-actor':actor,'x-meeting-signature':signature},body,signal:AbortSignal.timeout(20000)});const v=await r.json().catch(()=>({}));if(!r.ok||!v.ok)throw Object.assign(failure(),{diagnostic:/^CONTINUATION_[A-Z_]{1,50}$/.test(v.code||'')?v.code:'CONTINUATION_BROKER_HTTP'});return v;
}
async function seal(env,id,v){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes.encode('login-continuation:'+env.TOKEN_ENCRYPTION_KEY)),{name:'AES-GCM'},false,['encrypt']);return {iv:Array.from(iv),value:Array.from(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes.encode(id)},key,bytes.encode(JSON.stringify(v)))))};}
async function unseal(env,id,v){if(!env.TOKEN_ENCRYPTION_KEY)throw failure();const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes.encode('login-continuation:'+env.TOKEN_ENCRYPTION_KEY)),{name:'AES-GCM'},false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(v.iv),additionalData:bytes.encode(id)},key,new Uint8Array(v.value))));}
async function dailyLink(env,reference){const row=await env.DB.prepare("SELECT value FROM documents WHERE namespace='login-continuation-sessions' AND key=?").bind(reference).first();return row?unseal(env,reference,JSON.parse(row.value)):null;}
async function snapshot(env){const p=await env.SHARED_ACCESS.snapshot();if(!Array.isArray(p.effectiveActiveAccounts))throw failure();return p;}
async function dailySession(env,reference){if(!/^[a-f0-9]{64}$/.test(reference||''))return null;const row=await env.DB.prepare('SELECT user_json,expires_at FROM sessions WHERE token_hash=? AND expires_at>?').bind(reference,Date.now()).first();if(!row?.user_json)return null;const user=JSON.parse(row.user_json),p=await snapshot(env);if(!p.effectiveActiveAccounts.includes(user.account))return null;const local=await env.DB.prepare("SELECT value FROM documents WHERE namespace='settings' AND key='access'").first(),restored=local?JSON.parse(local.value).accountRestoredAt?.[user.account]:null;if(restored&&(!user.sessionIssuedAt||user.sessionIssuedAt<Date.parse(restored)))return null;return {reference,account:user.account,issuedAt:user.sessionIssuedAt,expiresAt:row.expires_at,user};}
export async function continuationAuthority(env,v){
  if(v.action==='proof'){
    if(v.source==='uof')return env.SHARED_ACCESS.continuationAuthority(v);
    if(v.source!=='dailylog')throw failure();const s=await dailySession(env,v.reference);if(!s||!s.issuedAt||await dailyLink(env,v.reference))return null;return {account:s.account,reference:v.reference,generation:String(s.issuedAt),active:true,expiresAt:s.expiresAt};
  }
  if(v.action!=='feature'||!/^\d{1,20}$/.test(v.account||''))throw failure();const p=await snapshot(env);if(!p.effectiveActiveAccounts.includes(v.account))return {allowed:false};
  if(v.target==='dailylog')return {allowed:p.dailylogEnabledAccounts?.includes(v.account)||p.hrDailylogEnabledAccounts?.includes(v.account)||p.adminAccounts?.includes(v.account)||Object.values(p.routineGrants?.[v.account]||{}).some(Boolean)};
  if(v.target==='uof')return env.SHARED_ACCESS.continuationAuthority(v);
  if(v.target!=='meetings'||!/^U[a-f0-9]{32}$/i.test(v.botUserId||''))throw failure();
  const rows=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND key IN (?,?)").bind('account:'+v.botUserId+':'+v.account,'unused').all(),a=rows.results?.[0]?JSON.parse(rows.results[0].value):null;
  if(!a?.confirmedAt||a.account!==v.account||a.botUserId!==v.botUserId)return {allowed:false};const row=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND key=?").bind('line:'+v.botUserId+':'+a.lineUserId).first(),b=row?JSON.parse(row.value):null;
  if(!b?.confirmedAt||b.account!==a.account||b.lineUserId!==a.lineUserId||b.botUserId!==a.botUserId)return {allowed:false};return {allowed:true,userId:a.lineUserId};
}
export async function continuationMachine(request,env){const url=new URL(request.url);if(url.pathname!=='/api/integrations/leaf-snail/tasks/login-continuation-authority')return null;if(request.method!=='POST'||!env.LEAF_TASK_SERVICE_KEY||request.headers.get('authorization')!=='Bearer '+env.LEAF_TASK_SERVICE_KEY)return json({ok:false},401);try{const text=await request.text();if(text.length>4000)throw failure();const v=JSON.parse(text);if(v.tenantKey!==env.LEAF_TASK_TENANT)throw failure();return json({ok:true,value:await continuationAuthority(env,v)});}catch{return json({ok:false},403);}}
function callFor(app){return v=>app.env.DAILYLOG_MANAGEMENT.continuationCall(v);}
export async function uofContinuationAuthority(app,v){
  const access=await app.access();
  if(v.action==='proof'){
    if(v.source!=='uof'||!/^[a-f0-9]{64}$/.test(v.reference||''))throw failure();const s=await app.store.get('session:'+v.reference),policy=s?.account?access.accountPolicies?.[s.account]:null;
    if(!s?.account||!s.issuedAt||s.expiresAt<=Date.now()||!app.isAllowed(access,s.account)&&!app.isAdmin(access,s.account)||policy?.status==='disabled'||policy?.activatedAt&&s.issuedAt<Date.parse(policy.activatedAt)||await app.store.get('login-continuation:'+v.reference))return null;
    return {account:s.account,reference:v.reference,generation:String(s.issuedAt),active:true,expiresAt:s.expiresAt};
  }
  if(v.action!=='feature'||v.target!=='uof')throw failure();if(!app.isAllowed(access,v.account))return {allowed:false};const grant=await app.grant(v.account),soap=!!grant&&await app.soap.validate(grant.token);let attachments=false;if(soap)try{await app.attachmentAuthorization(v.account);attachments=true;}catch{}return {allowed:true,soap,attachments};
}
async function route(request,env,site,port){
  const u=new URL(request.url),o=origins(env),prefix='/login-continuation/',attemptCookie='__Host-'+site+'-continuation-attempt',challengeCookie='__Host-'+site+'-login-challenge';
  const auto=site==='dailylog'?u.pathname==='/login':u.pathname==='/Account/Login'||u.pathname==='/Line/Review';
  if(!u.pathname.startsWith(prefix)){
    if(request.method==='GET'&&auto&&u.searchParams.get('continuation')!=='skip'&&!readCookie(request,attemptCookie)&&!await port.session())return redirect(o[site]+prefix+'start?returnPath='+encodeURIComponent(site==='dailylog'?(u.searchParams.get('returnTo')||u.searchParams.get('return')||'/'):(u.searchParams.get('ReturnUrl')||'/Line/Review')));
    if(request.method==='POST'&&(u.pathname==='/api/auth/logout'||u.pathname==='/api/uof-review/logout')){const s=await port.session(),link=s&&await port.link(s.reference);if(link){if(request.headers.get('Origin')!==u.origin)throw failure();await port.call({action:'logout',target:site,chainToken:link.token});}}
    return null;
  }
  if(request.method!=='GET')return json({ok:false},405);
  if(u.pathname===prefix+'authorize'){const v=navigation(env,Object.fromEntries(u.searchParams));return browserStep(prefix+'authorize-native?'+u.searchParams,originalLogin(env,v.target,v.returnPath));}
  if(u.pathname===prefix+'callback')return browserStep(prefix+'exchange?'+u.searchParams,originalLogin(env,site,decodeURIComponent(readCookie(request,'__Host-'+site+'-login-return')||defaults[site])));
  if(u.pathname===prefix+'start'){
    const path=u.searchParams.get('returnPath')||defaults[site];navigation(env,{target:site,returnPath:path,challenge:'0'.repeat(64)});if(await port.session())return redirect(o[site]+path);const verifier=random();return redirect(o.meetings+prefix+'continue?'+new URLSearchParams({target:site,returnPath:path,challenge:await hash(verifier)}),[cookie(site+'-login-challenge',verifier,60),cookie(site+'-login-return',encodeURIComponent(path),60),cookie(site+'-continuation-attempt','1',60)]);
  }
  if(u.pathname===prefix+'authorize-native'){
    const v=navigation(env,Object.fromEntries(u.searchParams)),s=await port.session();if(!s)return json({url:o.meetings+prefix+'continue?'+new URLSearchParams({...v,attempt:String(Number(v.attempt||0)+1)})});
    const link=await port.link(s.reference),grant=await port.call(link?{...v,action:'chain-issue',source:site,chainToken:link.token}:{...v,action:'register-issue',source:site,reference:s.reference});return json({url:o[v.target]+prefix+'callback?code='+encodeURIComponent(grant.code)});
  }
  if(u.pathname===prefix+'exchange'){
    const verifier=readCookie(request,challengeCookie),s=await port.session(),grant=await port.call({action:'exchange',code:u.searchParams.get('code'),target:site,targetOrigin:o[site],verifier,currentAccount:s?.account||null});
    const cookies=s?[]:await port.save(grant),r=json({url:o[site]+grant.returnPath});for(const c of [...cookies,cookie(site+'-login-challenge','',0),cookie(site+'-login-return','',0)])r.headers.append('Set-Cookie',c);return r;
  }
  return json({ok:false},404);
}
export async function dailyContinuationFetch(request,env){
  const machine=await continuationMachine(request,env);if(machine)return machine;
  const raw=readCookie(request,'dailylog_session'),reference=/^[a-f0-9]{64}$/.test(raw)?await hash(raw):null;
  const get=async()=>reference?dailySession(env,reference):null;
  const call=v=>continuationCall(env,v);
  try{
    const link=reference&&await dailyLink(env,reference);
    const path=new URL(request.url).pathname;
    if(link&&path!=='/api/auth/logout'&&(path.startsWith('/api/')||path.startsWith('/login-continuation/')||['/','/index.html','/xiaoye','/supervisor'].includes(path))){
      try{const s=await get(),grant=await call({action:'check',target:'dailylog',chainToken:link.token});if(!s||grant.account!==s.account||grant.expiresAt<=Date.now())throw failure();}
      catch{await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(reference).run();}
    }
    return await route(request,env,'dailylog',{session:get,link:ref=>dailyLink(env,ref),call,async save(grant){
      if(!env.TOKEN_ENCRYPTION_KEY)throw failure();const row=await env.DB.prepare('SELECT user_id,value FROM employees WHERE account=?').bind(grant.account).first();if(!row?.user_id)throw failure();const employee=JSON.parse(row.value),plain=hex(crypto.getRandomValues(new Uint8Array(32))),id=await hash(plain),csrf=hex(crypto.getRandomValues(new Uint8Array(32))),user={id:row.user_id,account:grant.account,name:employee.name||'',team:employee.department||employee.team||'',sessionIssuedAt:Date.now()},encrypted=await seal(env,id,{token:grant.token});
      await env.DB.batch([env.DB.prepare('INSERT INTO sessions(token_hash,csrf,user_json,expires_at) VALUES(?,?,?,?)').bind(id,csrf,JSON.stringify(user),grant.expiresAt),env.DB.prepare("INSERT INTO documents(namespace,key,value) VALUES('login-continuation-sessions',?,?)").bind(id,JSON.stringify(encrypted))]);return ['dailylog_session='+plain+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.max(0,Math.floor((grant.expiresAt-Date.now())/1000))];
    }});
  }catch(error){if(new URL(request.url).pathname.startsWith('/login-continuation/'))return json({ok:false,error:'登入接續未完成，請從原登入入口重新開啟。',code:diagnostic(error)},401);return json({error:'登入接續已失效，請重新登入。',code:'LOGIN_REQUIRED'},401);}
}
export async function uofContinuationSession(app,s){const link=s&&await app.store.get('login-continuation:'+await hash(s.id));if(!link)return s;try{const grant=await callFor(app)({action:'check',target:'uof',chainToken:link.token});if(grant.account!==s.account||grant.expiresAt<=Date.now())return null;return s;}catch{return null;}}
export async function uofContinuationFetch(app,request){
  try{return await route(request,app.env,'uof',{async session(){const s=await app.session(request);return s?.account?{...s,reference:await hash(s.id)}:null;},link:ref=>app.store.get('login-continuation:'+ref),call:callFor(app),async save(grant){
    const id=random(),ref=await hash(id),s={account:grant.account,id,csrf:random(),issuedAt:Date.now(),expiresAt:grant.expiresAt,displayName:grant.account};await app.store.put('login-continuation:'+ref,{token:grant.token});await app.store.put('session:'+ref,s);const cookies=[cookie('uof-line',id,(grant.expiresAt-Date.now())/1000)];if(grant.permission.attachments)try{const authorization=await app.attachmentAuthorization(grant.account),g=await app.grant(grant.account),attachmentId=random();await app.store.put('attachment-session:'+await hash(attachmentId),{account:grant.account,tokenHash:await hash(g.token),authorizationId:authorization.authorizationId});cookies.push(app.attachmentCookie(attachmentId));}catch{}return cookies;
  } });}catch{return json({ok:false,error:'登入接續未完成，請使用原登入入口。'},401);}
}

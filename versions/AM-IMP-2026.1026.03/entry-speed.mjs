export const ENTRY_SPEED_POLICY='native-entry-batched-reads-v1';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};

// Navigation is only a shortcut to the original, fully authenticated renderer.
// An anonymous browser still uses the exact original LINE linking entry.
export async function dailyEntryFetch(request,env,ctx,base){
 const url=new URL(request.url);if(url.pathname!=='/line-entry')return null;
 if(request.method!=='GET')return new Response(null,{status:405,headers});
 let fallback;
 try{fallback=new URL(url.searchParams.get('fallback'));const origins=new Set(['https://am.hozorental.com','https://am-platform-2ymf.onrender.com',new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com').origin]);
  if(url.origin!==env.PUBLIC_ORIGIN||!origins.has(fallback.origin)||fallback.username||fallback.password||fallback.hash||fallback.pathname!=='/meetings/review/connect'||fallback.searchParams.get('app')!=='dailylog')throw Error();
 }catch{return new Response('入口無法確認，請從葉小蝸重新開啟。',{status:400,headers});}
 // Strict cookies may be absent on the first cross-site navigation. Re-enter
 // this origin once before deciding that the existing login is unavailable.
 if(!/\bdailylog_session=[a-f0-9]{64}\b/.test(request.headers.get('Cookie')||'')&&url.searchParams.get('native')!=='1'){
  url.searchParams.set('native','1');const next=url.pathname+url.search;
  return new Response('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>開啟工作日誌</title><p>正在開啟工作日誌…</p><a href="'+next.replaceAll('&','&amp;').replaceAll('"','&quot;')+'">繼續開啟</a><script>location.replace('+JSON.stringify(next).replaceAll('<','\\u003c')+');</script></html>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
 }
 const target=new URL('/?openExternalBrowser=1',url),response=await base.fetch(new Request(target,request),env,ctx);
 if([302,303,307,308].includes(response.status)){
  const destination=new URL(response.headers.get('Location')||'/',target);
  if(destination.origin===target.origin&&destination.pathname==='/login')return new Response(null,{status:303,headers:{...headers,Location:fallback.href}});
 }
 if(!response.ok||!response.headers.get('Content-Type')?.includes('text/html'))return response;
 const output=new Headers(response.headers);output.delete('Content-Length');output.delete('ETag');output.set('X-DailyLog-Entry-Policy',ENTRY_SPEED_POLICY);output.set('Cache-Control','private, no-store');
 const html=(await response.text()).replace(/<head(?:\s[^>]*)?>/i,match=>match+'<script>history.replaceState(history.state,"","/?openExternalBrowser=1");</script>');
 return new Response(html,{status:response.status,headers:output});
}

export async function taskDeliveryJobs(db,tasks){
 const keys=[...new Set(tasks.flatMap(t=>[t.requester.account,t.lead.account,...t.collaborators.map(p=>p.account)].map(a=>t.id+':'+a)))];
 if(!keys.length)return new Map();
 const rows=await db.prepare("SELECT key,value FROM documents WHERE namespace='task-notion-delivery' AND key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).all();
 return new Map(rows.results.map(r=>[r.key,JSON.parse(r.value)]));
}

// Both original endpoints independently retain their session/directory/fresh
// permission gates. Only the outer Worker changes; no running DO is restarted.
export async function reviewBootstrap(request,app){
 const read=async path=>{const response=await app.fetch(new Request(new URL(path,request.url),request));return {response,value:await response.json()};};
 const [session,pending]=await Promise.allSettled([read('/api/uof-review/session'),read('/api/uof-review/web-pending')]);
 if(session.status==='rejected')return Response.json({error:'SESSION_UNAVAILABLE',message:'目前無法確認登入，請重新嘗試。'},{status:503,headers});
 const {response,value}=session.value;if(!response.ok)return Response.json(value,{status:response.status,headers});
 value.entryPolicy=ENTRY_SPEED_POLICY;
 if(value.authenticated&&value.allowed&&value.cookieAccepted){
  if(pending.status==='fulfilled'&&pending.value.response.ok){
   if(pending.value.value.account!==value.account)return Response.json({error:'ACCOUNT_CHANGED',message:'登入身分已變更，請重新登入。'},{status:401,headers});
   value.pending=pending.value.value;
  }else value.pendingError={message:'目前無法讀取待簽，請重新查詢。',status:pending.status==='fulfilled'?pending.value.response.status:503};
 }
 const output=new Headers(headers);for(const cookie of response.headers.getSetCookie())output.append('Set-Cookie',cookie);
 return Response.json(value,{headers:output});
}

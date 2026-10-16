// Runs only after the existing shared management login, current admin grant,
// active employee and CSRF checks. No browser cookies are forwarded to AM.
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
export async function meetingManagementProxy(request,env,actor,{fetchImpl=fetch,now=Date.now}={}){
  if(!['GET','PUT'].includes(request.method))return Response.json({error:'不支援此操作。'},{status:405});
  const secret=env.AMCORE_MEETING_MANAGEMENT_SECRET;
  if(!secret||secret.length<32||!/^\d{1,20}$/.test(String(actor)))return Response.json({error:'會議管理尚未設定完成。'},{status:503});
  let origin;
  try{const target=new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com');
    if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('origin');
    origin=target.origin;
  }catch{return Response.json({error:'會議管理尚未設定完成。'},{status:503});}
  const body=request.method==='GET'?'':await request.text();
  if(body.length>20000)return Response.json({error:'設定資料過大。'},{status:413});
  const path='/integrations/meeting-management/conversations',timestamp=String(now());
  const digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(body)));
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await crypto.subtle.sign('HMAC',key,encoder.encode([request.method,path,timestamp,actor,digest].join('\n'))));
  try{
    const response=await fetchImpl(origin+path,{method:request.method,redirect:'manual',
      headers:{'Content-Type':'application/json','x-meeting-time':timestamp,'x-meeting-actor':String(actor),'x-meeting-signature':signature},
      ...(body?{body}:{}),signal:AbortSignal.timeout(45000)});
    if(response.status>=300&&response.status<400){
      console.warn('meeting-management-upstream',JSON.stringify({status:response.status,format:'redirect'}));
      return Response.json({error:'會議服務暫時無法連線，請保留修改後重試。'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
    if(!(response.headers.get('Content-Type')||'').includes('application/json')){
      console.warn('meeting-management-upstream',JSON.stringify({status:response.status,format:'non-json'}));
      return Response.json({error:'會議服務暫時無法連線，請保留修改後重試。'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
    const result=await response.json();
    return Response.json(result,{status:response.status,headers:{'Cache-Control':'no-store'}});
  }catch(error){console.warn('meeting-management-upstream',JSON.stringify({failure:['TimeoutError','AbortError','TypeError','SyntaxError'].includes(error?.name)?error.name:'transport'}));return Response.json({error:'會議服務暫時無法連線，請保留修改後重試。'},{status:503,headers:{'Cache-Control':'no-store'}});}
}

export async function meetingManagementRoute(app,request,session){
  const path=new URL(request.url).pathname;
  if(path!=='/api/management/meetings/conversations')return null;
  if(!['GET','PUT'].includes(request.method))return Response.json({error:'不支援此操作。'},{status:405});
  if(request.method!=='GET')app.csrf(request,session);
  if(!app.env.DAILYLOG_MANAGEMENT?.manage)return Response.json({error:'會議管理尚未連線。'},{status:503});
  return app.env.DAILYLOG_MANAGEMENT.manage(new Request('https://dailylog.chatgpt-673.workers.dev/api/meeting-management/conversations',{
    method:request.method,headers:{'Content-Type':'application/json'},...(request.method==='GET'?{}:{body:await request.text()})
  }),{account:session.account,expiresAt:session.expiresAt});
}

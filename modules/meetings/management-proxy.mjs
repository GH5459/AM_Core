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

const accountPattern=/^\d{1,20}$/;
const linePattern=/^U[a-f0-9]{32}$/i;
async function conversationKey(bot,user){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(`${bot}:user:${user}`)));}
// Only established UOF binding records are used. Display names never identify a person.
export async function personnelMeetingInventory(app,data){
  const bot=app.env.AMCORE_MEETING_BOT_USER_ID;
  if(!linePattern.test(bot||''))throw Object.assign(Error('個人會議的 LINE 連線尚未設定完成。'),{status:503});
  const [access,bindings]=await Promise.all([app.sharedAccess.snapshot(),app.store.get('bindings',[])]);
  if(!Array.isArray(access.effectiveActiveAccounts))throw Object.assign(Error('同仁有效名單暫時無法確認。'),{status:503});
  const people=new Set(access.effectiveActiveAccounts),keys=new Map(),byAccount=new Map();
  for(const binding of bindings){
    if(!accountPattern.test(binding.account||'')||!linePattern.test(binding.userId||'')||typeof binding.bindingId!=='string')continue;
    const key=await conversationKey(bot,binding.userId);
    if(!keys.has(key))keys.set(key,[]);keys.get(key).push(binding);
    if(!byAccount.has(binding.account))byAccount.set(binding.account,new Set());byAccount.get(binding.account).add(key);
  }
  const rows=(data.conversations||[]).filter(r=>r.type==='user').map(row=>{
    const matches=keys.get(row.key)||[],accounts=new Set(matches.map(b=>b.account));
    const account=accounts.size===1?[...accounts][0]:'';
    const active=people.has(account);
    const valid=active&&matches.length===1&&byAccount.get(account)?.size===1;
    return {...row,account:valid?account:'',identityState:valid?'confirmed':matches.length?'needs_review':'unlinked'};
  });
  return {contract:data.contract,conversations:rows,tenants:data.tenants||[]};
}
export async function meetingManagementRoute(app,request,session){
  const path=new URL(request.url).pathname;
  const personal=path==='/api/management/meetings/people';
  if(!personal&&path!=='/api/management/meetings/conversations')return null;
  if(!['GET','PUT'].includes(request.method))return Response.json({error:'不支援此操作。'},{status:405});
  if(request.method!=='GET')app.csrf(request,session);
  if(!app.env.DAILYLOG_MANAGEMENT?.manage)return Response.json({error:'會議管理尚未連線。'},{status:503});
  const remote=(method='GET',input)=>app.env.DAILYLOG_MANAGEMENT.manage(new Request('https://dailylog.chatgpt-673.workers.dev/api/meeting-management/conversations',{
    method,headers:{'Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})
  }),{account:session.account,expiresAt:session.expiresAt});
  try{
    const response=await remote();if(!response.ok)return response;
    const data=await response.json(),inventory=personal?await personnelMeetingInventory(app,data):{...data,conversations:(data.conversations||[]).filter(r=>['group','room'].includes(r.type))};
    if(request.method==='GET')return Response.json(inventory,{headers:{'Cache-Control':'no-store'}});
    const text=await request.text();if(text.length>20000)return Response.json({error:'設定資料過大。'},{status:413});
    const input=JSON.parse(text),row=inventory.conversations.find(r=>r.key===input.key);
    if(!row)return Response.json({error:'此對話不屬於這個管理入口，請重新載入。'},{status:409});
    if(personal){
      if(!row.account||row.identityState!=='confirmed'||input.account!==row.account)return Response.json({error:'尚未確認本人 LINE 身分，請先完成本人連線。'},{status:409});
      // Re-read the actual binding before every change, including an operation retry.
      const saved=(await app.store.get('bindings',[])).filter(b=>b.account===row.account);
      if(saved.length!==1)return Response.json({error:'本人連線已變更，請重新載入。'},{status:409});
      const binding=saved[0],raw=await app.line.gateway('/bindings/'+encodeURIComponent(binding.bindingId)+'?externalUserId='+encodeURIComponent(row.account),'GET',null,null,true),current=raw?.bindingView||raw;
      if(current.status!=='bound'||current.externalUserId!==row.account||current.bindingId!==binding.bindingId||current.userId!==binding.userId||current.groupId!==binding.groupId||await conversationKey(app.env.AMCORE_MEETING_BOT_USER_ID,current.userId)!==row.key)return Response.json({error:'本人 LINE 連線已失效或變更，請重新確認。'},{status:409});
      delete input.account;
    }
    return await remote('PUT',input);
  }catch(error){return Response.json({error:error.status?error.message:'會議設定暫時無法讀取，原設定仍保留。'},{status:error.status||503,headers:{'Cache-Control':'no-store'}});}
}

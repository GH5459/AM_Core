const enc=new TextEncoder(),hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const bad=()=>({ok:false,code:'AUTO_MEETING_UNAVAILABLE'});
export async function autoMeetingBridge(env,input,{fetchImpl=fetch,lookup,now=Date.now}={}){
 if(!input||Object.keys(input).sort().join(',')!=='account,botUserId,lineUserId'||!/^\d{1,20}$/.test(input.account||'')||!/^U[a-f0-9]{32}$/i.test(input.botUserId||'')||!/^U[a-f0-9]{32}$/i.test(input.lineUserId||''))return bad();
 const secret=env.AMCORE_MEETING_MANAGEMENT_SECRET;if(!secret||secret.length<32||typeof lookup!=='function')return bad();
 let origin;try{const u=new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com');if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{return bad();}
 try{
  const proof=await lookup(env,{action:'lookup',botUserId:input.botUserId,lineUserId:input.lineUserId,account:input.account});
  if(!proof?.ok||proof.conflict||proof.items?.length!==1||proof.items[0].account!==input.account||proof.items[0].lineUserId!==input.lineUserId)return bad();
  const path='/integrations/meeting-management/auto-onboarding',timestamp=String(now()),actor='0',body=JSON.stringify({botUserId:input.botUserId,lineUserId:input.lineUserId}),digest=hex(await crypto.subtle.digest('SHA-256',enc.encode(body)));
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(['POST',path,timestamp,actor,digest].join('\n'))));
  const r=await fetchImpl(origin+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','x-meeting-time':timestamp,'x-meeting-actor':actor,'x-meeting-signature':signature},body,signal:AbortSignal.timeout(45000)});
  if(!r.ok||!(r.headers.get('Content-Type')||'').includes('application/json'))return bad();
  const value=await r.json();if(!['enabled','already_enabled','manual_hold','unavailable'].includes(value?.status))return bad();return {ok:true,status:value.status};
 }catch{return bad();}
}

import {authorizeRecovery,recoverCommonLine} from '../AM-IMP-2026.1027.80/common-line-recovery.mjs';
export const COMMON_LINE_CONTRACT='line-company-common-first-link-v1';
const id=v=>typeof v==='string'&&/^U[a-f0-9]{32}$/i.test(v),account=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID()+crypto.randomUUID();
const queues=new WeakMap();
export async function verifyLegacyIdentity(app,b){
 const remote=await app.line.gateway('/bindings/'+encodeURIComponent(b.bindingId)+'?externalUserId='+encodeURIComponent(b.account),'GET',null,null,true),p=remote?.bindingView||remote;
 if(p.status!=='bound'||p.externalUserId!==b.account||p.bindingId!==b.bindingId||p.userId!==b.userId||p.groupId!==b.groupId)throw fail('原 LINE 身分已失效或變更，請聯絡管理者核對。',403);
}
export async function commonLine(app,input,{channelId,fetchImpl=fetch,now=Date.now}={}){
 const prior=queues.get(app)||Promise.resolve(),run=prior.then(()=>execute(app,input,{channelId,fetchImpl,now}));queues.set(app,run.catch(()=>{}));return run;
}
async function execute(app,v,{channelId,fetchImpl,now}){
 if(v.action==='recovery-authorize')return authorizeRecovery(app,v,now);
 if(v.action==='health')return {ok:true,contract:COMMON_LINE_CONTRACT,existingBindingsPreserved:true,featureGrantsUnchanged:true};
 const bot=app.env.AMCORE_MEETING_BOT_USER_ID;if(!id(bot)||!/^\d+$/.test(channelId||''))throw fail('共用帳號入口尚未設定完成。',503);
 let lineUserId=v.lineUserId;
 if(!['legacy-check','legacy-confirm'].includes(v.action)){
  if(typeof v.token!=='string'||v.token.length>4096||v.token.length<10)throw fail('請重新使用 LINE 登入。',401);
  const verified=await fetchImpl('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(v.token),{signal:AbortSignal.timeout(8000)}),proof=await verified.json();
  if(!verified.ok||String(proof.client_id)!==channelId||!(Number(proof.expires_in)>0))throw fail('LINE 登入已失效，請重新登入。',401);
  const response=await fetchImpl('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+v.token},signal:AbortSignal.timeout(8000)}),profile=await response.json();
  if(!response.ok||!id(profile.userId))throw fail('無法確認 LINE 本人，請重新登入。',401);lineUserId=profile.userId;
 }else if(v.botUserId!==bot||!id(lineUserId)||!account(v.account))throw fail('帳號來源無法確認。',403);
 const snapshot=await app.sharedAccess.snapshot();
 if(!Array.isArray(snapshot.effectiveActiveAccounts))throw fail('同仁名單暫時無法確認。',503);
 const active=new Set(snapshot.effectiveActiveAccounts),registry=await app.store.get('common-line-identities',{version:1,items:[]});
 const native=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'lookup',botUserId:bot,lineUserId,account:v.account||null});
 if(!native?.ok||native.conflict)throw fail('既有 LINE 身分資料需要核對，請聯絡管理者。');
 const bindings=await app.store.get('bindings',[]),local=[];
 for(const b of bindings.filter(b=>b.userId===lineUserId||v.account&&b.account===v.account)){
  if(!account(b.account)||!id(b.userId)||b.groupId!==b.userId||!b.bindingId)throw fail('既有 UOF 綁定需要核對。');
  // A stored mapping alone cannot prove a revoked gateway binding is live.
  await verifyLegacyIdentity(app,b);local.push({account:b.account,lineUserId:b.userId,identityId:b.bindingId});
 }
 const recovery=await recoverCommonLine(app,v,{lineUserId,local,snapshot,token:v.token,now,contract:COMMON_LINE_CONTRACT});if(recovery)return recovery;
 const candidates=[...registry.items,...local,...native.items];
 const linked=candidates.filter(p=>p.lineUserId===lineUserId),accounts=[...new Set(linked.map(p=>p.account))];
 if(accounts.length>1)throw fail('LINE 與公司帳號有不同的既有對應，請聯絡管理者核對。');
 let existing=accounts[0]||null;
 const checkReverse=a=>{const reverse=candidates.filter(p=>p.account===a);if(new Set(reverse.map(p=>p.lineUserId)).size>1||reverse.some(p=>p.lineUserId!==lineUserId))throw fail('這個公司帳號已有其他 LINE 綁定，請聯絡管理者核對。');};
 if(existing){checkReverse(existing);const reverse=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'lookup',botUserId:bot,lineUserId,account:existing});if(!reverse?.ok||reverse.conflict||reverse.items.some(p=>p.account===existing&&p.lineUserId!==lineUserId))throw fail('既有身分的反向對應需要核對。');}if(v.account)checkReverse(v.account);
 if(existing&&!active.has(existing))throw fail('此帳號目前停用或無效，原綁定已保留。',403);
 const finish=async a=>{
  if(!active.has(a))throw fail('此帳號目前停用或無效，原綁定已保留。',403);
  // Project only trusted confirmed mappings; original UOF records and grants stay intact.
  const result=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'project',botUserId:bot,lineUserId,account:a,identityId:linked.find(x=>x.account===a)?.identityId||'common-line-'+await digest(bot+':'+lineUserId+':'+a)});
  if(!result?.ok)throw fail('帳號已確認，工作身分接續尚未完成，請重試。',503);
  return {ok:true,contract:COMMON_LINE_CONTRACT,linked:true,alreadyConfirmed:true,permissions:{dailylog:snapshot.dailylogEnabledAccounts.includes(a)||snapshot.hrDailylogEnabledAccounts?.includes(a)||Object.values(snapshot.routineGrants?.[a]||{}).some(Boolean),uof:snapshot.lineEnabledAccounts.includes(a),meetings:true}};
 };
 if(v.action==='status')return existing?finish(existing):{ok:true,contract:COMMON_LINE_CONTRACT,linked:false};
 if(v.action==='legacy-check'){
  if(existing&&existing!==v.account)throw fail('原 LINE 對應與登入帳號不同，請聯絡管理者。');return {ok:true,linked:!!existing};
 }
 if(v.action==='prepare'){
  if(existing)return finish(existing);
  if(!account(v.account)||typeof v.password!=='string'||!v.password||v.password.length>500)throw fail('請輸入本人 UOF 帳號與密碼。',400);
  const rateKey='common-line-rate:'+await digest(lineUserId+':'+v.account),rate=await app.store.get(rateKey,{count:0,until:0});
  if(rate.until<now()){rate.count=0;rate.until=now()+60000;}if(++rate.count>8)throw fail('登入次數較多，請稍後再試。',429);await app.store.put(rateKey,rate);
  let profile;try{profile=await app.api.authenticate(v.account,v.password);}finally{v.password='';}
  if(!profile)throw fail('請確認本人的 UOF 帳號密碼。',401);
  if(!active.has(v.account))throw fail('此公司帳號目前停用或不在有效名單。',403);
  const challenge=random(),ticket={lineUserId,account:v.account,tokenHash:await digest(v.token),expiresAt:now()+300000};
  await app.store.put('common-line-challenge:'+await digest(challenge),ticket);
  return {ok:true,linked:false,challenge,name:profile.employee?.employee_name||v.account,accountHint:'••'+v.account.slice(-3)};
 }
 let chosen=v.account,ticket;
 if(v.action==='confirm'){
  if(typeof v.challenge!=='string'||v.challenge.length>100)throw fail('確認已失效，請重新登入。',410);
  ticket=await app.store.get('common-line-challenge:'+await digest(v.challenge));
  if(!ticket||ticket.expiresAt<=now()||ticket.lineUserId!==lineUserId||ticket.tokenHash!==await digest(v.token))throw fail('確認已失效，請重新登入。',410);chosen=ticket.account;
 }else if(v.action!=='legacy-confirm')throw fail('不支援此操作。',400);
 if(!account(chosen)||!active.has(chosen))throw fail('此帳號目前停用或無效。',403);
 if(existing&&existing!==chosen)throw fail('LINE 已有不同的帳號對應，請聯絡管理者。');
 // Recheck the reverse side for the verified account, including its native/UOF records.
 const reverse=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'lookup',botUserId:bot,lineUserId,account:chosen});
 if(!reverse?.ok||reverse.conflict||reverse.items.some(p=>p.account===chosen&&p.lineUserId!==lineUserId)||bindings.some(b=>b.account===chosen&&b.userId!==lineUserId)||registry.items.some(p=>p.account===chosen&&p.lineUserId!==lineUserId))throw fail('這個公司帳號已有其他 LINE 綁定，請聯絡管理者核對。');
 if(!existing){const item={account:chosen,lineUserId,botUserId:bot,identityId:'common-line-'+await digest(bot+':'+lineUserId+':'+chosen),confirmedAt:new Date(now()).toISOString(),proof:v.action==='confirm'?'verified-line-and-fresh-company-login':'verified-legacy-company-login'};registry.items.push(item);registry.version++;await app.store.put('common-line-identities',registry);linked.push(item);}
 const result=await finish(chosen);return {...result,alreadyConfirmed:!!existing};
}

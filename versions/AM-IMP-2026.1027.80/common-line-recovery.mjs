const fail=(message,status=409)=>Object.assign(Error(message),{status});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const permitKey=a=>'common-line-recovery:'+a;
export async function authorizeRecovery(app,v,now){
 if(!/^\d{1,20}$/.test(v.account||''))throw fail('請指定原公司帳號。',400);
 const mappings=(await app.store.get('bindings',[])).filter(p=>p.account===v.account&&p.userId===p.groupId);
 if(mappings.length!==1)throw fail('原個人 LINE 綁定需要核對。');
 const mapping=mappings[0],remote=await app.line.gateway('/bindings/'+encodeURIComponent(mapping.bindingId)+'?externalUserId='+encodeURIComponent(v.account),'GET',null,null,true),p=remote.bindingView||remote;
 if(p.status!=='bound'||p.externalUserId!==mapping.account||p.bindingId!==mapping.bindingId||p.userId!==mapping.userId||p.groupId!==mapping.groupId)throw fail('原個人 LINE 綁定已變更。');
 const botUserId=app.env.AMCORE_MEETING_BOT_USER_ID,reverse=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'lookup',botUserId,lineUserId:mapping.userId,account:v.account});
 const old=reverse?.items?.filter(p=>p.account===v.account),registry=await app.store.get('common-line-identities',{items:[]});
 if(!reverse?.ok||reverse.conflict||old.length!==1||old[0].lineUserId===mapping.userId||reverse.items.some(p=>p.account!==v.account)||registry.items.some(p=>p.account===v.account&&p.lineUserId!==mapping.userId))throw fail('目前資料不符合指定的重新驗證條件。');
 const permit={id:crypto.randomUUID(),account:v.account,botUserId,lineUserId:mapping.userId,bindingId:mapping.bindingId,previousLineUserId:old[0].lineUserId,expectedIdentityId:old[0].identityId,expiresAt:now()+72*3600000};
 await app.store.put(permitKey(v.account),permit);
 return {ok:true,recoveryAuthorized:true,expiresAt:new Date(permit.expiresAt).toISOString(),identityChanged:false};
}
export async function recoverCommonLine(app,v,{lineUserId,local,snapshot,token,now,contract}){
 if(!['status','prepare','confirm'].includes(v.action)||local.length!==1)return null;
 const mapping=local[0],permit=await app.store.get(permitKey(mapping.account));
 if(!permit||permit.consumed||permit.expiresAt<=now()||permit.lineUserId!==lineUserId||permit.bindingId!==mapping.identityId||permit.botUserId!==app.env.AMCORE_MEETING_BOT_USER_ID)return null;
 if(!snapshot.effectiveActiveAccounts.includes(permit.account))throw fail('此帳號目前停用或無效。',403);
 if(v.account&&v.account!==permit.account)throw fail('請使用原綁定的本人公司帳號。');
 const rpc=input=>app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({botUserId:permit.botUserId,lineUserId,account:permit.account,...input});
 const reverse=await rpc({action:'lookup'});
 if(!reverse?.ok||reverse.conflict||reverse.items.some(p=>p.account!==permit.account))throw fail('身分紀錄已有變更，請聯絡管理者核對。');
 const old=reverse.items.filter(p=>p.account===permit.account&&p.lineUserId===permit.previousLineUserId&&p.identityId===permit.expectedIdentityId);
 const completed=reverse.items.length===1&&reverse.items[0].account===permit.account&&reverse.items[0].lineUserId===lineUserId;
 if(completed&&v.action!=='confirm')return null;
 if(!completed&&(old.length!==1||reverse.items.length!==1))throw fail('原身分紀錄已變更，請聯絡管理者核對。');
 if(v.action==='status')return {ok:true,linked:false,recoveryRequired:true,message:'原 LINE 紀錄需要更新，請以本人公司帳號重新驗證。'};
 const challengeKey=c=>'common-line-challenge:'+c;
 if(v.action==='prepare'){
  if(typeof v.password!=='string'||!v.password||v.password.length>500)throw fail('請輸入本人公司帳號與密碼。',400);
  const rateKey='common-line-recovery-rate:'+await digest(lineUserId+':'+permit.account),rate=await app.store.get(rateKey,{count:0,until:0});
  if(rate.until<=now()){rate.count=0;rate.until=now()+60000;}rate.count++;await app.store.put(rateKey,rate);if(rate.count>8)throw fail('登入次數較多，請稍後再試。',429);
  let profile;try{profile=await app.api.authenticate(permit.account,v.password);}finally{v.password='';}
  if(!profile)throw fail('請確認本人的公司帳號密碼。',401);
  const challenge=crypto.randomUUID()+crypto.randomUUID(),hash=await digest(challenge);
  await app.store.put(challengeKey(hash),{recovery:true,permitId:permit.id,lineUserId,account:permit.account,tokenHash:await digest(token),expiresAt:Math.min(now()+300000,permit.expiresAt),operationId:hash});
  return {ok:true,linked:false,recoveryRequired:true,challenge,name:profile.employee?.employee_name||permit.account,accountHint:'••'+permit.account.slice(-3)};
 }
 if(typeof v.challenge!=='string'||v.challenge.length>100)throw fail('確認已失效，請重新登入。',410);
 const key=challengeKey(await digest(v.challenge)),ticket=await app.store.get(key);
 if(!ticket?.recovery||ticket.permitId!==permit.id||ticket.expiresAt<=now()||ticket.lineUserId!==lineUserId||ticket.account!==permit.account||ticket.tokenHash!==await digest(token))throw fail('確認已失效，請重新登入。',410);
 const result=await rpc({action:'recover',previousLineUserId:permit.previousLineUserId,expectedIdentityId:permit.expectedIdentityId,operationId:ticket.operationId});
 if(!result?.ok)throw fail('身分更新尚未完成，請重新嘗試。',503);
 await app.store.put(permitKey(permit.account),{...permit,consumed:true,completedAt:new Date(now()).toISOString()});
 return {ok:true,contract,linked:true,recovered:true,permissions:{dailylog:snapshot.dailylogEnabledAccounts.includes(permit.account)||snapshot.hrDailylogEnabledAccounts?.includes(permit.account)||Object.values(snapshot.routineGrants?.[permit.account]||{}).some(Boolean),uof:snapshot.lineEnabledAccounts.includes(permit.account),meetings:true}};
}

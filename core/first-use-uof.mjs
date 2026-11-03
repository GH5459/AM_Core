import {verifyLegacyIdentity} from '../versions/AM-IMP-2026.1019.50/common-line-uof.mjs';
const numeric=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
const line=v=>typeof v==='string'&&/^U[a-f0-9]{32}$/i.test(v);

// Called only through the existing authenticated service bridge, never from
// browser-supplied identity fields. A registry entry is not gateway proof.
export async function firstUseStatus(app,input){
 const account=input.account,person=input.lineUserId;
 if(account!==undefined&&!numeric(account)||person!==undefined&&!line(person)||!account&&!person)throw Error('FIRST_USE_INVALID');
 const snapshot=await app.sharedAccess.snapshot();
 if(!Array.isArray(snapshot.effectiveActiveAccounts))throw Error('FIRST_USE_UNAVAILABLE');
 const saved=await app.store.get('bindings',[]);
 if(!Array.isArray(saved))throw Error('FIRST_USE_UNAVAILABLE');
 const matches=saved.filter(b=>account?b.account===account:b.userId===person);
 if(matches.length!==1)return {ok:true,linked:false,reason:matches.length?'review':'bind'};
 const b=matches[0];
 if(!numeric(b.account)||!line(b.userId)||b.groupId!==b.userId||!b.bindingId||person&&person!==b.userId)return {ok:true,linked:false,reason:'review'};
 if(!snapshot.effectiveActiveAccounts.includes(b.account))return {ok:true,linked:false,reason:'inactive'};
 const check=await app.env.DAILYLOG_MANAGEMENT.commonLineIdentity({action:'lookup',botUserId:app.env.AMCORE_MEETING_BOT_USER_ID,lineUserId:b.userId,account:b.account});
 if(!check?.ok||check.conflict||!Array.isArray(check.items))throw Error('FIRST_USE_UNAVAILABLE');
 if(check.items.some(x=>x.account!==b.account||x.lineUserId!==b.userId))return {ok:true,linked:false,reason:'review'};
 if(saved.some(x=>x!==b&&(x.account===b.account||x.userId===b.userId)))return {ok:true,linked:false,reason:'review'};
 try{await verifyLegacyIdentity(app,b);}catch(e){if([403,404,409].includes(e.status))return {ok:true,linked:false,reason:'bind'};throw e;}
 return {ok:true,linked:true};
}

export async function authorizeFirstUseBinding(app,request){
 const session=await app.session(request);
 if(!session?.account)throw Object.assign(Error('請先登入本人 UOF 帳號。'),{status:401});
 const snapshot=await app.sharedAccess.snapshot();
 if(!snapshot.effectiveActiveAccounts?.includes(session.account))throw Object.assign(Error('此帳號目前停用或無效。'),{status:403});
 return session;
}

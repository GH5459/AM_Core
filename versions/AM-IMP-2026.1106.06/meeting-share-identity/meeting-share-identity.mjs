export const MEETING_SHARE_IDENTITY_CONTRACT='meeting-share-identity-v1';
const route='/api/integrations/leaf-snail/tasks/meeting-share-identity';
const native=value=>typeof value==='string'&&/^U[a-f0-9]{32}$/i.test(value);
const account=value=>typeof value==='string'&&/^\d{1,20}$/.test(value);
const headers={'Cache-Control':'private, no-store','Content-Type':'application/json'};
const json=(value,status=200)=>Response.json(value,{status,headers});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');

// This route composes the existing authenticated handlers, in their original
// order. It neither reads business tables directly nor shares authority across
// the two invocations. The old routes remain usable by the previous AM release.
export async function meetingShareIdentityRead(request,env,ctx,base){
 if(new URL(request.url).pathname!==route)return null;
 const token=env.LEAF_TASK_SERVICE_KEY;
 if(!token||token.length<32||await hash(request.headers.get('Authorization')||'')!==await hash('Bearer '+token))return json({ok:false,code:'UNAUTHORIZED'},401);
 if(!env.LEAF_TASK_TENANT)return json({ok:false,code:'SERVICE_NOT_CONFIGURED'},503);
 if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
 let value;
 try{const text=await request.text();if(text.length>10000)return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);value=JSON.parse(text);}catch{return json({ok:false,code:'INVALID_REQUEST'},400);}
 if(!value||value.tenantKey!==env.LEAF_TASK_TENANT||!native(value.botUserId)||!native(value.lineUserId))return json({ok:false,code:'INVALID_IDENTITY_SOURCE'},403);
 const legacy=value.legacyIdentity;
 // Legacy fallback is accepted only from the authenticated AM service after
 // its original readOnly proof. Never accept a fallback from a browser session.
 if(legacy!=null&&(typeof legacy!=='object'||Array.isArray(legacy)||legacy.tenantKey!==value.tenantKey||!account(legacy.account)||typeof legacy.bindingId!=='string'||!legacy.bindingId||legacy.bindingId.length>200))return json({ok:false,code:'INVALID_LEGACY_IDENTITY'},403);
 const read=async(path,input)=>{
  const url=new URL('/api/integrations/leaf-snail/tasks/'+path,request.url);
  return base.fetch(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({tenantKey:value.tenantKey,...input})}),env,ctx);
 };
 const identityResponse=await read('identity',{botUserId:value.botUserId,lineUserId:value.lineUserId});
 let current;try{current=await identityResponse.clone().json();}catch{return identityResponse;}
 if(!identityResponse.ok||current?.ok!==true)return identityResponse;
 const identity=current.identity?.userId===value.lineUserId&&current.identity.identityId?{account:current.identity.account,bindingId:current.identity.identityId}:legacy?{account:legacy.account,bindingId:legacy.bindingId}:null;
 if(!identity)return json({ok:true,contract:MEETING_SHARE_IDENTITY_CONTRACT,identity:null,person:null});
 // This second call still performs the current personnel and language checks
 // through the original wrapper chain. A later first-use guard stays in AM.
 const personResponse=await read('meeting-sharing-person',{account:identity.account});
 let result;try{result=await personResponse.clone().json();}catch{return personResponse;}
 if(!personResponse.ok||result?.ok!==true)return personResponse;
 return json({ok:true,contract:MEETING_SHARE_IDENTITY_CONTRACT,identity,person:result.person||null});
}

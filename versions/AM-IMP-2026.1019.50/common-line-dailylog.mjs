import {recoverNativeIdentity} from '../AM-IMP-2026.1027.80/common-line-recovery-dailylog.mjs';
const native=v=>typeof v==='string'&&/^U[a-f0-9]{32}$/i.test(v);
const read=async(db,key)=>{const r=await db.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND key=?").bind(key).first();return r?JSON.parse(r.value):null;};
export async function commonLineIdentity(env,v){
 if(!native(v.botUserId)||v.action!=='inventory'&&!native(v.lineUserId)||v.account!=null&&!/^\d{1,20}$/.test(v.account))throw Error('Invalid identity source');
 if(v.action==='recover'){if(!v.account)throw Error('Invalid recovery account');return recoverNativeIdentity(env.DB,v);}
 if(v.action==='inventory'){const rows=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-work-identities'").all(),items=[];for(const row of rows.results||[]){const p=JSON.parse(row.value);if(p.botUserId!==v.botUserId||items.some(x=>x.lineUserId===p.lineUserId&&x.account===p.account))continue;const a=await read(env.DB,'line:'+v.botUserId+':'+p.lineUserId),b=await read(env.DB,'account:'+v.botUserId+':'+p.account);if(a?.account===p.account&&b?.lineUserId===p.lineUserId&&p.confirmedAt)items.push({lineUserId:p.lineUserId,account:p.account,identityId:p.identityId});}return {ok:true,items};}
 const db=env.DB,lineKey='line:'+v.botUserId+':'+v.lineUserId;
 const rows=await db.prepare("SELECT key,value FROM documents WHERE namespace='line-work-identities' AND (json_extract(value,'$.lineUserId')=? OR json_extract(value,'$.account')=?)").bind(v.lineUserId,v.account||'').all();
 const items=(rows.results||[]).map(r=>JSON.parse(r.value)).filter(p=>p.botUserId===v.botUserId),unique=[...new Map(items.map(p=>[p.lineUserId+':'+p.account,p])).values()];
 let conflict=false;for(const p of unique){const [a,b]=await Promise.all([read(db,'line:'+v.botUserId+':'+p.lineUserId),read(db,'account:'+v.botUserId+':'+p.account)]);if(!a||!b||a.account!==p.account||b.lineUserId!==p.lineUserId||!p.confirmedAt)conflict=true;}
 if(v.action==='lookup')return {ok:true,conflict,items:unique.map(p=>({lineUserId:p.lineUserId,account:p.account,identityId:p.identityId}))};
 if(v.action!=='project'||conflict||!v.account||items.some(p=>p.lineUserId===v.lineUserId&&p.account!==v.account||p.account===v.account&&p.lineUserId!==v.lineUserId))throw Error('Identity conflict');
 const reverseKey='account:'+v.botUserId+':'+v.account,prior=await read(db,lineKey);
 const value={contract:'line-first-work-login-v1',identityId:prior?.identityId||v.identityId,botUserId:v.botUserId,lineUserId:v.lineUserId,account:v.account,confirmedAt:prior?.confirmedAt||new Date().toISOString(),proof:'shared-company-confirmed-identity'};
 const result=await db.batch([
  db.prepare("INSERT OR IGNORE INTO documents(namespace,key,value) SELECT 'line-work-identities',?,? WHERE NOT EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-identities' AND key=? AND json_extract(value,'$.lineUserId')<>?)").bind(lineKey,JSON.stringify(value),reverseKey,v.lineUserId),
  db.prepare("INSERT OR IGNORE INTO documents(namespace,key,value) SELECT 'line-work-identities',?,? WHERE EXISTS (SELECT 1 FROM documents WHERE namespace='line-work-identities' AND key=? AND json_extract(value,'$.account')=?)").bind(reverseKey,JSON.stringify(value),lineKey,v.account)
 ]);
 const [line,reverse]=await Promise.all([read(db,lineKey),read(db,reverseKey)]);if(line?.account!==v.account||reverse?.lineUserId!==v.lineUserId)throw Error('Identity projection incomplete');
 return {ok:true,changed:result.some(r=>r.meta.changes>0)};
}
export async function commonLinkFetch(request,env){
 const path=new URL(request.url).pathname;if(path!=='/api/integrations/leaf-snail/tasks/common-link')return null;
 const response=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
 if(!env.LEAF_TASK_SERVICE_KEY||request.headers.get('authorization')!=='Bearer '+env.LEAF_TASK_SERVICE_KEY)return response({ok:false,code:'UNAUTHORIZED'},401);
 if(request.method!=='POST')return response({ok:false},405);
 try{const text=await request.text();if(text.length>10000)return response({ok:false},413);const v=JSON.parse(text);if(v.tenantKey!==env.LEAF_TASK_TENANT)return response({ok:false},403);
  if(!['health','status','prepare','confirm'].includes(v.action))return response({ok:false},400);
  return response(await env.SHARED_ACCESS.commonLine(v));
 }catch(e){return response({ok:false,error:'共用帳號服務暫時無法完成，請稍後重試。'},503);}
}

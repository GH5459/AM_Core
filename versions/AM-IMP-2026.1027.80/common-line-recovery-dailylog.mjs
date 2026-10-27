const validId=v=>typeof v==='string'&&/^U[a-f0-9]{32}$/i.test(v);
// Called only through the existing, bound management RPC. The UOF service
// supplies a fresh company-login challenge and an exact owner-authorized pair.
export async function recoverNativeIdentity(db,v){
 if(!validId(v.previousLineUserId)||v.previousLineUserId===v.lineUserId||!v.expectedIdentityId||!/^[a-f0-9]{64}$/.test(v.operationId||''))throw Error('Invalid recovery proof');
 const ns='line-work-identities',oldKey='line:'+v.botUserId+':'+v.previousLineUserId,newKey='line:'+v.botUserId+':'+v.lineUserId,reverseKey='account:'+v.botUserId+':'+v.account;
 const get=(namespace,key)=>db.prepare('SELECT value FROM documents WHERE namespace=? AND key=?').bind(namespace,key).first();
 const receiptKey=v.botUserId+':'+v.operationId,prior=await get('line-work-recovery',receiptKey);
 if(prior){const p=JSON.parse(prior.value);if(p.complete&&p.account===v.account&&p.lineUserId===v.lineUserId&&p.previousLineUserId===v.previousLineUserId)return {ok:true,recovered:true};throw Error('Recovery changed');}
 const [a,b,current]=await Promise.all([get(ns,oldKey),get(ns,reverseKey),get(ns,newKey)]);
 if(!a||!b||current)throw Error('Recovery source changed');
 for(const r of [a,b]){const p=JSON.parse(r.value);if(p.botUserId!==v.botUserId||p.account!==v.account||p.lineUserId!==v.previousLineUserId||p.identityId!==v.expectedIdentityId||!p.confirmedAt)throw Error('Recovery source changed');}
 const at=new Date().toISOString(),value=JSON.stringify({contract:'line-first-work-login-v1',identityId:v.expectedIdentityId,botUserId:v.botUserId,lineUserId:v.lineUserId,account:v.account,confirmedAt:at,proof:'verified-line-and-fresh-company-login-recovery'});
 const receipt=JSON.stringify({account:v.account,lineUserId:v.lineUserId,previousLineUserId:v.previousLineUserId,at,complete:false,originalLine:a.value,originalReverse:b.value});
 const permit="EXISTS(SELECT 1 FROM documents WHERE namespace='line-work-recovery' AND key=? AND json_extract(value,'$.complete')=0)";
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO documents(namespace,key,value) SELECT 'line-work-recovery',?,? WHERE EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND value=?) AND EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM documents WHERE namespace=? AND key=?) AND NOT EXISTS(SELECT 1 FROM documents WHERE namespace=? AND json_extract(value,'$.botUserId')=? AND (json_extract(value,'$.account')=? OR json_extract(value,'$.lineUserId') IN (?,?)) AND key NOT IN (?,?))`).bind(receiptKey,receipt,ns,oldKey,a.value,ns,reverseKey,b.value,ns,newKey,ns,v.botUserId,v.account,v.previousLineUserId,v.lineUserId,oldKey,reverseKey),
  db.prepare(`INSERT OR IGNORE INTO documents(namespace,key,value) SELECT ?,?,? WHERE ${permit}`).bind(ns,newKey,value,receiptKey),
  db.prepare(`UPDATE documents SET value=?,revision=revision+1 WHERE namespace=? AND key=? AND value=? AND ${permit}`).bind(value,ns,reverseKey,b.value,receiptKey),
  db.prepare(`DELETE FROM documents WHERE namespace=? AND key=? AND value=? AND ${permit}`).bind(ns,oldKey,a.value,receiptKey),
  db.prepare("UPDATE documents SET value=json_set(value,'$.complete',json('true')),revision=revision+1 WHERE namespace='line-work-recovery' AND key=?").bind(receiptKey)
 ]);
 const [done,line,reverse,old]=await Promise.all([get('line-work-recovery',receiptKey),get(ns,newKey),get(ns,reverseKey),get(ns,oldKey)]);
 if(!done||!JSON.parse(done.value).complete||line?.value!==value||reverse?.value!==value||old)throw Error('Recovery source changed');
 return {ok:true,recovered:true};
}

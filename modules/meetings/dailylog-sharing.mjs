const fail=(message,status=503)=>Object.assign(Error(message),{status});
// Called only by the existing authenticated, tenant-scoped integration route.
// Current central personnel is authoritative; work-journal enablement does not
// decide whether an active colleague may receive a read-only meeting share.
export async function meetingSharing(value,env,{personnel,now=Date.now,personOnly=false,recipientOnly=false}){
 const active=await personnel(env,now);if(!active||!Array.isArray(active.employees))throw fail('共用同仁名單暫時無法確認。');
 const person=active.employees.find(p=>p.account===value.account);
 if(recipientOnly){
  if(!/^U[a-f0-9]{32}$/i.test(value.botUserId||''))throw fail('無法確認通知來源。',403);
  if(!person)return {ok:true,active:false,recipient:null};
  const read=async key=>{const r=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND key=?").bind(key).first();return r?JSON.parse(r.value):null;};
  const reverse=await read('account:'+value.botUserId+':'+value.account);
  const forward=reverse&&/^U[a-f0-9]{32}$/i.test(reverse.lineUserId||'')?await read('line:'+value.botUserId+':'+reverse.lineUserId):null;
  const valid=reverse&&forward&&reverse.botUserId===value.botUserId&&forward.botUserId===value.botUserId&&reverse.account===value.account&&forward.account===value.account&&forward.lineUserId===reverse.lineUserId&&forward.identityId&&forward.identityId===reverse.identityId;
  return {ok:true,active:true,recipient:valid?{userId:forward.lineUserId}:null};
 }
 if(personOnly)return {ok:true,person:person?{name:person.name}:null};
 if(!person)throw fail('分享者已非有效同仁。',403);
 const row=await env.DB.prepare("SELECT value FROM documents WHERE namespace='settings' AND key='organization'").first();
 const org=row?JSON.parse(row.value):null;if(!Array.isArray(org?.departments)||!Array.isArray(org?.people))throw fail('組織架構尚未準備完成。');
 const departments=org.departments.map(d=>({id:d.id,parentId:d.parentId||null,name:d.name})),ids=new Map(departments.map(d=>[d.id,d]));
 if(ids.size!==departments.length)throw fail('組織架構重複，請重新同步。');
 for(const d of departments){const seen=new Set();let p=d;while(p){if(typeof p.id!=='string'||typeof p.name!=='string'||seen.has(p.id)||p.parentId&&!ids.has(p.parentId))throw fail('組織架構無法確認。');seen.add(p.id);p=ids.get(p.parentId);}}
 const byAccount=new Map(org.people.map(p=>[p.account,p]));
 const people=active.employees.map(p=>({account:p.account,name:p.name,departments:[...new Set((byAccount.get(p.account)?.affiliations||[]).map(a=>a.departmentId).filter(id=>ids.has(id)))],department:p.department||''}));
 return {ok:true,organization:{revision:active.revision,departments,people}};
}

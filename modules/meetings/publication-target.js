import {failure} from './workspace-model.js';

export const PUBLICATION_TARGET_CONTRACT='host-selected-published-group-reader-v1';
const stages=new Set(['setup','processing','review','failed']);
// The recording's conversation is immutable. Only this explicit publication
// destination changes; task identities, Notion storage and draft editors do not.
export function meetingPublication({pool,store,botId,getConversation,assertMember}){
 const describe=row=>({key:row.key,botId:row.bot_id,sourceId:row.source_id,kind:row.source_kind,tenantKey:row.tenant_key||'',name:row.display_name||(row.source_kind==='user'?'個人對話':'LINE 群組')});
 const active=row=>row?.bot_id===botId&&!['left','blocked'].includes(row.connection_state);
 async function protectedRoute(db=pool){const result=await db.query(`SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='central_archive.meeting_workspaces'::regclass AND tgname='meeting_publication_route_guard' AND NOT tgisinternal AND tgenabled IN ('O','A')) AS ready`);if(!result.rows[0].ready)throw failure(503,'發布群組保護尚未安裝完成，原內容與群組保持，請聯絡管理者。');}
 async function status(r,source){const target=r.receipt?.publicationTarget||describe(source);let name=target.name;if(target.key!==source.key){const current=await getConversation(target.key);if(current?.bot_id===target.botId&&current.source_id===target.sourceId&&current.source_kind===target.kind&&current.tenant_key===target.tenantKey)name=current.display_name||name;}return {key:target.key,name,kind:target.kind,original:target.key===r.conversation_key,version:Number(r.field_versions.publication_target||0),locked:!stages.has(r.state)};}
 async function checked(r,source,key,actorId,reading=false,db=pool){
  if(!active(source)||!reading&&!source.enabled)throw failure(409,'來源對話目前不可用，請重新讀取群組。');
  const target=key===source.key?source:await getConversation(key,db);
  if(!active(source)||!active(target))throw failure(409,'來源或發布群組目前不可用，請重新讀取群組。');
  if(key!==source.key){
   if(!['group','room'].includes(target.source_kind))throw failure(400,'請選擇 LINE 群組或多人聊天室。');
   if(!source.tenant_key||target.tenant_key!==source.tenant_key)throw failure(403,'只能選擇與來源相同單位的群組。');
  }
  if(actorId&&key!==source.key)await assertMember(target,actorId);
  return target;
 }
 async function list(r,source,actor){
  if(actor.id!==r.host_id)throw failure(403,'只有主持人可以選擇發布群組。');
  const rows=source.tenant_key?(await pool.query(`SELECT c.key FROM central_archive.conversations c JOIN central_archive.meeting_settings s ON s.conversation_key=c.key WHERE c.bot_id=$1 AND c.source_kind IN ('group','room') AND s.tenant_key=$2 AND s.connection_state NOT IN ('left','blocked') ORDER BY c.display_name,c.key`,[botId,source.tenant_key])).rows:[];
  const choices=[describe(source)];for(let i=0;i<rows.length;i+=5)await Promise.all(rows.slice(i,i+5).map(async({key})=>{if(key===source.key)return;try{choices.push(describe(await checked(r,source,key,actor.id)));}catch{ /* Unverified membership never exposes a group name. */ }}));
  return choices.map(({key,name,kind})=>({key,name,kind})).sort((a,b)=>a.key===source.key?-1:b.key===source.key?1:a.name.localeCompare(b.name,'zh-Hant')||a.key.localeCompare(b.key));
 }
 async function save(r,actor,input){
  if(!/^[a-f0-9]{64}$/.test(input.key||'')||!Number.isSafeInteger(input.version)||input.version<0)throw failure(400,'發布群組格式或版本不正確。');
  return store.locked(r.id,async(current,db)=>{
   if(actor.id!==current.host_id)throw failure(403,'只有主持人可以選擇發布群組。');
   if(!stages.has(current.state))throw failure(409,'已開始發布，發布群組已鎖定。');
   const version=Number(current.field_versions.publication_target||0);if(version!==input.version)throw failure(409,'發布群組已更新，請比較最新選擇後再儲存。');
   const source=await getConversation(current.conversation_key,db);if(!active(source))throw failure(409,'來源對話目前不可用。');await assertMember(source,actor.id);const target=describe(await checked(current,source,input.key,actor.id,false,db));
   if(target.key!==current.conversation_key)await protectedRoute(db);
   const before=current.receipt.publicationTarget||describe(source);if(JSON.stringify(before)===JSON.stringify(target))return current;
   const revision=Number(current.revision)+1;
   await db.query(`UPDATE central_archive.meeting_workspaces SET receipt=jsonb_set(receipt,'{publicationTarget}',$2::jsonb),field_versions=$3::jsonb,revision=$4,updated_at=now() WHERE id=$1`,[r.id,JSON.stringify(target),JSON.stringify({...current.field_versions,publication_target:version+1}),revision]);
   await db.query(`INSERT INTO central_archive.meeting_workspace_edits(workspace_id,revision,actor_id,actor_name,field,before_value,after_value) VALUES($1,$2,$3,$4,'publication_target',$5::jsonb,$6::jsonb)`,[r.id,revision,actor.id,actor.name,JSON.stringify(before),JSON.stringify(target)]);
   return store.get(r.id,db);
  });
 }
 async function resolve(r,source,actorId=r.host_id,reading=false){
  const saved=r.receipt?.publicationTarget,target=await checked(r,source,saved?.key||source.key,actorId,reading);
  if(!reading&&target.key!==source.key)await protectedRoute();
  if(saved&&(saved.botId!==target.bot_id||saved.sourceId!==target.source_id||saved.kind!==target.source_kind||saved.tenantKey!==(target.tenant_key||'')||target.key!==source.key&&saved.tenantKey!==(source.tenant_key||'')))throw failure(409,'發布群組的身分或單位已改變，請重新核對。');
  return target;
 }
 async function reader(r,userId){
  const saved=r?.receipt?.publicationTarget;if(r?.state!=='published'||!saved||saved.key===r.conversation_key)return false;
  try{const source=await getConversation(r.conversation_key),target=await resolve(r,source,null,true);if(!['group','room'].includes(target.source_kind))return false;await assertMember(target,userId);return true;}catch{return false;}
 }
 async function claim(r){
  const alternate=r.state==='publishing'&&r.receipt?.publicationTarget?.key&&r.receipt.publicationTarget.key!==r.conversation_key;
  // Legacy workers only inspect lease_until. Infinity hides alternate-target
  // jobs from them during rolling deployment or rollback; this version alone
  // recovers them using its separate, finite receipt lease.
  return alternate?pool.query(`UPDATE central_archive.meeting_workspaces SET lease_until='infinity',receipt=receipt||jsonb_build_object('publicationLeaseUntil',now()+interval '2 minutes') WHERE id=$1 AND state='publishing' AND (receipt->>'publicationLeaseUntil' IS NULL OR (receipt->>'publicationLeaseUntil')::timestamptz<now()) RETURNING id`,[r.id]):pool.query(`UPDATE central_archive.meeting_workspaces SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND state=$2 AND (lease_until IS NULL OR lease_until<now()) RETURNING id`,[r.id,r.state]);
 }
 async function defer(id){return pool.query(`UPDATE central_archive.meeting_workspaces SET error_code='發布尚未全部完成，內容已鎖定；系統會續作，請勿重建會議。',lease_until=CASE WHEN receipt->'publicationTarget'->>'key'<>conversation_key THEN 'infinity'::timestamptz ELSE now()+interval '60 seconds' END,receipt=CASE WHEN receipt->'publicationTarget'->>'key'<>conversation_key THEN receipt||jsonb_build_object('publicationLeaseUntil',now()+interval '60 seconds') ELSE receipt END WHERE id=$1 AND state='publishing'`,[id]);}
 return {status,list,save,resolve,reader,claim,defer};
}

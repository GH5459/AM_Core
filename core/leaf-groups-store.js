import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Pool} from 'pg';
import {archiveDatabaseConfig} from './central-archive/index.js';
import {digest} from './central-archive/store.js';
const marker='groupDispatch';
const canonical=(bot,e)=>`in:${digest(`${bot}:${e.type}:${e.message?.id||e.webhookEventId}`)}`;
export function createGroupStore({env=process.env,pool:injected,now=Date.now}){
  const bot=env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID;let pool=injected;
  const db=()=>pool||(pool=new Pool({...archiveDatabaseConfig(env),max:3,connectionTimeoutMillis:8000}));
  async function tx(fn){const c=await db().connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
  const select=`SELECT j.key,j.payload->'event' AS event,j.payload->'${marker}' AS dispatch FROM central_archive.jobs j JOIN central_archive.conversations c ON c.key=j.conversation_key`;
  async function insert(event,kind='message',input={}){return tx(async c=>{
    const key=canonical(bot,event),row=(await c.query(`${select} WHERE j.key=$1 AND c.bot_id=$2 AND c.source_kind='group' FOR UPDATE OF j`,[key,bot])).rows[0];
    const e=row?.event;
    if(!e||e.source.groupId!==event.source.groupId||e.source.userId!==event.source.userId||e.timestamp!==event.timestamp
      ||!isDeepStrictEqual(e.message||{},JSON.parse(JSON.stringify((({quoteToken,...message})=>message)(event.message||{}))))||e.postback?.data!==event.postback?.data)throw Error('group_source_not_archived');
    if(row.dispatch)return false;
    const value={id:digest(key).slice(0,48),kind,phase:'queued',revision:1,promptedRevision:0,availableAt:now(),leaseUntil:0,attempts:0,expiresAt:now()+30*86400000,...input};
    await c.query(`UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{${marker}}',$2::jsonb,true) WHERE key=$1`,[key,JSON.stringify(value)]);return true;
  });}
  async function lease(){return tx(async c=>{
    const rows=(await c.query(`${select} WHERE c.bot_id=$1 AND c.source_kind='group' AND j.payload->'${marker}' IS NOT NULL
      AND j.payload->'${marker}'->>'phase' NOT IN ('done','cancelled','ignored','expired')
      AND (j.payload->'${marker}'->>'availableAt')::bigint<=$2 AND (j.payload->'${marker}'->>'leaseUntil')::bigint<=$2
      ORDER BY CASE WHEN j.payload->'${marker}'->>'kind'='control' THEN 0 ELSE 1 END,j.event_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,[bot,now()])).rows;
    if(!rows.length)return null;const row=rows[0],p={...row.dispatch,lease:crypto.randomUUID(),leaseUntil:now()+180000,attempts:row.dispatch.attempts+1};
    await c.query(`UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{${marker}}',$2::jsonb,true) WHERE key=$1`,[row.key,JSON.stringify(p)]);return {...row,dispatch:p};
  });}
  async function save(row,p,delay=0){return tx(async c=>{
    const value={...p,lease:null,leaseUntil:0,availableAt:now()+delay*1000};
    return (await c.query(`UPDATE central_archive.jobs j SET payload=jsonb_set(payload,'{${marker}}',$3::jsonb || CASE WHEN j.payload->'${marker}'->>'sourceRemoved'='true' THEN '{"sourceRemoved":true}'::jsonb ELSE '{}'::jsonb END,true) FROM central_archive.conversations c
      WHERE j.conversation_key=c.key AND c.bot_id=$1 AND j.key=$2 AND j.payload->'${marker}'->>'lease'=$4
      AND (j.payload->'${marker}'->>'leaseUntil')::bigint>$5 RETURNING j.key`,[bot,row.key,JSON.stringify(value),row.dispatch.lease,now()])).rows.length===1;
  });}
  async function checkpoint(row,p){return tx(async c=>(await c.query(`UPDATE central_archive.jobs j SET payload=jsonb_set(payload,'{${marker}}',
    $3::jsonb || CASE WHEN j.payload->'${marker}'->>'sourceRemoved'='true' THEN '{"sourceRemoved":true}'::jsonb ELSE '{}'::jsonb END,true)
    FROM central_archive.conversations c WHERE j.conversation_key=c.key AND c.bot_id=$1 AND j.key=$2
    AND j.payload->'${marker}'->>'lease'=$4 AND (j.payload->'${marker}'->>'leaseUntil')::bigint>$5 RETURNING j.key`,
    [bot,row.key,JSON.stringify({...p,lease:row.dispatch.lease,leaseUntil:now()+180000}),row.dispatch.lease,now()])).rows.length===1);}
  async function active(row){return tx(async c=>(await c.query(`${select} WHERE j.key=$1 AND c.bot_id=$2 AND j.payload->'${marker}'->>'lease'=$3
    AND (j.payload->'${marker}'->>'leaseUntil')::bigint>$4`,[row.key,bot,row.dispatch.lease,now()])).rows[0]||null);}
  async function owned(id,group,user){return tx(async c=>(await c.query(`${select} WHERE c.bot_id=$1 AND c.source_id=$2 AND c.source_kind='group'
    AND j.payload->'${marker}'->>'id'=$3 AND j.payload->'event'->'source'->>'userId'=$4`,[bot,group,id,user])).rows[0]||null);}
  async function drafts(group,user,topic=''){return tx(async c=>(await c.query(`${select} WHERE c.bot_id=$1 AND c.source_id=$2 AND c.source_kind='group'
    AND j.payload->'event'->'source'->>'userId'=$3 AND j.payload->'${marker}'->>'mode'='meeting'
    AND j.payload->'${marker}'->>'phase' IN ('preview','confirmation') AND ($4='' OR j.payload->'${marker}'->'prepared'->'event'->>'topic'=$4)`,[bot,group,user,topic])).rows);}
  async function control(id,event,action,revision,prepared){return tx(async c=>{
    const row=(await c.query(`${select} WHERE c.bot_id=$1 AND c.source_kind='group' AND c.source_id=$2 AND j.payload->'${marker}'->>'id'=$3 FOR UPDATE OF j`,[bot,event.source.groupId,id])).rows[0];
    if(!row||row.event.source.userId!==event.source.userId)return {code:'owner'};const p=row.dispatch;
    if(p.leaseUntil>now())return {code:'busy'};
    if(p.revision!==revision)return {code:'changed'};
    if(!['preview','confirmation'].includes(p.phase))return {code:'closed'};
    if(action==='confirm'&&(p.prepared.missing.length||p.promptedRevision!==p.revision))return {code:p.prepared.missing.length?'timing':'changed'};
    const next=action==='edit'?{...p,prepared,revision:p.revision+1,promptedRevision:0,phase:'preview'}
      :{...p,phase:action==='confirm'?'fanout':'cancelled',confirmation:action==='confirm'?{eventId:event.webhookEventId,timestamp:event.timestamp,userId:event.source.userId}:null};
    next.availableAt=now();next.leaseUntil=0;next.lease=null;
    next.history=[...(p.history||[]),{action,eventId:event.webhookEventId,timestamp:event.timestamp}];
    await c.query(`UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{${marker}}',$2::jsonb,true) WHERE key=$1`,[row.key,JSON.stringify(next)]);return {code:'ok'};
  });}
  async function removed(event){return tx(async c=>{
    const key=`in:${digest(`${bot}:message:${event.unsend?.messageId||event.message?.id}`)}`;
    await c.query(`UPDATE central_archive.jobs j SET payload=jsonb_set(payload,'{${marker},sourceRemoved}','true'::jsonb,true)
      FROM central_archive.conversations c WHERE j.conversation_key=c.key AND c.bot_id=$1 AND c.source_id=$2 AND j.key=$3 AND j.payload->'${marker}' IS NOT NULL`,[bot,event.source.groupId,key]);
  });}
  return {insert,lease,save,checkpoint,active,owned,drafts,control,removed,close:async()=>{if(!injected&&pool)await pool.end();}};
}

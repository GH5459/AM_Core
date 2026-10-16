import crypto from 'node:crypto';
export const MODES=['record_only','review_only','review_and_create'];
export const keyFor=(bot,source)=>crypto.createHash('sha256').update(`${bot}:${source.type}:${source.groupId||source.roomId||source.userId}`).digest('hex');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function validateChange(input) {
  if(!input||Object.keys(input).some(k=>!['key','enabled','todoMode','tenantKey','version','operationId'].includes(k))
    ||! /^[a-f0-9]{64}$/.test(input.key||'')||typeof input.enabled!=='boolean'
    ||!MODES.includes(input.todoMode)||! /^[a-z0-9-]{0,70}$/.test(input.tenantKey||'')
    ||!Number.isSafeInteger(input.version)||input.version<1
    ||! /^[a-zA-Z0-9_-]{16,80}$/.test(input.operationId||''))throw Object.assign(Error('設定格式不正確。'),{status:400});
  return input;
}
export function createMeetingConversationStore(pool,botId) {
  async function transaction(work){const db=await pool.connect();try{await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}}
  async function seed(){await pool.query(`INSERT INTO central_archive.meeting_settings(conversation_key)
    SELECT key FROM central_archive.conversations WHERE bot_id=$1 AND source_kind IN ('user','group','room')
    ON CONFLICT DO NOTHING`,[botId]);}
  async function list(){await seed();return(await pool.query(`SELECT c.key,c.source_kind,c.source_id,c.display_name,c.drive_folder_id,
    s.*, (SELECT max(j.event_at) FROM central_archive.jobs j WHERE j.conversation_key=c.key) AS last_activity,
    (SELECT p.state FROM central_archive.meeting_pending p WHERE p.conversation_key=c.key) AS processing_state,
    (SELECT p.updated_at FROM central_archive.meeting_pending p WHERE p.conversation_key=c.key) AS processing_updated_at
    FROM central_archive.conversations c JOIN central_archive.meeting_settings s ON s.conversation_key=c.key
    WHERE c.bot_id=$1 AND c.source_kind IN ('user','group','room') ORDER BY c.display_name,c.key`,[botId])).rows;}
  async function get(key,db=pool){return(await db.query(`SELECT c.key,c.bot_id,c.source_kind,c.source_id,c.display_name,c.drive_folder_id,s.*
    FROM central_archive.conversations c JOIN central_archive.meeting_settings s ON s.conversation_key=c.key
    WHERE c.bot_id=$1 AND c.key=$2`,[botId,key])).rows[0];}
  async function change(input,actor,validate=async()=>{}){
    validateChange(input);return transaction(async db=>{
      // Locks unknown operations too, so two concurrent retries cannot both mutate settings.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[input.operationId]);
      const prior=(await db.query('SELECT * FROM central_archive.meeting_changes WHERE operation_id=$1',[input.operationId])).rows[0];
      const inputHash=hash(input);
      if(prior){if(prior.input_hash!==inputHash||prior.actor!==actor)throw Object.assign(Error('操作識別已使用，請重新讀取設定。'),{status:409});return prior.result;}
      await db.query('SELECT conversation_key FROM central_archive.meeting_settings WHERE conversation_key=$1 FOR UPDATE',[input.key]);
      const row=await get(input.key,db);if(!row)throw Object.assign(Error('找不到對話。'),{status:404});
      if(Number(row.version)!==input.version)throw Object.assign(Error('設定已被更新，請重新讀取；本次未覆寫。'),{status:409});
      await validate(input,row);
      const updated=(await db.query(`UPDATE central_archive.meeting_settings SET enabled=$2,todo_mode=$3,tenant_key=$4,
        version=version+1,updated_by=$5,updated_at=now() WHERE conversation_key=$1 RETURNING *`,[input.key,input.enabled,input.todoMode,input.tenantKey||'',actor])).rows[0];
      const result={ok:true,key:input.key,version:Number(updated.version)};
      await db.query(`INSERT INTO central_archive.meeting_changes(operation_id,conversation_key,actor,input_hash,result)
        VALUES($1,$2,$3,$4,$5::jsonb)`,[input.operationId,input.key,actor,inputHash,JSON.stringify(result)]);
      return result;
    });
  }
  return {seed,list,get,change,transaction};
}

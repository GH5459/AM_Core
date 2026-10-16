export function createArchiveTaskPhotos({pool,botId,canAccess,verifyRow}){
 async function rows(source,quote='',exact=false){
  if(source.type!=='group'||!await canAccess(source))throw Error('archive_photo_access_denied');
  const result=await pool.query(`SELECT j.*,c.source_id,c.source_kind,c.drive_folder_id FROM central_archive.jobs j
   JOIN central_archive.conversations c ON c.key=j.conversation_key
   WHERE c.bot_id=$1 AND c.source_kind='group' AND c.source_id=$2 AND j.has_binary=true
   AND j.payload->>'direction'='incoming' AND j.payload->'event'->'message'->>'type'='image'
   AND j.result->>'driveId' IS NOT NULL
   AND (j.payload->'event'->'message'->>'id'=$3 OR (NOT $4 AND j.event_at>now()-interval '7 days'))
   AND NOT EXISTS(SELECT 1 FROM central_archive.jobs u WHERE u.conversation_key=j.conversation_key
    AND u.payload->'event'->>'type'='unsend' AND u.payload->'event'->'unsend'->>'messageId'=j.payload->'event'->'message'->>'id')
   ORDER BY (j.payload->'event'->'message'->>'id'=$3) DESC,j.event_at DESC LIMIT 10`,[botId,source.groupId,quote,exact]);
  if(result.rows.some(r=>r.source_id!==source.groupId||r.source_kind!=='group'))throw Error('archive_photo_source_mismatch');
  return result.rows;
 }
 return {
  async taskPhotos(source,quote=''){return (await rows(source,quote)).map(r=>({messageId:r.payload.event.message.id,name:String(r.result.name||'群組截圖').slice(0,240),at:r.event_at}));},
  async taskPhoto(source,id){const found=await rows(source,id,true);if(found.length!==1)throw Error('archive_photo_unavailable');return verifyRow(found[0],{groupId:source.groupId,userId:source.userId});}
 };
}

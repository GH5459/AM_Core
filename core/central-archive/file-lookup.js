// Filename lookup is bounded to this OA and the requesting conversation.
// Membership is checked again when signed links are resolved and before replies.
export function createArchiveFileLookup({pool,botId,canAccess,verifyRow}) {
 return async function findOriginal(filename,source){
  if(typeof filename!=='string'||!filename.trim()||filename.length>300)throw Object.assign(Error('specify'),{code:'specify'});
  if(!await canAccess(source))throw Error('archive_file_access_denied');
  const kind=source.type,id=source.groupId||source.roomId;
  const result=await pool.query(`SELECT j.*,c.source_id,c.source_kind,c.drive_folder_id FROM central_archive.jobs j
    JOIN central_archive.conversations c ON c.key=j.conversation_key
    WHERE c.bot_id=$1 AND c.source_kind=$2 AND c.source_id=$3 AND j.has_binary=true
    AND j.payload->>'direction'='incoming'
    AND (j.result->>'name'=$4 OR j.payload->'event'->'message'->>'fileName'=$4
      OR j.payload->>'legacyFileName'=$4 OR j.payload->'media'->>'name'=$4)
    ORDER BY j.event_at DESC LIMIT 2`,[botId,kind,id,filename.trim()]);
  if(result.rows.length>1)throw Object.assign(Error('ambiguous'),{code:'ambiguous'});
  if(!result.rows.length)return null;
  const row=result.rows[0];
  if(row.source_id!==id||row.source_kind!==kind)throw Error('archive_file_source_mismatch');
  return verifyRow(row,{groupId:id,userId:source.userId});
 };
}

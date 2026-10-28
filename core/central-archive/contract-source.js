// Read only the exact conversation authorized by the current Engineering binding.
const plain = items => (items || []).map(x => x.plain_text || x.text?.content || '').join('');
const same = (a,b) => String(a||'').replaceAll('-','').toLowerCase() === String(b||'').replaceAll('-','').toLowerCase();
const fail = message => Object.assign(new Error(message), {statusCode:409,code:'CONTRACT_ARCHIVE_SOURCE_UNAVAILABLE'});
export function createContractConversationSource({pool,botId,notion,router,parentId}) {
  return async function contractMessages({tenantKey,groupBindingId,lineGroupId,endedAt}) {
    if(tenantKey!=='engineering'||!/^C[a-f0-9]{32}$/i.test(lineGroupId||'')) throw fail('工程群組來源不合法。');
    router.invalidate?.(lineGroupId);
    const route=await router.resolveGroupBinding(lineGroupId);
    if(route.tenant?.key!==tenantKey||!same(route.binding?.pageId,groupBindingId)||route.binding?.status!=='啟用')
      throw fail('工程群組的目前授權與合約不一致。');
    const found=await pool.query(`SELECT key,database_id,data_source_id FROM central_archive.conversations
      WHERE bot_id=$1 AND source_kind='group' AND source_id=$2`,[botId,lineGroupId]);
    if(found.rows.length!==1||!found.rows[0].data_source_id) throw fail('找不到已保存的群組對話來源。');
    const c=found.rows[0];
    const pending=await pool.query(`SELECT count(*)::int AS count FROM central_archive.jobs
      WHERE conversation_key=$1 AND event_at<=$2 AND state NOT IN ('done','needs_source')`,[c.key,endedAt]);
    if(pending.rows[0].count) throw fail('群組尚有訊息或附件等待保存，請稍後再封存。');
    const db=await notion.request('/databases/'+encodeURIComponent(c.database_id));
    if(db.archived||db.in_trash||!same(db.parent?.page_id,parentId)||!db.data_sources?.some(x=>same(x.id,c.data_source_id)))
      throw fail('群組對話資料庫來源驗證失敗。');
    const messages=[]; let cursor;
    do {
      const page=await notion.request('/data_sources/'+encodeURIComponent(c.data_source_id)+'/query','POST',{
        filter:{and:[{property:'LINE 對話 ID',rich_text:{equals:lineGroupId}},{property:'時間',date:{on_or_before:endedAt}}]},
        sorts:[{property:'時間',direction:'ascending'}],page_size:100,...(cursor?{start_cursor:cursor}:{})});
      for(const row of page.results||[]) {
        if(row.archived||row.in_trash) continue;
        const p=row.properties||{};
        if(plain(p['LINE 對話 ID']?.rich_text)!==lineGroupId) throw fail('對話中包含其他群組的資料。');
        const type=plain(p['訊息類型']?.rich_text), raw=plain(p['內容']?.rich_text);
        const name=plain(p['檔案名稱']?.rich_text), url=p['Google Drive']?.url||'';
        const fileId=url.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]||'';
        const binary=['image','file','video','audio'].includes(type);
        // Never publish webhook credentials embedded in non-text event JSON.
        const content=type==='text'?raw:binary?`[${type}] ${name}`:`[${type||'系統事件'}]`;
        messages.push({pageId:row.id,messageId:plain(p['LINE 訊息 ID']?.rich_text)||plain(p['識別碼']?.rich_text)||row.id,
          sender:plain(p['發送者']?.rich_text)||'未記錄發言人',time:p['時間']?.date?.start,
          messageType:({text:'文字',image:'照片',file:'檔案',audio:'音訊',video:'影片',sticker:'貼圖'})[type]||type,
          content,source:'central_archive',attachments:binary?[{name:name||`LINE-${type}`,fileId,
            sha256:plain(p['SHA256']?.rich_text),sizeBytes:p['檔案大小']?.number||0,
            status:plain(p['附件狀態']?.rich_text)}]:[]});
      }
      if(messages.length>5000) throw fail('本次對話超過 5,000 則，請分批封存。');
      if(page.has_more&&!page.next_cursor) throw fail('對話查詢未完整，請稍後再試。');
      cursor=page.has_more?page.next_cursor:null;
    } while(cursor);
    return messages;
  };
}

import {createMeetingConversationStore,keyFor} from './conversation-store.js';
import {verifyManagementRequest} from './management-auth.js';
import {readTaskOrigins} from './task-origins.js';
import {sendJson} from '../../core/util.js';
import {createMeetingWorkspace} from './workspace-service.js';

export const CONVERSATION_MEETINGS_CONTRACT='all-line-conversations-meetings-v1';
const id=v=>String(v||'').replaceAll('-','');
const plain=p=>(p?.rich_text||p?.title||[]).map(x=>x.plain_text||x.text?.content||'').join('');
const rich=s=>[{type:'text',text:{content:String(s||'').slice(0,1800)}}];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function createConversationMeetings({env,archive,platform,router,tenants,meetingModule,request:injectedRequest,logger=console}) {
  const enabled=env.AMCORE_CONVERSATION_MEETINGS_ENABLED==='1';
  if(!enabled)return {enabled:false,capture:async()=>[],drain:async()=>{},handle:async()=>false,health:()=>({enabled:false,contract:CONVERSATION_MEETINGS_CONTRACT})};
  const parentId=env.AMCORE_MEETINGS_PARENT_PAGE_ID;
  const secret=env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY;
  if(!/^[a-f0-9-]{32,36}$/i.test(parentId||'')||!archive.pool||!archive.config?.botId
    ||!meetingModule||String(secret||'').length<32)throw Error('conversation_meetings_configuration_incomplete');
  const pool=archive.pool,botId=archive.config.botId,store=createMeetingConversationStore(pool,botId);
  const request=injectedRequest||((path,method='GET',body)=>archive.notion.request(path,method,body));
  let draining=null;
  const active=new Map();
  const workspace=createMeetingWorkspace({pool,botId,platform,archive,env,context,tenantFor,getConversation:store.get,ensureDatabase,request,meetingModule,logger});
  async function limitedBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>20000)throw Object.assign(Error('設定資料過大。'),{status:413});chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks).toString('utf8');}

  function tenantFor(row,binding={}) {
    const base=tenants.find(t=>t.key===row.tenant_key&&t.runtimeEnabled!==false);
    return {...(base||{}),key:base?.key||'conversation-meetings',runtimeEnabled:true,
      parentPageId:id(parentId),meetingsParentPageId:parentId,conversationKey:row.key,
      modules:['meetings'],dataSources:{...(base?.dataSources||{}),...(row.data_source_id?{meetings:row.data_source_id}:{})},
      config:{...(base?.config||{}),meetings:{...(base?.config?.meetings||{}),
        formalTasksEnabled:Boolean(base?.config?.meetings?.formalTasksEnabled),
        privateOnly:row.source_kind==='user',conversationOwnerId:row.source_kind==='user'?row.source_id:'',
        liffId:base?.config?.meetings?.liffId||env.AMCORE_MEETINGS_LIFF_ID||''}},
      meetingBinding:{...binding,status:'啟用',meetingEnabled:row.enabled,meetingMode:row.todo_mode,capabilities:['會議'],
        groupName:row.display_name||'LINE 對話',members:binding.members||{}}};
  }
  async function validate(input,row){
    const tenant=tenants.find(t=>t.key===input.tenantKey&&t.runtimeEnabled!==false);
    if(input.tenantKey&&!tenant)throw Object.assign(Error('所屬單位不可用。'),{status:400});
    if(row.tenant_key&&row.tenant_key!==input.tenantKey)
      throw Object.assign(Error('既有對話的單位歸屬不能從會議開關變更。'),{status:409});
    if(input.enabled&&['left','blocked'].includes(row.connection_state))throw Object.assign(Error('葉小蝸目前無法接收此對話，請先重新加入。'),{status:409});
  }
  async function ensureDatabase(row){
    return store.transaction(async db=>{
      await db.query('SELECT conversation_key FROM central_archive.meeting_settings WHERE conversation_key=$1 FOR UPDATE',[row.key]);
      row=await store.get(row.key,db);
      let database;
      if(row.database_id){database=await request('/databases/'+row.database_id);
        if(database.archived||database.in_trash||id(database.parent?.page_id)!==id(parentId))throw Error('meeting_database_parent_mismatch');
      }else{
        // Recover an ambiguous create before attempting a new one, including after a restart.
        const marker='am-conversation-meeting:'+row.key;
        let cursor='',matches=[];
        do{const b=await request('/blocks/'+parentId+'/children?page_size=100'+(cursor?'&start_cursor='+cursor:''));
          for(const child of b.results||[])if(child.type==='child_database'&&child.child_database?.title?.endsWith(row.key.slice(0,8))){
            const candidate=await request('/databases/'+child.id);
            if(plain({rich_text:candidate.description})===marker)matches.push(candidate);
          }
          cursor=b.has_more?b.next_cursor:'';
        }while(cursor);
        if(matches.length>1)throw Error('meeting_duplicate_database_mapping');
        database=matches[0]||await request('/databases','POST',{parent:{type:'page_id',page_id:parentId},
          title:rich('會議記錄 · '+(row.display_name||({user:'個人對話',room:'多人聊天室',group:'LINE 群組'}[row.source_kind]))+' · '+row.key.slice(0,8)),
          description:rich(marker),is_inline:false,initial_data_source:{properties:{
            '會議':{title:{}},'日期':{date:{}},'類型':{select:{}},'參與者':{rich_text:{}},
            '原始錄音名稱':{rich_text:{}},'Google Drive 錄音':{url:{}},'錄音保存狀態':{rich_text:{}},'來源識別':{rich_text:{}}
            ,...(tenantFor(row).dataSources?.projects?{'專案':{relation:{data_source_id:tenantFor(row).dataSources.projects,single_property:{}}}}:{})
          }}});
      }
      const ds=database.data_sources?.[0]?.id;if(!ds)throw Error('meeting_database_source_missing');
      await db.query('UPDATE central_archive.meeting_settings SET database_id=$2,data_source_id=$3 WHERE conversation_key=$1',[row.key,database.id,ds]);
      const tenant=tenantFor({...row,database_id:database.id,data_source_id:ds});
      await platform.registerTenantDataSource(tenant,ds,'conversationMeetings');
      return {dbId:ds,perGroup:true};
    });
  }
  async function resolveTarget(tenant){const row=await store.get(tenant.conversationKey);if(!row)throw Error('meeting_conversation_missing');return ensureDatabase(row);}
  async function originalAudio(ctx){
    const source=ctx?.event?.source||{};const messageId=String(ctx?.event?.message?.id||ctx?.audioMessageId||'');
    if(!messageId)throw Error('meeting_original_source_missing');
    for(let n=0;n<60;n++){
      const item=await archive.original(messageId,source.type==='user'?{userId:source.userId}:{groupId:source.groupId||source.roomId});
      if(item?.file?.webViewLink)return item.file.webViewLink;
      if(item?.missing)throw Error('meeting_original_unavailable');
      await sleep(2000);
    }
    throw Error('meeting_original_pending');
  }
  async function savePending(entry){
    if(!entry.tenant?.conversationKey)return;
    const payload={event:entry.archiveSource?.event,filename:entry.filename,createdAt:entry.createdAt,senderName:entry.senderName,
      meetingMode:entry.meetingMode};
    if(payload.event){const {replyToken,...event}=payload.event;payload.event=event;}
    await pool.query(`INSERT INTO central_archive.meeting_pending(conversation_key,payload,state) VALUES($1,$2::jsonb,'waiting')
      ON CONFLICT(conversation_key) DO UPDATE SET payload=EXCLUDED.payload,state='waiting',updated_at=now()`,[entry.tenant.conversationKey,JSON.stringify(payload)]);
  }
  async function completePending(tenant,state){if(tenant?.conversationKey){
    const r=await pool.query(`UPDATE central_archive.meeting_pending SET state=$2,updated_at=now() WHERE conversation_key=$1
      ${state==='processing'?"AND state='waiting'":''} RETURNING conversation_key`,[tenant.conversationKey,state]);
    if(state==='processing'&&!r.rows.length)throw Error('meeting_wait_already_claimed');
  }}
  async function context(row,event,extra={}){
    const route=row.source_kind==='user'||!row.tenant_key?{}:await router.resolveGroupBinding(row.source_id);
    if(['lookup_failed','ambiguous'].includes(route.resolution)||route.tenant&&route.tenant.key!==row.tenant_key)
      throw Error('meeting_conversation_owner_changed');
    const tenant=tenantFor(row,route.binding||{});
    if(event.source.type==='user')tenant.meetingBinding.members={[extra.senderName||row.display_name||'本人']:row.source_id};
    return {tenant,binding:tenant.meetingBinding,event,message:event.message,groupId:row.source_id,
      senderName:extra.senderName||await platform.resolveSenderName(event.source),
      text:event.message?.type==='text'?event.message.text:'',audioMessageId:event.message?.id,
      filename:event.message?.fileName||`audio-${event.message?.id}.m4a`,...extra};
  }
  async function capture(events){
    await store.seed();const claimed=[];
    for(const event of events){
      if(!['user','group','room'].includes(event.source?.type))continue;
      const key=keyFor(botId,event.source);const row=await store.get(key);if(!row)continue;
      if(['join','follow','leave','unfollow'].includes(event.type))await pool.query(`UPDATE central_archive.meeting_settings SET connection_state=$2 WHERE conversation_key=$1`,
        [key,['leave','unfollow'].includes(event.type)?(event.type==='leave'?'left':'blocked'):'active']);
      if(event.type==='postback'&&String(event.postback?.data||'').startsWith('meetingwork:')){await workspace.choice(event,key);claimed.push(event);continue;}
      if(event.type!=='message')continue;
      await pool.query(`UPDATE central_archive.meeting_settings SET connection_state='active' WHERE conversation_key=$1 AND connection_state<>'active'`,[key]);
      const pending=(await pool.query(`SELECT state FROM central_archive.meeting_pending WHERE conversation_key=$1`,[key])).rows[0];
      const audio=meetingModule.isAudio(event.message);
      const queuedAudio=(await pool.query(`SELECT 1 FROM central_archive.meeting_events WHERE conversation_key=$1 AND state='pending' AND payload->'message'->>'type' IN ('audio','file') LIMIT 1`,[key])).rows.length>0;
      // New workspaces collect settings on the web. Do not consume subsequent
      // group discussion as a legacy roster reply while an audio job is queued.
      const roster=event.message?.type==='text'&&(pending?.state==='waiting'||queuedAudio&&!(event.timestamp>=Number(env.AMCORE_MEETING_WORKSPACE_CUTOVER_AT||'0')&&await workspace.accepts(event)));
      if(!audio&&!roster)continue;
      claimed.push(event);
      if(!row.enabled)continue;
      const {replyToken,deliveryContext,...payload}=event;
      if(payload.message){const {quoteToken,...message}=payload.message;payload.message=message;}
      await pool.query(`INSERT INTO central_archive.meeting_events(event_key,conversation_key,event_at,payload)
        VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,['event:'+key+':'+(event.webhookEventId||event.message.id),key,new Date(event.timestamp).toISOString(),JSON.stringify(payload)]);
    }
    return claimed;
  }
  async function restore(){
    const rows=(await pool.query(`SELECT p.* FROM central_archive.meeting_pending p JOIN central_archive.meeting_settings s USING(conversation_key)
      JOIN central_archive.conversations c ON c.key=p.conversation_key WHERE p.state='waiting' AND s.enabled=true
      AND s.connection_state NOT IN ('left','blocked') AND c.bot_id=$1`,[botId])).rows;
    for(const p of rows){const row=await store.get(p.conversation_key);const ctx=await context(row,p.payload.event,{ackSent:true,createdAt:p.payload.createdAt,senderName:p.payload.senderName});
      if(!meetingModule.hasPending(ctx.tenant,row.source_id))await meetingModule.onAudio(ctx);
    }
  }
  async function drain(){if(draining)return draining;
    draining=(async()=>{
      const db=await pool.connect();let locked=false;
      try{
        locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',['conversation-meetings:'+botId])).rows[0].acquired;
        if(!locked)return;
        await workspace.drain();
        await restore();
        const rows=(await db.query(`SELECT e.* FROM central_archive.meeting_events e JOIN central_archive.conversations c ON c.key=e.conversation_key
          WHERE e.state='pending' AND c.bot_id=$1 ORDER BY e.event_at,e.event_key LIMIT 10`,[botId])).rows;
        for(const job of rows){
          const row=await store.get(job.conversation_key);if(!row?.enabled){await db.query(`UPDATE central_archive.meeting_events SET state='disabled' WHERE event_key=$1`,[job.event_key]);continue;}
          try{const ctx=await context(row,job.payload);
            if(active.has(row.key))continue;
            const prior=(await db.query('SELECT payload,state FROM central_archive.meeting_pending WHERE conversation_key=$1',[row.key])).rows[0];
            if(meetingModule.isAudio(job.payload.message)){
              if(job.payload.timestamp>=Number(env.AMCORE_MEETING_WORKSPACE_CUTOVER_AT||'0')&&await workspace.accepts(job.payload)){
                await workspace.offer(row,job.payload,ctx.filename,ctx.senderName);
                await db.query(`UPDATE central_archive.meeting_events SET state='completed' WHERE event_key=$1`,[job.event_key]);continue;
              }
              // savePending happens before the prompt. A redelivery after a crash
              // must not replace the saved wait, repeat processing or send a task.
              if(prior?.payload?.event?.message?.id!==job.payload.message.id){
                if(['waiting','processing'].includes(prior?.state))continue;
                await meetingModule.onAudio(ctx);
              }
            }else if(prior?.state==='waiting'){
              if(active.size>=2)continue;
              await db.query(`UPDATE central_archive.meeting_events SET state='processing' WHERE event_key=$1`,[job.event_key]);
              const work=meetingModule.onMessage(ctx).then(()=>pool.query(`UPDATE central_archive.meeting_events SET state='completed' WHERE event_key=$1`,[job.event_key]))
                .catch(async()=>{await pool.query(`UPDATE central_archive.meeting_events SET state='failed',error_code='meeting_processing_failed' WHERE event_key=$1`,[job.event_key]);logger.warn('Meeting processing interrupted; original retained.');})
                .finally(()=>active.delete(row.key))
                .catch(()=>logger.warn('Meeting checkpoint unavailable; original source retained.'));
              active.set(row.key,work);continue;
            }
            await db.query(`UPDATE central_archive.meeting_events SET state='completed' WHERE event_key=$1`,[job.event_key]);
          }catch{await db.query(`UPDATE central_archive.meeting_events SET state='failed',error_code='meeting_processing_failed' WHERE event_key=$1`,[job.event_key]);logger.warn('Conversation meeting processing failed; original retained.');}
        }
        // New verified conversations receive their own empty meeting database;
        // this does not turn on recording or reprocess historical messages.
        const missing=(await db.query(`SELECT c.key FROM central_archive.conversations c JOIN central_archive.meeting_settings s ON s.conversation_key=c.key
          WHERE c.bot_id=$1 AND s.database_id IS NULL ORDER BY c.created_at LIMIT 2`,[botId])).rows;
        for(const item of missing)await ensureDatabase(await store.get(item.key));
      }finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['conversation-meetings:'+botId]);db.release();}
    })().finally(()=>{draining=null;});return draining;
  }
  async function handle(req,res,url){
    if(await workspace.handle(req,res,url))return true;
    if(!url.pathname.startsWith('/integrations/meeting-management/'))return false;
    try{
      const body=req.method==='GET'?'':await limitedBody(req);
      if(body.length>20000)return sendJson(res,413,{error:'設定資料過大。'}),true;
      if(!verifyManagementRequest(secret,req,body))return sendJson(res,401,{error:'Unauthorized'}),true;
      if(req.method==='POST'&&url.pathname==='/integrations/meeting-management/task-origins'){
        return sendJson(res,200,await readTaskOrigins(JSON.parse(body),{pool,botId})),true;
      }
      if(req.method==='GET'&&url.pathname==='/integrations/meeting-management/conversations'){
        const rows=await store.list();return sendJson(res,200,{contract:CONVERSATION_MEETINGS_CONTRACT,conversations:rows.map(r=>({
          key:r.key,name:r.display_name||'尚未取得名稱',type:r.source_kind,status:r.legacy_status||'啟用',connection:r.connection_state,
          enabled:r.enabled,todoMode:r.todo_mode,tenantKey:r.tenant_key,version:Number(r.version),lastActivity:r.last_activity,
          processingState:r.processing_state||'',processingUpdatedAt:r.processing_updated_at,settingsUpdatedAt:r.updated_at,
          notionUrl:r.database_id?'https://www.notion.so/'+id(r.database_id):'',
          driveUrl:r.drive_folder_id?'https://drive.google.com/drive/folders/'+r.drive_folder_id:''})),
          tenants:tenants.filter(t=>t.runtimeEnabled!==false).map(t=>({key:t.key,name:t.displayName,
            formalTasks:Boolean(t.config?.meetings?.formalTasksEnabled&&t.dataSources?.tasks)}))}),true;
      }
      if(req.method==='PUT'&&url.pathname==='/integrations/meeting-management/conversations'){
        const input=JSON.parse(body);const result=await store.change(input,String(req.headers['x-meeting-actor']),validate);
        if(input.enabled)await ensureDatabase(await store.get(input.key));
        return sendJson(res,200,result),true;
      }
      return sendJson(res,404,{error:'Not found'}),true;
    }catch(error){return sendJson(res,error.status||503,{error:error.status?error.message:'會議服務暫時無法連線，請保留修改後重試。'}),true;}
  }
  async function resolveOwner(pageId){
    const page=await request('/pages/'+pageId);const ds=page.parent?.data_source_id;
    if(!ds)return null;
    const rows=(await pool.query(`SELECT c.key,c.source_kind,c.source_id,c.display_name,s.* FROM central_archive.meeting_settings s
      JOIN central_archive.conversations c ON c.key=s.conversation_key WHERE c.bot_id=$1 AND replace(s.data_source_id,'-','')=$2`,[botId,id(ds)])).rows;
    if(rows.length!==1)return null;
    const tenant=tenantFor(rows[0]);await platform.registerTenantDataSource(tenant,ds,'conversationMeetings');return tenant;
  }
  Object.assign(platform,{resolveConversationMeetingTarget:resolveTarget,archiveConversationMeetingAudio:originalAudio,
    saveMeetingPending:savePending,completeMeetingPending:completePending,resolveConversationMeetingOwner:resolveOwner,
    conversationMeetingsEnabled:true,acceptConversationMeetingAudio:async ctx=>{
      const event={...ctx.event,message:{...ctx.event.message,fileName:ctx.filename}};
      await capture([event]);drain().catch(()=>logger.warn('Meeting intake deferred.'));return true;
    }});
  return {enabled,store,ensureDatabase,tenantFor,capture,drain,handle,settle:()=>Promise.all([...active.values()]),
    workspace,health:()=>({enabled:true,contract:CONVERSATION_MEETINGS_CONTRACT,storage:'notion-per-conversation+drive-original',settings:'meeting-switch-only',workspace:workspace.health()})};
}

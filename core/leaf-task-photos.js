import crypto from 'node:crypto';
import {createAttachmentDelivery} from './attachment-delivery.js';
import {QUOTED_ARCHIVE_SCOPE} from './attachment-retrieval.js';
export const PHOTO_CONTRACT='line-task-photo-selection-v1';
export const TASK_EDIT_CONTRACT='line-task-edit-card-v1';
export function taskEditNotice(base,taskIds,notice){
 const origin=new URL(base);if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('invalid_task_origin');
 return {type:'flex',altText:notice,contents:{type:'bubble',body:{type:'box',layout:'vertical',contents:[{type:'text',text:notice,wrap:true,size:'sm'}]},footer:{type:'box',layout:'vertical',contents:taskIds.slice(0,5).map((id,i)=>{
  if(!/^[\w-]{1,100}$/.test(id))throw Error('invalid_task_id');const uri=new URL('/',origin);uri.searchParams.set('task',id);uri.searchParams.set('openExternalBrowser','1');
  return {type:'button',height:'sm',action:{type:'uri',label:taskIds.length===1?'編輯這個任務':`編輯任務 ${i+1}`,uri:uri.href}};
 })}}};
}
const prefix='taskphoto:';
const text=t=>({type:'text',text:t});
const button=(label,data)=>({type:'button',height:'sm',action:{type:'postback',label,data}});
// Ordinary Flex actions remain visible on desktop as well as mobile LINE.
export function photoActions(message,actions){return {type:'flex',altText:message,contents:{type:'bubble',body:{type:'box',layout:'vertical',contents:[{type:'text',text:message,wrap:true,size:'sm'}]},footer:{type:'box',layout:'vertical',contents:actions.map(([label,data])=>button(label,data))}}};}
export function photoNotice(id,taskIds,notice){return {type:'flex',altText:notice,contents:{type:'bubble',body:{type:'box',layout:'vertical',contents:[{type:'text',text:notice,wrap:true,size:'sm'}]},footer:{type:'box',layout:'vertical',contents:taskIds.slice(0,5).map((_,i)=>button(taskIds.length===1?'選擇群組照片':`任務 ${i+1}：選擇照片`,`${prefix}open:${id}:${i}`))}}};}
export function photoCard(id,index,state,images={}){
 const root=`${prefix}`,selected=new Set(state.selected),make=(c,i)=>({type:'bubble',size:'kilo',...(images[c.messageId]?{hero:{type:'image',url:images[c.messageId],size:'full',aspectRatio:'4:3',aspectMode:'fit'}}:{}),body:{type:'box',layout:'vertical',contents:[{type:'text',text:`照片 ${i+1}${selected.has(c.messageId)?' ✓ 已選取':''}`,weight:'bold'},{type:'text',text:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(c.at)),size:'sm',wrap:true},{type:'text',text:c.name,wrap:true,size:'xs'}]},footer:{type:'box',layout:'vertical',contents:[button(selected.has(c.messageId)?'取消選取':'選取這張',`${root}set:${id}:${index}:${state.version}:${i}:${selected.has(c.messageId)?0:1}`)]}});
 const contents=state.candidates.map(make);contents.push({type:'bubble',size:'kilo',body:{type:'box',layout:'vertical',contents:[{type:'text',text:`已選 ${selected.size} 張`,weight:'bold'},{type:'text',text:'左右滑動選照片，最後按確認加入。只有原交辦人可以操作；候選為本群最近照片，請核對內容。',wrap:true,size:'sm'}]},footer:{type:'box',layout:'vertical',contents:[button('確認加入任務',`${root}confirm:${id}:${index}:${state.version}`),button('重新顯示照片',`${root}show:${id}:${index}`)]}});
 return {type:'flex',altText:`任務照片：已選 ${selected.size} 張，請確認加入`,contents:{type:'carousel',contents}};
}
export function createTaskPhotos({platform,context,call,logger=console}){
 const delivery=createAttachmentDelivery({platform,resolveConversation:async e=>await platform.centralArchive.canRetrieveQuote(e.source)?{tenant:QUOTED_ARCHIVE_SCOPE,binding:{status:'啟用'}}:null,
  resolveOriginal:async(_t,e,c)=>file(e,c.quotedMessageId)});
 async function file(e,messageId){
  if(!await platform.centralArchive.canRetrieveQuote(e.source))throw Error('photo_member_changed');
  const saved=await platform.centralArchive.taskPhoto(e.source,messageId);
  if(!saved?.file||saved.missing||saved.pending)throw Error('photo_original_missing');
  const f=saved.file;if(f.mimeType&&!['image/jpeg','image/png'].includes(f.mimeType)||Number(f.size)>10*1024*1024)throw Error('photo_type_invalid');
  return {fileId:f.id,filename:f.name,size:Number(f.size),md5:String(f.md5Checksum).toLowerCase(),url:f.webViewLink};
 }
 async function images(e,state){const urls={};for(const c of state.candidates){try{const f=await file(e,c.messageId),m=await delivery.messages(QUOTED_ARCHIVE_SCOPE,e,{explicitSelf:true,quotedMessageId:c.messageId},f),image=m.find(m=>m.type==='image');if(image)urls[c.messageId]=image.previewImageUrl;}catch{}}return urls;}
 const send=async(e,m)=>{if(e.replyToken)await platform.replyLineMessages(e.replyToken,[m]);};
 async function handle(e){
  const data=e.postback?.data;if(e.type!=='postback'||typeof data!=='string'||!data.startsWith(prefix))return false;
  const m=data.match(/^taskphoto:(open|show|set|confirm|resume):([a-f0-9]{64}):([0-4])(?::(\d{1,8}))?(?::([0-9]))?(?::([01]))?$/);
  if(!m||e.source?.type!=='group')return true;
  try{
   const [,action,id,index,version,photo,selected]=m,ctx=await context(e,id,Number(index)),invoke=(action,extra={})=>call(ctx,action,extra);
   let state;
   if(action==='open'){
    const candidates=await platform.centralArchive.taskPhotos(e.source,ctx.source.quotedMessageId||'');
    if(!candidates.length){await send(e,text('本群尚無可附加的已保存照片。請重新傳送截圖，稍候再按「選擇群組照片」。'));return true;}
    state=(await invoke('open',{candidates})).state;
   }else state=(await invoke('status')).state;
   if(action==='set'){
    if(!state.candidates[Number(photo)])throw Error('photo_invalid');
    state=(await invoke('select',{version:Number(version),messageId:state.candidates[Number(photo)].messageId,selected:selected==='1',operationId:e.webhookEventId||data})).state;
    const message=photoActions(`已選 ${state.selected.length} 張照片。可繼續選取，或確認加入任務。`,[['繼續選照片',`${prefix}show:${id}:${index}`],['確認加入',`${prefix}confirm:${id}:${index}:${state.version}`]]);
    await context(e,id,Number(index));await send(e,message);return true;
   }
   if(action==='confirm'||action==='resume'||state.phase==='importing'){
    if(state.phase==='selecting')state=(await invoke('confirm',{version:Number(version),operationId:e.webhookEventId||data})).state;
    if(state.phase==='importing'){
     const deadline=Date.now()+25000;
     for(const messageId of state.selected.filter(id=>!state.imported.includes(id))){
      if(Date.now()>deadline)break;
      await context(e,id,Number(index));const f=await file(e,messageId),download=await platform.drive.download(f.fileId,10*1024*1024);
      if(download.buffer.length!==f.size||crypto.createHash('md5').update(download.buffer).digest('hex')!==f.md5)throw Error('photo_checksum_changed');
      const type=download.contentType.split(';')[0];if(!['image/jpeg','image/png'].includes(type))throw Error('photo_type_invalid');
      await context(e,id,Number(index));state=(await invoke('upload',{messageId,file:new Blob([download.buffer],{type}),filename:f.filename})).state;
     }
     if(state.selected.every(id=>state.imported.includes(id)))state=(await invoke('finish')).state;
    }
    const done=state.phase==='done',notice=done?text(`已將 ${state.selected.length} 張照片附到原任務，可在工作日誌任務卡的附件查看。`):photoActions('照片尚未全部加入，已保存的附件會保留，請按「繼續加入」。',[['繼續加入',`${prefix}resume:${id}:${index}`]]);
    await context(e,id,Number(index));await send(e,notice);return true;
   }
   const previews=await images(e,state);await context(e,id,Number(index));await send(e,photoCard(id,index,state,previews));
  }catch(error){
   logger.warn?.('[task-photos] action unavailable; task and saved attachments retained');
   const code=error.code,message=code==='REQUESTER_ONLY'?'請由原交辦人在原群組選擇照片。':code==='NO_PHOTOS_SELECTED'?'請先選至少一張照片。':code==='PHOTO_VERSION_CONFLICT'?'照片選擇已更新，請重新顯示照片後操作。':'目前無法完成照片操作，原任務與已附照片會保留。請從原交辦卡片重新開啟，未保存的原圖請重新傳送。';
   await send(e,text(message)).catch(()=>{});
  }
  return true;
 }
 async function attachQuoted(e,ctx,assertCurrent){
  const messageId=ctx.source.quotedMessageId;if(!/^\d{15,30}$/.test(messageId||''))return {imported:false};
  const prior=await call(ctx,'quoted-status',{messageId});if(prior.imported||prior.removed)return prior;
  const f=await file(e,messageId),download=await platform.drive.download(f.fileId,10*1024*1024);
  const type=download.contentType.split(';')[0];if(!['image/jpeg','image/png'].includes(type)||download.buffer.length!==f.size||crypto.createHash('md5').update(download.buffer).digest('hex')!==f.md5)throw Error('photo_checksum_changed');
  await assertCurrent();const latest=await file(e,messageId);if(latest.fileId!==f.fileId||latest.md5!==f.md5)throw Error('photo_source_changed');
  return call(ctx,'quoted-upload',{messageId,file:new Blob([download.buffer],{type}),filename:f.filename});
 }
 return {handle,attachQuoted,contract:PHOTO_CONTRACT};
}

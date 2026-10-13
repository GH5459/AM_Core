'use strict';
// Shared by Node and Cloudflare. Google OAuth remains owned by DailyLog.
const {recurrenceLines}=require('./calendar-recurrence.cjs');
const EVENT_PATH='/api/integrations/leaf-snail/calendar/events';
const KEY_PATH='/api/calendar-bot/key';
const fail=(code,message,status=400)=>Object.assign(Error(message),{code,status});
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))throw fail('INVALID_REQUEST','請提供 JSON 物件。');}
function fields(value,allowed){object(value);if(Object.keys(value).some(key=>!allowed.includes(key)))throw fail('INVALID_REQUEST','包含不支援的欄位。');}
function string(value,name,max,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))throw fail('INVALID_REQUEST',name+'格式錯誤或內容過長。');return value.trim();}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9999-12-31'||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw fail('INVALID_REQUEST','日期必須是有效的 YYYY-MM-DD。');return value;}
function time(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw fail('INVALID_REQUEST','時間必須是 HH:mm（24 小時制）。');return value;}
function normalizeEvent(input){
 fields(input,['requestId','topic','date','time','location','content','endDate','endTime','durationMinutes','recurrence']);
 const requestId=string(input.requestId,'requestId',200);
 if(!/^[A-Za-z0-9._:-]+$/.test(requestId))throw fail('INVALID_REQUEST','requestId 只能使用英數字及 . _ : -。');
 const summary=string(input.topic,'主題',500),location=string(input.location,'地點',1000,true),description=string(input.content,'主要內容',12000,true);
 const startText=date(input.date)+'T'+time(input.time)+':00+08:00',start=Date.parse(startText);
 let endText;
 if(input.endTime!==undefined){
  if(input.durationMinutes!==undefined)throw fail('INVALID_REQUEST','endTime 與 durationMinutes 請擇一提供。');
  endText=date(input.endDate??input.date)+'T'+time(input.endTime)+':00+08:00';
 }else{
  if(input.endDate!==undefined)throw fail('INVALID_REQUEST','提供 endDate 時也必須提供 endTime。');
  const duration=input.durationMinutes??60;
  if(!Number.isInteger(duration)||duration<1||duration>10080)throw fail('INVALID_REQUEST','durationMinutes 必須是 1–10080 的整數。');
  const end=new Date(start+duration*60000+8*3600000).toISOString();
  if(end.startsWith('+'))throw fail('INVALID_REQUEST','結束日期超出有效範圍。');
  endText=end.slice(0,19)+'+08:00';
 }
 if(Date.parse(endText)<=start)throw fail('INVALID_REQUEST','結束時間必須晚於開始時間；跨日請提供 endDate。');
 return {requestId,event:{summary,location,description,start:{dateTime:startText,timeZone:'Asia/Taipei'},end:{dateTime:endText,timeZone:'Asia/Taipei'},...(input.recurrence===undefined?{}:{recurrence:recurrenceLines(input.recurrence,input.date)})}};
}
function createCalendarBot({read,write,google,canUse,serviceToken,resolveAccount,calendarFor=async()=>'primary',now=Date.now}){
 const slotFor=user=>hash('dailylog-calendar-bot:'+user.id);
 async function checkUser(user){if(!await canUse(user.account))throw fail('ACCESS_DISABLED','此帳號的工作日誌尚未開通。',403);}
 async function connection(user,expected){
  const status=await google.status(user);
  if(!status.connected||status.reconnectRequired)throw fail('GOOGLE_NOT_CONNECTED','請先在工作日誌連接 Google 帳號並啟用自動保持連線。',409);
  if(expected&&status.account!==expected)throw fail('GOOGLE_ACCOUNT_CHANGED','Google 帳號已變更，請重新建立 API 金鑰。',409);
  return status;
 }
 function metadata(saved){return {enabled:saved?.enabled===true,calendarId:saved?.calendarId||null,googleAccount:saved?.googleAccount||null,createdAt:saved?.createdAt||null};}
 async function key(user,method,input){
  await checkUser(user);const slot=await slotFor(user);
  if(method==='GET')return metadata(await read(slot));
  if(method!=='POST')throw fail('METHOD_NOT_ALLOWED','請使用 GET 或 POST。',405);
  fields(input,['action','calendarId']);
  if(input.action==='revoke'){
   if(input.calendarId!==undefined)throw fail('INVALID_REQUEST','撤銷金鑰不需 calendarId。');
   // Replace, rather than read-modify-write, so revoke cannot restore a stale key.
   await write(slot,{enabled:false});return {enabled:false};
  }
  if(input.action!=='create')throw fail('INVALID_REQUEST','action 必須是 create 或 revoke。');
  const calendarId=string(input.calendarId??'primary','calendarId',1024),status=await connection(user);
  let chosen,pageToken;
  for(let page=0;page<20;page++){
   const result=await google.request(user,{path:'/users/me/calendarList?maxResults=250'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'')});
   chosen=(result.items||[]).find(c=>calendarId==='primary'?c.primary:c.id===calendarId);
   if(chosen||!result.nextPageToken)break;pageToken=result.nextPageToken;
  }
  if(!chosen||!['owner','writer'].includes(chosen.accessRole))throw fail('CALENDAR_NOT_WRITABLE','請選擇已加入此 Google 帳號且可編輯的日曆。',403);
  // The primary alias must be resolved now; never silently follow an account switch.
  await connection(user,status.account);
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const token='dlcal.'+slot+'.'+secret,saved={enabled:true,user:{id:user.id,account:user.account},calendarId:chosen.id,googleAccount:status.account,tokenHash:await hash(token),createdAt:new Date(now()).toISOString()};
  await write(slot,saved);return {...metadata(saved),token,bot:'葉小蝸 AI 小助手'};
 }
 async function authorize(authorization){
  const service=/^Bearer (dlservice\.[a-f0-9]{64})$/.exec(authorization||'');
  if(service){
   if(typeof serviceToken!=='string'||!/^dlservice\.[a-f0-9]{64}$/.test(serviceToken)||await hash(service[1])!==await hash(serviceToken))throw fail('UNAUTHORIZED','服務金鑰無效。',401);
   return {mode:'service',tokenHash:await hash(service[1])};
  }
  const match=/^Bearer (dlcal\.([a-f0-9]{64})\.[a-f0-9]{64})$/.exec(authorization||'');
  if(!match)throw fail('UNAUTHORIZED','請提供有效的 Bearer API 金鑰。',401);
  const saved=await read(match[2]);
  if(!saved?.enabled||!saved.user||saved.tokenHash!==await hash(match[1]))throw fail('UNAUTHORIZED','API 金鑰無效或已撤銷。',401);
  await checkUser(saved.user);return {slot:match[2],saved};
 }
 async function recheck(auth){
  if(auth.mode==='service'){
   if(!serviceToken||auth.tokenHash!==await hash(serviceToken))throw fail('UNAUTHORIZED','服務金鑰已變更。',401);
   await checkUser(auth.saved.user);await connection(auth.saved.user,auth.saved.googleAccount);return;
  }
  const latest=await read(auth.slot);
  if(!latest?.enabled||latest.tokenHash!==auth.saved.tokenHash)throw fail('UNAUTHORIZED','API 金鑰已變更或撤銷。',401);
  await checkUser(auth.saved.user);await connection(auth.saved.user,auth.saved.googleAccount);
 }
 async function createEvent(auth,input){
  if(auth.mode==='service'){
   object(input);
   const account=string(input.account,'account（已驗證的 UOF 帳號）',100).toLowerCase();
   const {account:ignored,...eventInput}=input;
   normalizeEvent(eventInput); // Reject invalid events before resolving any user's data.
   const user=await resolveAccount?.(account);
   if(!user||typeof user.id!=='string'||user.account!==account)throw fail('ACCOUNT_NOT_FOUND','找不到此工作日誌帳號；請先登入工作日誌。',404);
   await checkUser(user);
   const status=await connection(user),configuredCalendar=await calendarFor(user),calendarId=string(configuredCalendar||'primary','日曆設定',1024);
   // Resolve primary using the already connected account, so key modes share event IDs.
   auth={...auth,saved:{user,calendarId:calendarId==='primary'?status.account:calendarId,googleAccount:status.account}};
   input=eventInput;
  }
  const {saved}=auth,{requestId,event}=normalizeEvent(input);await recheck(auth);
  const id='dl'+await hash(JSON.stringify(['leaf-snail',saved.user.id,saved.calendarId,requestId]));
  const payloadHash=await hash(JSON.stringify(event));
  const body={id,...event,extendedProperties:{private:{dailylogBot:'leaf-snail',dailylogBotPayload:payloadHash}}};
  const path='/calendars/'+encodeURIComponent(saved.calendarId)+'/events';
  const existing=async()=>{
   try{return await google.request(saved.user,{path:path+'/'+id});}catch(error){if((error.googleStatus??error.status)===404)return null;throw error;}
  };
  const reply=(result,replayed)=>{
   if(result.status==='cancelled'||result.extendedProperties?.private?.dailylogBotPayload!==payloadHash)throw fail('IDEMPOTENCY_CONFLICT','此 requestId 已用於其他內容或活動已刪除，請勿重複使用。',409);
   return {status:replayed?200:201,body:{ok:true,replayed,requestId,account:saved.user.account,calendarId:saved.calendarId,event:{id:result.id,topic:result.summary,date:event.start.dateTime.slice(0,10),time:event.start.dateTime.slice(11,16),location:result.location||'',content:result.description||'',start:result.start,end:result.end,htmlLink:result.htmlLink||null,...(event.recurrence?{recurrence:event.recurrence}:{})}}};
  };
  try{
   const previous=await existing();if(previous)return reply(previous,true);
   await recheck(auth);
   try{return reply(await google.request(saved.user,{path,method:'POST',body}),false);}catch(error){
    if((error.googleStatus??error.status)!==409)throw error;
    const previous=await existing();if(previous)return reply(previous,true);throw error;
   }
  }catch(error){
   if(error.code)throw error;
   if(error.invalidGrant||error.status===401||error.status===409)throw fail('GOOGLE_NOT_CONNECTED','Google 授權已失效或變更，請重新連接後再試。',409);
   if(error.status===403)throw fail('CALENDAR_NOT_WRITABLE','沒有目標日曆的寫入權限。',403);
   throw fail('GOOGLE_UNAVAILABLE','Google Calendar 暫時無法完成操作，請以相同 requestId 重試。',502);
  }
 }
 return {key,authorize,createEvent};
}
module.exports={createCalendarBot,normalizeEvent,EVENT_PATH,KEY_PATH};

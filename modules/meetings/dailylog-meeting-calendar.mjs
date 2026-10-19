const fail=(code,message,status=409)=>Object.assign(Error(message),{code,status});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
// Runs only after original service authentication. Target selection is frozen in
// the existing documents table before any Google write, including uncertain writes.
export async function syncMeetingCalendar(auth,v,{db,resolveAccount,checkUser,connection,calendarFor,google}){
 if(auth.mode!=='service')throw fail('UNAUTHORIZED','需要原 Calendar 服務授權。',403);
 if(!/^[a-f0-9]{64}$/.test(v.meetingId||'')||!/^\d{1,20}$/.test(v.account||'')||!Number.isSafeInteger(v.revision)||v.revision<1||typeof v.removed!=='boolean'||typeof v.topic!=='string'||!v.topic.trim()||v.topic.length>200||typeof v.location!=='string'||v.location.length>2000||!/^https:\/\/[^\s]+\/meetings\/review\/work\/[a-f0-9]{64}$/.test(v.url||''))throw fail('INVALID_REQUEST','會議排程資料不完整。',400);
 for(const t of [v.start,v.end])if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t)||!Number.isFinite(Date.parse(t)))throw fail('INVALID_REQUEST','會議時間不正確。',400);
 if(Date.parse(v.end)<=Date.parse(v.start))throw fail('INVALID_REQUEST','會議結束時間不正確。',400);
 const user=await resolveAccount(v.account);if(!user||user.account!==v.account)throw fail('ACCOUNT_NOT_FOUND','請先登入工作日誌建立本人帳號。',404);await checkUser(user);
 const connected=await connection(user),key=await hash(v.meetingId+':'+user.id),eventId='mh'+key;
 const read=async()=>{const r=await db.prepare("SELECT value FROM documents WHERE namespace='meeting-calendar-targets' AND key=?").bind(key).first();return r?JSON.parse(r.value):null;};
 let target=await read();
 if(!target){const selected=await calendarFor(user),value={userId:user.id,googleAccount:connected.account,calendarId:!selected||selected==='primary'?connected.account:selected,eventId};await db.prepare("INSERT INTO documents(namespace,key,value) VALUES('meeting-calendar-targets',?,?) ON CONFLICT(namespace,key) DO NOTHING").bind(key,JSON.stringify(value)).run();target=await read();}
 if(target.userId!==user.id||target.googleAccount!==connected.account)throw fail('BINDING_CHANGED','Google 帳號已變更，請核對原日曆；不會另建副本。');
 await checkUser(user);await connection(user,target.googleAccount);
 const path='/calendars/'+encodeURIComponent(target.calendarId)+'/events/'+eventId;
 let previous;try{previous=await google.request(user,{path});}catch(e){if([404,410].includes(e.googleStatus??e.status))previous=null;else throw e;}
 const payload={summary:v.topic,location:v.location,description:'會議工作頁：'+v.url,start:{dateTime:v.start,timeZone:'Asia/Taipei'},end:{dateTime:v.end,timeZone:'Asia/Taipei'}};
 const payloadHash=await hash(JSON.stringify({payload,removed:v.removed}));const marker=previous?.extendedProperties?.private;
 if(previous&&marker?.meetingHub!==v.meetingId)throw fail('IDEMPOTENCY_CONFLICT','原日曆活動的來源不同，請核對。');
 if(previous&&Number(marker.meetingRevision)>v.revision)return {ok:true,calendarId:target.calendarId,eventId,googleAccount:target.googleAccount,revision:Number(marker.meetingRevision)};
 if(previous&&Number(marker.meetingRevision)===v.revision&&marker.meetingPayload!==payloadHash)throw fail('IDEMPOTENCY_CONFLICT','相同排程版本的內容不同。');
 await checkUser(user);await connection(user,target.googleAccount);
 // Cancelled events retain the source marker and version; restore uses the same ID.
 if(v.removed&&!previous)return {ok:true,...target,revision:v.revision};
 const body={...payload,status:v.removed?'cancelled':'confirmed',extendedProperties:{private:{meetingHub:v.meetingId,meetingRevision:String(v.revision),meetingPayload:payloadHash}}};
 if(!previous){try{await google.request(user,{path:path.slice(0,path.lastIndexOf('/')),method:'POST',body:{id:eventId,...body}});}catch(e){if((e.googleStatus??e.status)===409)throw fail('GOOGLE_UNAVAILABLE','活動已存在，請以原版本重試。',502);throw e;}}
 else if(Number(marker.meetingRevision)!==v.revision||previous.status!==(v.removed?'cancelled':'confirmed'))await google.request(user,{path,method:'PATCH',headers:previous.etag?{'If-Match':previous.etag}:{},body});
 return {ok:true,calendarId:target.calendarId,eventId,googleAccount:target.googleAccount,revision:v.revision};
}

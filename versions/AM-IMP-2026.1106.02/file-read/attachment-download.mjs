export const ATTACHMENT_READ_POLICY='bounded-attachment-read-v1';
const BATCH_BYTES=1024*1024;
const fail=()=>Object.assign(Error('附件暫時無法讀取，請重試。'),{status:503});
export function fixedBody(body,length){
 if(typeof FixedLengthStream==='undefined')return body;
 const fixed=new FixedLengthStream(length);void body.pipeTo(fixed.writable).catch(()=>{});return fixed.readable;
}

// Malformed or multiple ranges are ignored, as permitted by HTTP. An otherwise
// valid single range outside the representation receives 416 after authorization.
export function selectedRange(header,size,ifRange,etag){
 if(!header||(ifRange&&ifRange!==etag))return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());if(!match||(!match[1]&&!match[2]))return null;
 const a=match[1]?Number(match[1]):null,b=match[2]?Number(match[2]):null;
 if((a!==null&&!Number.isSafeInteger(a))||(b!==null&&!Number.isSafeInteger(b)))return null;
 if(size===0||a!==null&&(a>=size||b!==null&&b<a)||a===null&&b===0)return {unsatisfied:true};
 return {start:a===null?Math.max(0,size-b):a,end:a===null?size-1:Math.min(size-1,b??size-1)};
}

export async function attachmentDownload(request,db,file,assertCurrent){
 const size=Number(file.size);if(!Number.isSafeInteger(size)||size<0||size>10*1024*1024)throw fail();
 const etag='"'+String(file.digest||'')+'"';
 const headers=new Headers({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''`+encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16)),
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes','X-DailyLog-Attachment-Policy':ATTACHMENT_READ_POLICY});
 if(/^[a-f0-9]{64}$/.test(file.digest||''))headers.set('ETag',etag);
 const range=selectedRange(request.headers.get('Range'),size,request.headers.get('If-Range'),etag);
 if(range?.unsatisfied){await assertCurrent();headers.set('Content-Range','bytes */'+size);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
 const start=range?.start??0,end=range?.end??size-1,length=Math.max(0,end-start+1);
 // Validate all metadata before sending any bytes. This preserves the previous
 // missing/short/duplicate chunk rejection while reading only requested bodies.
 const meta=(await db.prepare('SELECT part,length(content) AS size FROM task_attachment_chunks WHERE attachment_id=? ORDER BY part').bind(file.id).all()).results;
 let offset=0;const selected=[];
 for(let i=0;i<meta.length;i++){
  const row=meta[i],n=Number(row.size);if(row.part!==i||!Number.isSafeInteger(n)||n<=0||offset+n>size)throw fail();
  if(offset<=end&&offset+n>start)selected.push({part:i,size:n,offset});offset+=n;
 }
 if(offset!==size)throw fail();
 let cursor=0,closed=false;
 async function batch(){
  if(cursor>=selected.length)return [];
  const entries=[];let total=0;
  do{const entry=selected[cursor++];entries.push(entry);total+=entry.size;}while(cursor<selected.length&&total<BATCH_BYTES);
  const rows=(await db.prepare('SELECT part,content FROM task_attachment_chunks WHERE attachment_id=? AND part>=? AND part<=? ORDER BY part').bind(file.id,entries[0].part,entries.at(-1).part).all()).results;
  if(rows.length!==entries.length)throw fail();
  return rows.map((row,i)=>{const entry=entries[i],data=new Uint8Array(row.content);if(row.part!==entry.part||data.byteLength!==entry.size)throw fail();return data.subarray(Math.max(0,start-entry.offset),Math.min(data.length,end-entry.offset+1));});
 }
 let first=await batch();
 // Exactly the same fresh task/session checks remain immediately before reply.
 await assertCurrent();
 headers.set('Content-Length',String(length));if(range)headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
 const body=new ReadableStream({async pull(controller){
  if(closed)return;
  try{const chunks=first??await batch();first=null;for(const bytes of chunks)controller.enqueue(bytes);if(cursor>=selected.length){closed=true;controller.close();}}
  catch(error){closed=true;controller.error(error);}
 },cancel(){closed=true;first=null;}});
 return new Response(fixedBody(body,length),{status:range?206:200,headers});
}

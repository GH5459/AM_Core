import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {verifyManagementRequest} from './management-auth.js';

// Only signed server requests may supply this actor. Browser headers and cookies
// never enter the original meeting authenticator through this path.
export const dailylogActor=Symbol('dailylogMeetingActor');
export const embeddedPath=p=>/^\/meetings\/review\/(?:hub(?:\/api)?|work\/[a-f0-9]{64}(?:\/(?:api|audio|glossary|hub))?)$/.test(p);
export async function embeddedRequest(req,url,{secret,platform,origin,pool}){
 if(!req.headers['x-meeting-signature'])return null;
 const deny=()=>Object.assign(Error('工作日誌會議登入已失效，請重新登入。'),{status:403});
 if(!embeddedPath(url.pathname)||!['GET','HEAD','POST'].includes(req.method))throw deny();
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw Object.assign(Error('單次上傳過大，請使用原分段上傳。'),{status:413});chunks.push(chunk);}
 const bytes=Buffer.concat(chunks),body=bytes.toString('base64');
 // Binary bytes are signed as base64, independent of UTF-8 decoding.
 if(!verifyManagementRequest(secret,req,body))throw deny();
 const line=url.searchParams.get('_dailylogLine'),account=String(req.headers['x-meeting-actor']);
 if(!/^U[a-f0-9]{32}$/i.test(line||''))throw deny();
 const who=await platform.meetingShareIdentity?.(line);if(!who||who.account!==account)throw deny();
 if(req.method==='POST'){
  const nonce=url.searchParams.get('_dailylogNonce');if(!/^[a-f0-9-]{36}$/.test(nonce||''))throw deny();
  const accepted=await pool.query('INSERT INTO central_archive.login_continuation_nonces(key,expires_at) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key',['dailylog-meeting:'+nonce,Date.now()+120000]);if(!accepted.rows.length)throw deny();
 }
 const target=new URL(url);target.searchParams.delete('_dailylogLine');target.searchParams.delete('_dailylogNonce');
 const forwarded=Readable.from(bytes.length?[bytes]:[]);
 forwarded.method=req.method;forwarded.url=target.pathname+target.search;
 forwarded.headers={'content-type':req.headers['content-type']||'application/json',host:new URL(origin).host,origin};
 // The DailyLog proxy authenticates the complete binary body but does not relay
 // browser headers. Reconstruct the chunk digest only after signature validation.
 if(req.method==='POST'&&/^\/meetings\/review\/work\/[a-f0-9]{64}\/hub$/.test(target.pathname)&&target.searchParams.has('uploadId')&&target.searchParams.has('offset')&&/^application\/octet-stream(?:\s*;|$)/i.test(forwarded.headers['content-type']))
  forwarded.headers['x-audio-sha256']=createHash('sha256').update(bytes).digest('hex');
 if(req.method==='GET'&&req.headers.range)forwarded.headers.range=req.headers.range;
 forwarded[dailylogActor]={id:line,name:who.name||'同仁',meetingIdentity:who};
 return {request:forwarded,url:target};
}

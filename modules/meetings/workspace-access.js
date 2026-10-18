import crypto from 'node:crypto';
import {failure,todos} from './workspace-model.js';

// A shared link grants published content and audio only. It never grants editor,
// member-directory, history, source identifiers or integration access.
export const canReadShared=r=>r.state==='published'&&r.sharing_enabled===true;
export function readerData(r){return {
 topic:r.fields.settings.topic,date:r.fields.settings.date,type:r.fields.settings.type,
 hostName:r.host_name,filename:r.filename,record:r.fields.record||'',transcript:r.fields.transcript||'',
 todos:todos(r.fields).map(t=>({content:t.content,owner:t.ownerId?r.receipt.ownerNames?.[t.ownerId]||'待確認負責人':'未分派',due:t.due||'未設定'})),
 warning:r.result.warning||'',segments:(r.result.segments||[]).map(s=>({start:s.start,speaker:s.speaker,text:s.text}))
};}
export function audioTickets(secret,now=Date.now){
 const signature=s=>crypto.createHmac('sha256',secret).update('meeting-audio-v1:'+s).digest('base64url');
 return {
  mint(r,actor){if(!secret)throw failure(503,'錄音播放尚未設定完成。');const body=Buffer.from(JSON.stringify({id:r.id,actor,sharingVersion:Number(r.sharing_version||0),expires:now()+30*60*1000})).toString('base64url');return body+'.'+signature(body);},
  verify(r,ticket){try{if(!secret||typeof ticket!=='string'||ticket.length>1500)throw Error();const [body,sig,...extra]=ticket.split('.'),expected=signature(body),a=Buffer.from(sig||''),b=Buffer.from(expected);if(extra.length||a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error();const t=JSON.parse(Buffer.from(body,'base64url'));if(t.id!==r.id||!Number.isSafeInteger(t.expires)||t.expires<=now()||t.expires>now()+30*60*1000||t.sharingVersion!==Number(r.sharing_version||0)||t.actor!=='public'&&!/^U[a-f0-9]{32}$/i.test(t.actor))throw Error();if(t.actor==='public'&&!canReadShared(r))throw Error();return t.actor;}catch{throw failure(403,'錄音播放授權已失效，請重新整理頁面。');}}
 };
}

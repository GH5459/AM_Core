import crypto from 'node:crypto';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function managementSignature(secret, {method,path,timestamp,actor,body=''}) {
  return crypto.createHmac('sha256',secret).update([method,path,timestamp,actor,sha(body)].join('\n')).digest('hex');
}
export function verifyManagementRequest(secret, request, body='', now=Date.now()) {
  if (typeof secret!=='string'||secret.length<32) return false;
  const timestamp=String(request.headers['x-meeting-time']||'');
  const actor=String(request.headers['x-meeting-actor']||'');
  const signature=String(request.headers['x-meeting-signature']||'');
  if(!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>60000
    ||!/^\d{1,20}$/.test(actor)||! /^[a-f0-9]{64}$/.test(signature))return false;
  const expected=managementSignature(secret,{method:request.method,path:request.url,timestamp,actor,body});
  return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}

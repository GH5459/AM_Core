export const CASE_EVIDENCE_CONTRACT='xiaoye-meeting-case-evidence-v1';
export const CASE_EVIDENCE_PATH='/integrations/xiaoye-case-evidence';
const encoder=new TextEncoder();
export const evidenceDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export async function evidenceSignature(secret,time,body){
 if(typeof secret!=='string'||secret.length<32)throw Error('Case evidence connection is not configured.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode([CASE_EVIDENCE_CONTRACT,time,body].join('\n')))),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyEvidenceSignature(secret,time,body,signature,now=Date.now()){
 if(!/^\d{13}$/.test(String(time))||Math.abs(now-Number(time))>30000||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 const expected=await evidenceSignature(secret,time,body);let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0;
}
export function meetingReference(task){
 const texts=[task.description,...(task.secretary?.sources||[]).filter(s=>!s.withdrawn).map(s=>s.text||'')];
 const found=new Map();for(const text of texts)for(const match of String(text||'').matchAll(/https:\/\/[^\s<>"'）)]+/g)){
  try{const url=new URL(match[0]),id=url.pathname.match(/^\/meetings\/review\/work\/([a-f0-9]{64})\/?$/)?.[1];if(['am.hozorental.com','am-platform-2ymf.onrender.com'].includes(url.hostname)&&!url.port&&!url.username&&!url.password&&id)found.set(id,{id,url:url.origin+'/meetings/review/work/'+id});}catch{}
 }
 if(found.size>1)throw Object.assign(Error('回報中有多場會議，請先確認要處理哪一場。'),{status:409});
 return [...found.values()][0]||null;
}

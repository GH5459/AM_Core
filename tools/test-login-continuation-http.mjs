import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createLoginContinuationHttp} from '../core/login-continuation-http.js';
import {managementSignature} from '../modules/meetings/management-auth.js';
const secret='isolated-management-secret-with-more-than-32-characters';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
async function request(service,path,{method='GET',headers={},body=''}={}){
  const req=Readable.from(body?[Buffer.from(body)]:[]);Object.assign(req,{method,url:path,headers});
  let status=200,result='',responseHeaders={};
  const res={setHeader(k,v){responseHeaders[k]=v;},writeHead(s,h){status=s;Object.assign(responseHeaders,h);},end(v=''){result=String(v);}};
  await service.handle(req,res,new URL(path,'https://am.hozorental.com'));
  return {status,headers:responseHeaders,text:result,json:()=>JSON.parse(result)};
}
function signed(v){const body=JSON.stringify({...v,nonce:random()}),timestamp=String(Date.now()),actor='0',path='/login-continuation/machine';return {path,method:'POST',body,headers:{'x-meeting-time':timestamp,'x-meeting-actor':actor,'x-meeting-signature':managementSignature(secret,{method:'POST',path,timestamp,actor,body})}};}
async function fixture(){const db=new PGlite();await db.exec('CREATE SCHEMA central_archive');let active=true;const reference='a'.repeat(64),expiresAt=Date.now()+3600000;const service=createLoginContinuationHttp({env:{AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETINGS_LIFF_ID:'123456-fixture'},pool:db,authority:async v=>v.action==='proof'&&active?{reference,account:'900001',generation:'generation',active,expiresAt}:v.action==='feature'?{allowed:active,userId:'U'+'1'.repeat(32),tenantKey:'fixture',soap:false,attachments:false}:null,lineIdentity:async()=>null});return {db,service,reference,setActive:v=>{active=v;}};}
test('machine proof is signed, nonce-bound, one-use and cannot be replayed',async()=>{const f=await fixture();try{
 const verifier=random(),v={action:'register-issue',source:'dailylog',reference:f.reference,target:'uof',returnPath:'/Line/Review',challenge:sha(verifier)},s=signed(v);
 assert.equal((await request(f.service,s.path,{...s,headers:{}})).status,401);
 const first=await request(f.service,s.path,s);assert.equal(first.status,200);assert(first.json().code);
 assert.equal((await request(f.service,s.path,s)).status,401);
 const exchange=signed({action:'exchange',code:first.json().code,target:'uof',targetOrigin:'https://uof-line.ghotel.tw',verifier});const result=await request(f.service,exchange.path,exchange);assert.equal(result.status,200);assert.equal(result.json().account,'900001');assert.equal(result.json().permission.soap,false);
 f.setActive(false);const check=signed({action:'check',target:'uof',chainToken:result.json().token});assert.equal((await request(f.service,check.path,check)).status,401);
 }finally{await f.db.close();}});
test('altered signed body, wrong origin, expired timestamp and external return are denied',async()=>{const f=await fixture();try{
 const verifier=random(),v={action:'register-issue',source:'dailylog',reference:f.reference,target:'uof',returnPath:'/Line/Review',challenge:sha(verifier)};
 const altered=signed(v);altered.body+=' ';assert.equal((await request(f.service,altered.path,altered)).status,401);
 const expired=signed(v);expired.headers['x-meeting-time']=String(Date.now()-120000);assert.equal((await request(f.service,expired.path,expired)).status,401);
 const bad=signed({...v,returnPath:'https://evil.test'});assert.equal((await request(f.service,bad.path,bad)).status,401);
 const valid=signed(v),issued=(await request(f.service,valid.path,valid)).json(),wrong=signed({action:'exchange',code:issued.code,target:'uof',targetOrigin:'https://evil.test',verifier});assert.equal((await request(f.service,wrong.path,wrong)).status,401);
 }finally{await f.db.close();}});
test('meeting browser start binds a 60-second HttpOnly Secure challenge and fallback preserves original feature',async()=>{const f=await fixture();try{
 const r=await request(f.service,'/login-continuation/start?returnPath=%2Fmeetings%2Freview%2Fhub');assert.equal(r.status,303);assert.match(r.headers['Set-Cookie'],/HttpOnly; SameSite=Lax; Max-Age=60/);assert.match(r.headers.Location,/target=meetings/);
 const fallback=await request(f.service,'/login-continuation/continue?target=meetings&challenge='+'a'.repeat(64)+'&returnPath=%2Fmeetings%2Freview%2Fhub&attempt=2');assert.equal(fallback.status,303);assert.equal(new URL(fallback.headers.Location).pathname,'/meetings/review/hub');
 assert.equal((await request(f.service,'/login-continuation/continue?target=uof&challenge='+'a'.repeat(64)+'&returnPath=%2FLine%2FReview&attempt=3')).status,401);
 }finally{await f.db.close();}});

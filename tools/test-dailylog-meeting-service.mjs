import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createMeetingWorkspace} from '../modules/meetings/workspace-service.js';
import {managementSignature} from '../modules/meetings/management-auth.js';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const secret='isolated-meeting-secret-'.repeat(3),origin='https://meeting.example.test';
const pool={query:(...a)=>f.pg.query(...a),connect:async()=>({query:(...a)=>f.pg.query(...a),release(){}})};
const conversations=new Map([[f.key,f.row]]);
await f.pg.exec('CREATE TABLE IF NOT EXISTS central_archive.login_continuation_nonces(key text PRIMARY KEY,expires_at bigint NOT NULL)');
// Production uses the original owner key fallback. A dedicated-secret-only fixture
// missed this configuration and allowed a broken gateway to pass previously.
const service=createMeetingWorkspace({pool,botId:f.row.bot_id,platform:f.platform,archive:{original:async()=>null},env:{AMCORE_MEETINGS_LIFF_ID:'123-test',AMCORE_MEETINGS_LIFF_ENDPOINT_URL:origin+'/meetings/review',AMCORE_LINE_DIRECTORY_OWNER_API_KEY:secret},context:async()=>({tenant:{}}),tenantFor:()=>({config:{meetings:{liffId:'123-test'}}}),getConversation:async key=>conversations.get(key)||null,ensureDatabase:async()=>({dbId:'synthetic'}),request:async()=>{throw Error('No publishing in this test');},logger:{warn(){}}});
async function call(path,input,person=f.host,account='111'){
 const body=input?JSON.stringify(input):'',u=new URL(origin+path);u.searchParams.set('_dailylogLine',person);u.searchParams.set('_dailylogNonce',crypto.randomUUID());
 const req=Readable.from(body?[Buffer.from(body)]:[]);req.method=input?'POST':'GET';req.url=u.pathname+u.search;const timestamp=String(Date.now());req.headers={'content-type':'application/json','x-meeting-time':timestamp,'x-meeting-actor':account,'x-meeting-signature':managementSignature(secret,{method:req.method,path:req.url,timestamp,actor:account,body:Buffer.from(body).toString('base64')})};
 let status=200,output;const headers={};const res={setHeader(k,v){headers[k]=v;},writeHead(v,h={}){status=v;Object.assign(headers,h);},get headersSent(){return false;},set statusCode(v){status=v;},get statusCode(){return status;},end(v){output=v;}};
 assert(await service.handle(req,res,u));return {status,headers,body:output,...headers['Content-Type']?.includes('application/json')?JSON.parse(output):{}};
}
try{
 const hub=await call('/meetings/review/hub');assert.equal(hub.status,200);assert(hub.body.startsWith('<!doctype'));assert.equal(hub.headers['X-DailyLog-Meetings-Origin'],origin);
 const list=await call('/meetings/review/hub/api',{action:'list'});assert.equal(list.status,200,JSON.stringify(list));assert(list.items.length);
 const sources=await call('/meetings/review/hub/api',{action:'sources'});assert.equal(sources.status,200);assert(sources.sources.some(s=>s.key===f.key));
 const originalIdentity=f.platform.meetingShareIdentity;let identityChecks=0;f.platform.meetingShareIdentity=async(...args)=>{identityChecks++;return originalIdentity(...args);};
 const shared=await call('/meetings/review/hub/api',{action:'list',scope:'shared'});assert.equal(shared.status,200);assert.equal(identityChecks,1,'One freshly verified identity is reused only within this signed request');
 const second=await call('/meetings/review/hub/api',{action:'list',scope:'shared'});assert.equal(second.status,200);assert.equal(identityChecks,2,'Each new request revalidates the original identity');f.platform.meetingShareIdentity=originalIdentity;
 const item=list.items.find(i=>i.canDelete)||list.items[0];assert.equal((await call('/meetings/review/work/'+item.id+'/hub',{action:'plan-read'})).status,200);
 assert.equal((await call('/meetings/review/hub/api',{action:'list'},f.host,'222')).status,403);
 assert.equal((await call('/meetings/review/work/'+item.id+'/hub',{action:'plan-read'},'U'+'f'.repeat(32),'111')).status,403);
 console.log('Signed DailyLog requests reached original PostgreSQL meeting hub, source list and work page; wrong-account and unrelated-member access denied.');
}finally{if(!process.env.DAILYLOG_MEETING_PREVIEW)await f.pg.close();}
export const fixture={...f,service,pool,secret,conversations};

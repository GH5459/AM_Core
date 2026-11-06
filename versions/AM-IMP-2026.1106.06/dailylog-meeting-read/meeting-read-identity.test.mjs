import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), here=path.dirname(fileURLToPath(import.meta.url));
const {patchMultilingual,patchMeetings,patchOperationSpeed}=require('./patch-modules.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'meeting-read-'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
fs.copyFileSync(path.join(here,'meeting-read-identity.mjs'),path.join(temp,'meeting-read-identity.mjs'));
fs.copyFileSync(path.resolve(here,'../../AM-IMP-2026.1106.03/dailylog-read/task-read-identity.mjs'),path.join(temp,'task-read-identity.mjs'));
const identity=await import(pathToFileURL(path.join(temp,'task-read-identity.mjs')));
const {isMeetingListRead,meetingSession,meetingReadTiming}=await import(pathToFileURL(path.join(temp,'meeting-read-identity.mjs')));
const url='https://example.invalid/meetings/review/hub/api';
const req=(body='{"action":"list"}',extra={})=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'synthetic=one',...extra},body});
const auth=(account='900003')=>({authenticated:true,user:{account,id:'fixture-'+account},csrfToken:'fixture-csrf',access:{enabled:true}});
const core={async fetch(request){const value=auth(request.headers.get('Cookie')?.includes('two')?'900004':'900003');return identity.captureTaskReadIdentity(request,value)||Response.json({...value,supervision:{available:true}});}};

test('only a bounded JSON hub list selects the private path; original body bytes stay intact',async()=>{
 const body=' {"action":"list","view":"all","text":"測試"}\n',request=req(body);
 assert.equal(await isMeetingListRead(request),true);assert.equal(await request.text(),body);
 for(const body of ['{','null','[]','{"action":"create"}','{"action":"List"}','{"action":"read"}'])assert.equal(await isMeetingListRead(req(body)),false);
 for(const type of ['text/plain','application/jsonp','application/x-www-form-urlencoded'])assert.equal(await isMeetingListRead(req(undefined,{'Content-Type':type})),false);
 assert.equal(await isMeetingListRead(req(undefined,{'Content-Type':'application/json; charset=utf-8'})),true);
 assert.equal(await isMeetingListRead(new Request(url)),false);
 assert.equal(await isMeetingListRead(new Request('https://example.invalid/meetings/review/work/'+ 'a'.repeat(64)+'/api',{method:'POST',body:'{"action":"list"}',headers:{'Content-Type':'application/json'}})),false);
});
test('oversize, invalid length and oversized unannounced stream fall back without consuming original',async()=>{
 for(const length of ['32769','-1','bogus'])assert.equal(await isMeetingListRead(req(undefined,{'Content-Length':length})),false);
 const body=JSON.stringify({action:'list',x:'a'.repeat(32768)}),request=req(body);
 assert.equal(await isMeetingListRead(request),false);assert.equal(await request.text(),body);
});
test('private and public session paths remain distinct, and browser headers cannot select capture',async()=>{
 const request=req(undefined,{'X-Task-Read-Identity':'true'});
 const narrow=await meetingSession(core,request,{}, {},true);assert.equal(narrow.response.status,204);assert.equal(narrow.session.supervision,undefined);
 const regular=await meetingSession(core,request,{}, {},false);assert.equal(regular.response.status,200);assert.deepEqual(regular.session.supervision,{available:true});
 assert.equal(identity.requestsTaskReadIdentity(request),false);
 assert.equal(identity.captureTaskReadIdentity(request,auth()),null);
});
test('final wrapper 403 overrides earlier capture and never returns captured authority',async()=>{
 const inner={async fetch(r){identity.captureTaskReadIdentity(r,auth());return Response.json({error:'denied'},{status:403});}};
 const result=await meetingSession(inner,req(),{}, {},true);assert.equal(result.response.status,403);assert.equal(result.session,undefined);
});
test('final wrapper JSON logout or changed account overrides earlier capture',async()=>{
 for(const final of [{authenticated:false},auth('900004')]){
  const inner={async fetch(r){identity.captureTaskReadIdentity(r,auth());return Response.json(final);}};
  assert.deepEqual((await meetingSession(inner,req(),{}, {},true)).session,final);
 }
});
test('uncaptured 204 fails closed; cloned requests have no private authority',async()=>{
 await assert.rejects(meetingSession({async fetch(){return new Response(null,{status:204});}},req(),{}, {},true),/not captured/);
 let original;
 const inner={async fetch(r){original=r;assert.equal(identity.requestsTaskReadIdentity(r),true);assert.equal(identity.requestsTaskReadIdentity(r.clone()),false);return core.fetch(r);}};
 await meetingSession(inner,req(),{}, {},true);assert.equal(identity.requestsTaskReadIdentity(original),false);
});
test('concurrent identities and rejected calls cannot leak their private capture',async()=>{
 const first=req(),second=req(undefined,{Cookie:'synthetic=two'});
 const results=await Promise.all([meetingSession(core,first,{}, {},true),meetingSession(core,second,{}, {},true)]);
 assert.deepEqual(results.map(r=>r.session.user.account),['900003','900004']);
 let seen;await assert.rejects(meetingSession({async fetch(r){seen=r;throw Error('fixture');}},first,{}, {},true),/fixture/);
 assert.equal(identity.requestsTaskReadIdentity(seen),false);
});

// Small synthetic source deliberately models the pre-existing wrapper boundary;
// the complete deployed Worker is exercised separately with the D1 fixture.
const multilingualSource=`import {readTaskIdentity} from './task-read-identity.mjs';
import {captureTaskReadIdentity as capture} from './task-read-identity.mjs';
const MULTILINGUAL_CONTRACT='synthetic';
const taskRoute=p=>p.startsWith('/api/tasks');
const employeeExperience=(env,account)=>env.experience(account);
export const wrap=base=>({async fetch(request,env,ctx){const p=new URL(request.url).pathname;
  const identity=request.method==='GET'&&taskRoute(p)?await readTaskIdentity(base,request,env,ctx):null;
  const response=await base.fetch(new Request(request),env,ctx),value=await response.json();
  return Response.json({...value,experience:await employeeExperience(env,value.user.account)});
}});`;
fs.writeFileSync(path.join(temp,'multilingual.mjs'),patchMultilingual(multilingualSource));
const {wrap}=await import(pathToFileURL(path.join(temp,'multilingual.mjs')));
test('private capability survives the multilingual Request boundary with fresh experience each time',async()=>{
 let calls=0,locale='zh-Hant';const env={experience:async account=>{calls++;return {account,locale,revision:calls};}};
 for(const next of ['zh-Hant','en','vi']){locale=next;const value=await meetingSession(wrap(core),req(),env,{},true);assert.equal(value.response.status,204);assert.equal(value.session.experience.locale,next);assert.equal(value.session.experience.revision,calls);assert.equal(value.session.supervision,undefined);}
 assert.equal(calls,3);
});
test('private multilingual path preserves final inner denial without retrying core',async()=>{
 let calls=0;const denied={async fetch(r){calls++;identity.captureTaskReadIdentity(r,auth());return Response.json({error:'withdrawn'},{status:403});}};
 const result=await meetingSession(wrap(denied),req(),{experience:()=>{throw Error('must not read');}}, {},true);
 assert.equal(result.response.status,403);assert.equal(result.session,undefined);assert.equal(calls,1);
});
test('inner wrapper logout remains unauthenticated and cannot invoke experience',async()=>{
 const loggedOut={async fetch(r){identity.captureTaskReadIdentity(r,auth());return Response.json({authenticated:false});}};
 const result=await meetingSession(wrap(loggedOut),req(),{experience:()=>{throw Error('must not read');}}, {},true);
 assert.deepEqual(result.session,{authenticated:false});
});
test('inner wrapper changed account is used for fresh multilingual experience',async()=>{
 const switched={async fetch(r){identity.captureTaskReadIdentity(r,auth());return Response.json(auth('900004'));}};
 const result=await meetingSession(wrap(switched),req(),{experience:async account=>({account,locale:'vi'})},{},true);
 assert.equal(result.session.user.account,'900004');assert.equal(result.session.experience.account,'900004');
});
test('public session still uses the original JSON path including supervision',async()=>{
 const result=await meetingSession(wrap(core),req(),{experience:async()=>({locale:'zh-Hant'})},{},false);
 assert.equal(result.response.status,200);assert.deepEqual(result.session.supervision,{available:true});
});
test('timing accepts fixed numeric names only and excludes arbitrary identifiers and descriptions',()=>{
 let time=10;const timer=meetingReadTiming(true,()=>time);time=12;timer.mark('dailylog_meeting_identity');time=15;timer.mark('dailylog_meeting_binding');time=20;timer.mark('dailylog_meeting_upstream');
 const result=timer.header('meeting_embedded;dur=1.2, meeting_auth;dur=3.4, meeting_inventory;dur=4.5, account_900003;dur=1, meeting_auth;dur=99, meeting_total;dur=Infinity, meeting_view;dur=-1, meeting_related;dur=1;desc="secret"');
 assert.equal(result,'dailylog_meeting_identity;dur=2.0, dailylog_meeting_binding;dur=3.0, dailylog_meeting_upstream;dur=5.0, meeting_embedded;dur=1.2, meeting_auth;dur=3.4, meeting_inventory;dur=4.5, dailylog_meeting_total;dur=10.0');
 assert.equal(meetingReadTiming(false),null);
});
test('exact patch refuses changed or duplicate wrapper anchors',()=>{
 assert.throws(()=>patchMultilingual(multilingualSource.replace("const identity=request.method",'const identityChanged=request.method')),/exactly one/);
 assert.throws(()=>patchMultilingual(patchMultilingual(multilingualSource)),/exactly one/);
 assert.throws(()=>patchMeetings('export async function meetingProxy(){}'),/exactly one/);
 assert.throws(()=>patchMeetings("import {} from './meeting-read-identity.mjs';"),/already applied/);
});
test('outer total includes the real hub API and preserves other routes and existing timing',async()=>{
 const source=`export async function operationSpeedResponse(request,response,env,start){
 const path=new URL(request.url).pathname;
 if(!/^\\/api\\/(?:tasks(?:\\/|$)|attachments(?:\\/|$)|meetings(?:\\/|$))/.test(path))return response;
 const headers=new Headers(response.headers);headers.append('Server-Timing','operation_total;dur='+Math.max(0,performance.now()-start).toFixed(1));
 return new Response(response.body,{status:response.status,headers});}`;
 fs.writeFileSync(path.join(temp,'operation.mjs'),patchOperationSpeed(source));
 const {operationSpeedResponse}=await import(pathToFileURL(path.join(temp,'operation.mjs')));
 const response=new Response('same body',{headers:{'Server-Timing':'dailylog_meeting_total;dur=10.0'}});
 const result=await operationSpeedResponse(req(),response,{},performance.now()-50);
 assert.equal(await result.text(),'same body');assert.match(result.headers.get('Server-Timing'),/^dailylog_meeting_total;dur=10.0, operation_total;dur=\d+\.\d$/);
 const unrelated=new Response('same');assert.equal(await operationSpeedResponse(new Request('https://example.invalid/meetings/review/hub'),unrelated,{},0),unrelated);
 assert.throws(()=>patchOperationSpeed(patchOperationSpeed(source)),/exactly one/);
});

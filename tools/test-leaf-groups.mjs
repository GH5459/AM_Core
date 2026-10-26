import * as commonLineEntry from '../core/common-line-entry.js';
import * as portalCommandEntry from '../core/portal-command-entry.js';
import * as usageGuideEntry from '../core/usage-guide-entry.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as directLine from '../core/direct-line.js';
import * as workJournalEntry from '../core/work-journal-entry.js';
import * as uofSetupEntry from '../core/uof-setup-entry.js';
import {PGlite} from '@electric-sql/pglite';
import {createArchiveStore} from '../core/central-archive/store.js';
import {createGroupStore} from '../core/leaf-groups-store.js';
import {createLeafGroups} from '../core/leaf-groups.js';
const U=n=>'U'+String(n).repeat(32),C=n=>'C'+String(n).repeat(32),bot=U(0),owner=U(1),a=U(2),b=U(3),group=C(4);
let serial=0;
export async function fixture(){
 const db=new PGlite();await db.exec(await fs.readFile(new URL('../core/central-archive/schema.sql',import.meta.url),'utf8'));
 let clock=Date.parse('2026-10-13T04:00:00Z');const now=()=>clock;
 const query=(...args)=>db.query(...args),pool={query,connect:async()=>({query,release(){}})},env={LINE_CHANNEL_SECRET:'synthetic',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot};
 const archive=createArchiveStore(pool,bot),store=createGroupStore({env,pool,now});
 const tenant={key:'fixture',tenantId:'fixture-id'},identities=new Map([[owner,{account:'owner',bindingId:'owner-binding'}],[a,{account:'a',bindingId:'a-binding'}],[b,{account:'b',bindingId:'b-binding'}]]);
 const names=new Map([[owner,'發起人'],[a,'同仁甲'],[b,'同仁乙']]),pushes=[],submissions=[],selfSubmissions=[],attempts=[],writes=new Map(),disconnected=new Set();let uncertain=false,failSummary=false;
 const line={lineGet:async path=>{const id=path.split('/').at(-1);if(!names.has(id))throw Error('not_member');return {userId:id,displayName:names.get(id)};}};
 const llm={available:true,completeJson:async input=>{const data=JSON.parse(input.userContent);if(input.schema.properties.kind)return {kind:data.text.includes('會議')?'meeting':data.text.includes('整理清單')?'task':'none'};
   return {events:[{topic:'專案會議',date:'2026-10-14',time:data.text.includes('時間未定')?'':'15:00',location:'漫漫回嘉附近的咖啡廳',content:'討論進度',...(data.existing||{}),...(data.existing?{time:'16:00',needsClarification:[]}:{} )}]};}};
 const tasks={resolveTaskGroupIdentity:async id=>identities.get(id)||null,submitSelfTask:async(t,e,p,d,c,r)=>{selfSubmissions.push({t,e,p,d,c,r});return {taskIds:['work-fixture'],message:{type:'text',text:'已建立自己的任務'}};},groupServices:async()=>[tenant],resolveGroupIdentity:async id=>identities.get(id)||null,submitGroupTask:async(t,e,p,judgment)=>{submissions.push({t,e,p,judgment});return {ok:true};}};
 const calendar={writeGroupEvent:async(t,account,event)=>{attempts.push({t,account,event});if(disconnected.has(account))throw Object.assign(Error('connect'),{code:'GOOGLE_NOT_CONNECTED'});
   if(!writes.has(event.requestId))writes.set(event.requestId,{id:'saved-'+writes.size});if(uncertain){uncertain=false;throw Object.assign(Error('timeout'),{code:'NETWORK_UNCERTAIN'});}return writes.get(event.requestId);}};
 const platform={llmForTenant:()=>llm,pushLineMessage:async(to,message,_,options)=>{if(failSummary&&typeof message==='string'&&message.startsWith('活動：')){failSummary=false;throw Error('delivery');}pushes.push({to,message,options});}};
 const options={env,store,now,line,tasks,calendar,platform,llm,logger:{warn(){}}};let service=createLeafGroups(options);
 const message=(text='@甲 @乙 明天15:00會議',mentions=[a,b,a],sender=owner,g=group)=>({type:'message',webhookEventId:'event-'+(++serial),timestamp:clock,source:{type:'group',groupId:g,userId:sender},message:{id:'message-'+serial,type:'text',text,mention:{mentionees:mentions.map(userId=>({type:'user',userId}))}}});
 const button=(id,revision=1,sender=owner,g=group,action='confirm')=>({type:'postback',webhookEventId:'button-'+(++serial),timestamp:clock,source:{type:'group',groupId:g,userId:sender},postback:{data:`groupcal:${action}:${id}:${revision}`}});
 const capture=async e=>{await archive.capture([e]);return service.capture([e]);};
 const rows=async()=> (await db.query("SELECT payload->'groupDispatch' AS p FROM central_archive.jobs WHERE payload ? 'groupDispatch' ORDER BY event_at,key")).rows.map(r=>r.p);
 return {db,store,archive,options,identities,names,pushes,submissions,selfSubmissions,attempts,writes,disconnected,message,button,capture,rows,drain:()=>service.drain(),advance:(ms=61000)=>clock+=ms,restart:()=>service=createLeafGroups(options),uncertain:()=>uncertain=true,failSummary:()=>failSummary=true,close:()=>db.close()};
}
test('replied-image explanation reaches task submission even when semantic model would return none, with original quote and replay preserved',async()=>{const f=await fixture();try{
 const e=f.message('@同仁甲 請說明這張圖片的目的',[a]);e.message.quotedMessageId='12345678901234567';await f.capture(e);await f.drain();
 const p=(await f.rows())[0];assert.equal(p.mode,'task');assert.equal(p.phase,'done');assert.equal(f.submissions.length,1);assert.equal(f.submissions[0].e.message.quotedMessageId,e.message.quotedMessageId);assert.equal(f.writes.size,0);
 await f.capture(e);f.restart();await f.drain();assert.equal(f.submissions.length,1);
}finally{await f.close();}});
test('quoted question, progress and cancellation do not use the explicit explanation override',async()=>{const f=await fixture();try{
 for(const text of ['@同仁甲 你覺得這張圖片如何？','@同仁甲 這張圖片的說明進度如何？','@同仁甲 不用說明這張圖片的目的。']){const e=f.message(text,[a]);e.message.quotedMessageId='12345678901234567';await f.capture(e);await f.drain();}
 assert.equal(f.submissions.length,0);assert((await f.rows()).every(p=>p.mode==='none'&&p.phase==='ignored'));
}finally{await f.close();}});
test('one semantic decision freezes validated task extraction with the original message and unique mention ordering',async()=>{const f=await fixture();try{
 let calls=0;f.options.llm.completeJson=async opts=>{calls++;assert(opts.schema.properties.assignments);return {kind:'task',assignments:[{title:'整理清單',description:'整理本週清單',recipientIndices:[0,1]}]};};
 const e=f.message('@甲 @乙 整理清單',[a,b,a]);await f.capture(e);await f.drain();assert.equal(calls,1);assert.equal(f.submissions.length,1);assert.equal(f.submissions[0].judgment.policy,'line-task-fast-notice-v1');assert.deepEqual(f.submissions[0].judgment.assignments[0].recipientIndices,[0,1]);assert.equal(f.submissions[0].e.message.text,e.message.text);const row=(await f.rows())[0];assert.deepEqual(row.taskJudgment,f.submissions[0].judgment);
 await f.capture(e);f.restart();await f.drain();assert.equal(calls,1);assert.equal(f.submissions.length,1);
}finally{await f.close();}});
test('meeting requires original organizer confirmation; fanout deduplicates native mentions and replay',async()=>{const f=await fixture();try{
 const e=f.message();await f.capture(e);await f.drain();assert.equal(f.writes.size,0);let p=(await f.rows())[0];assert.equal(p.phase,'confirmation');
 const card=f.pushes.find(x=>x.message.type==='flex').message;assert.equal(card.contents.footer.contents.length,2);assert.match(JSON.stringify(card),/groupcal:confirm/);
 await f.capture(f.button(p.id,1,a));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.button(p.id,1,owner,C(5)));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,3);assert.equal(f.submissions.length,0);
 assert.deepEqual(f.attempts.map(x=>x.account),['owner','a','b']);assert.ok(f.attempts.every(x=>x.event.location==='漫漫回嘉附近的咖啡廳'));
 await f.capture(e);await f.capture(f.button(p.id));f.restart();await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.length,3);
}finally{await f.close();}});
test('unresolved task identity is silently terminal, login and replay never backfill',async()=>{const f=await fixture();try{
 f.identities.delete(a);const e=f.message('@甲 明天請整理清單',[a]);await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.equal(f.pushes.length,0);assert.equal((await f.rows())[0].phase,'ignored');
 f.identities.set(a,{account:'a',bindingId:'a-binding'});f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.equal(f.pushes.length,0);
 await f.capture(f.message('@甲 請整理清單',[a]));await f.drain();assert.equal(f.submissions.length,1);
}finally{await f.close();}});

test('mixed linked and unknown recipients silently skip the whole task and never resume',async()=>{const f=await fixture();try{
 f.identities.delete(b);const e=f.message('@甲 @乙 整理清單',[a,b]);await f.capture(e);await f.drain();assert.equal(f.pushes.length,0);assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
 f.identities.set(b,{account:'b',bindingId:'b-binding'});f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.equal(f.pushes.length,0);
}finally{await f.close();}});
test('ambiguous sender tenant silently ends the task',async()=>{const f=await fixture();try{
 f.options.tasks.groupServices=async()=>[{key:'one'},{key:'two'}];await f.capture(f.message('@甲 整理清單',[a]));await f.drain();assert.equal(f.pushes.length,0);assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
}finally{await f.close();}});
test('unavailable identity service pauses silently and retries a genuinely eligible task',async()=>{const f=await fixture();try{
 const resolver=f.options.tasks.resolveGroupIdentity;f.options.tasks.resolveGroupIdentity=async()=>{throw Error('service_unavailable');};await f.capture(f.message('@甲 整理清單',[a]));await f.drain();assert.equal(f.pushes.length,0);assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'task');
 f.options.tasks.resolveGroupIdentity=resolver;f.advance();f.restart();await f.drain();assert.equal(f.submissions.length,1);assert.equal(f.pushes.length,0);
}finally{await f.close();}});
test('disabled recipient, late access denial and previously deferred login are terminal without notices',async()=>{for(const scenario of ['disabled','denied','legacy']){const f=await fixture();try{
 if(scenario==='disabled')f.options.tasks.resolveTaskGroupIdentity=async id=>id===b?null:f.identities.get(id);
 if(scenario==='denied')f.options.tasks.submitGroupTask=async()=>{throw Object.assign(Error('disabled'),{code:'ACCESS_DISABLED',status:403});};
 const e=f.message('@甲 @乙 整理清單',[a,b]);await f.capture(e);
 if(scenario==='legacy')await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{groupDispatch}',(payload->'groupDispatch') || $1::jsonb)",[JSON.stringify({mode:'task',phase:'task',people:[{userId:b,state:'login'}],notices:['login:old']})]);
 await f.drain();assert.equal(f.pushes.length,0);assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
 f.options.tasks.resolveTaskGroupIdentity=async id=>f.identities.get(id);f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.equal(f.pushes.length,0);
}finally{await f.close();}}});

test('unlinked meeting identity stops silently and cannot resume after login or original message replay',async()=>{const f=await fixture();try{
 f.identities.delete(b);const e=f.message();await f.capture(e);await f.drain();const p=(await f.rows())[0];assert.equal(p.phase,'ignored');assert.equal(p.stopReason,'identity_required');assert.equal(f.writes.size,0);assert.equal(f.pushes.length,0);
 f.identities.set(b,{account:'b',bindingId:'b-binding'});f.advance();f.restart();await f.drain();await f.capture(e);await f.drain();assert.equal(f.writes.size,0);assert.equal(f.pushes.length,0);assert.equal((await f.rows())[0].phase,'ignored');
}finally{await f.close();}});

test('legacy disconnected fanout stops on first visit and preserves source and every existing calendar receipt',async()=>{const f=await fixture();try{
 await f.capture(f.message());await f.drain();const initial=(await f.rows())[0];f.disconnected.add('a');await f.capture(f.button(initial.id));await f.drain();assert.equal(f.writes.size,2);
 await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{groupDispatch}',((payload->'groupDispatch')-'closedReason'-'stopReason'-'stoppedAt')||$1::jsonb) WHERE payload->'groupDispatch'->>'id'=$2",[JSON.stringify({phase:'fanout',attempts:6800,availableAt:0,leaseUntil:0,lease:null}),initial.id]);
 const before=(await f.rows()).find(p=>p.id===initial.id),attempts=f.attempts.length,notices=f.pushes.length;f.restart();await f.drain();const after=(await f.rows()).find(p=>p.id===initial.id);assert.equal(after.phase,'ignored');assert.equal(after.stopReason,'connection_required');assert.deepEqual(after.people,before.people);assert.equal(f.writes.size,2);assert.equal(f.attempts.length,attempts);assert.equal(f.pushes.length,notices);
 f.advance(3600000);f.restart();await f.drain();assert.equal((await f.rows()).find(p=>p.id===initial.id).attempts,6801);assert.equal(await f.store.lease(),null);
}finally{await f.close();}});

test('transient classification errors silently stop after three failures and a fresh source still works',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async()=>{throw Error('temporary_network_failure');};await f.capture(f.message());await f.drain();let p=(await f.rows())[0];assert.equal(p.retryFailures,1);assert.equal(f.pushes.length,0);
 f.advance();await f.drain();p=(await f.rows())[0];assert.equal(p.retryFailures,2);f.advance();await f.drain();assert.equal((await f.rows())[0].attempts,2,'five minute backoff');f.advance(301000);await f.drain();p=(await f.rows())[0];assert.equal(p.phase,'ignored');assert.equal(p.retryFailures,3);assert.equal(p.stopReason,'retry_limit');assert.equal(f.pushes.length,0);
 f.options.llm.completeJson=original;f.advance(3600000);f.restart();await f.drain();assert.equal(f.pushes.length,0);await f.capture(f.message());await f.drain();assert.equal(f.pushes.length,1);assert.equal((await f.rows()).filter(p=>p.phase==='confirmation').length,1);
}finally{await f.close();}});

test('temporary calendar failures have a finite retry budget without group error messages',async()=>{const f=await fixture();try{
 f.options.calendar.writeGroupEvent=async()=>{throw Object.assign(Error('service'),{code:'GOOGLE_UNAVAILABLE'});};await f.capture(f.message());await f.drain();const p=(await f.rows())[0];const initialNotices=f.pushes.length;await f.capture(f.button(p.id));await f.drain();assert.equal((await f.rows()).find(x=>x.id===p.id).retryFailures,1);
 f.advance();await f.drain();f.advance(301000);f.restart();await f.drain();const result=(await f.rows()).find(x=>x.id===p.id);assert.equal(result.phase,'ignored');assert.equal(result.retryFailures,3);assert.equal(f.pushes.length,initialNotices);assert.equal(f.writes.size,0);f.advance(3600000);await f.drain();assert.equal(f.pushes.length,initialNotices);
}finally{await f.close();}});
test('ambiguous time blocks creation; organizer text correction gives new card and invalidates old revision',async()=>{const f=await fixture();try{
 await f.capture(f.message('@甲 時間未定的會議',[a]));await f.drain();let p=(await f.rows())[0];assert.ok(p.prepared.missing.length);
 await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,0);
 const edit=f.message('補充活動：明天下午四點',[a]);await f.capture(edit);await f.drain();p=(await f.rows()).find(x=>x.mode==='meeting');assert.equal(p.revision,2);assert.equal(p.prepared.event.time,'16:00');
 await f.capture(f.button(p.id,1));await f.drain();assert.equal(f.writes.size,0);await f.capture(f.button(p.id,2));await f.drain();assert.equal(f.writes.size,2);
}finally{await f.close();}});
test('uncertain API acceptance and summary delivery retry preserve receipts and do not duplicate copies',async()=>{const f=await fixture();try{
 await f.capture(f.message());await f.drain();const p=(await f.rows())[0];f.uncertain();f.failSummary();await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,3);
 f.advance();f.restart();await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.filter(x=>x.account==='a').length,1);assert.equal(f.attempts.filter(x=>x.account==='b').length,1);
 f.advance(301000);await f.drain();assert.equal(f.writes.size,3);
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'done');
}finally{await f.close();}});
test('source removal, cancellation and changed work identity fence future side effects',async()=>{const f=await fixture();try{
 const e=f.message();await f.capture(e);await f.drain();const p=(await f.rows())[0];await f.capture(f.button(p.id));await f.store.removed({source:e.source,unsend:{messageId:e.message.id}});await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.message());await f.drain();let q=(await f.rows()).find(x=>x.phase==='confirmation');await f.capture(f.button(q.id,1,owner,group,'cancel'));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.message());await f.drain();q=(await f.rows()).find(x=>x.phase==='confirmation');f.identities.set(owner,{account:'other',bindingId:'other'});await f.capture(f.button(q.id));await f.drain();assert.equal(f.writes.size,0);
}finally{await f.close();}});
test('archive source gate rejects invented inputs and other bot scopes; lease tokens fence stale writers',async()=>{const f=await fixture();try{
 const e=f.message();await assert.rejects(f.options.store.insert(e),/not_archived/);await f.archive.capture([e]);await assert.rejects(f.options.store.insert({...e,message:{...e.message,text:'forged'}}),/not_archived/);
 await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{evidenceQuality}','\"history\"'::jsonb)");await assert.rejects(f.store.insert(e),/not_archived/);await f.archive.capture([e]);
 const foreign=createGroupStore({env:{...f.options.env,AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:U(9)},pool:{connect:async()=>({query:(...args)=>f.db.query(...args),release(){}})}});
 await assert.rejects(foreign.insert(e),/not_archived/);assert.equal(await foreign.lease(),null);
 await f.store.insert(e);const leased=await f.store.lease();f.advance();f.advance();f.advance();const newer=await f.store.lease();assert.ok(newer);assert.equal(await f.store.save(leased,{...leased.dispatch,phase:'done'}),false);
 await f.store.removed({source:e.source,unsend:{messageId:e.message.id}});assert.equal(await f.store.save(newer,newer.dispatch),true);assert.equal((await f.rows())[0].sourceRemoved,true);
}finally{await f.close();}});
test('greetings and assistant operation commands do not become tasks or meetings; private messages and all mentions unclaimed',async()=>{const f=await fixture();try{
 await f.capture(f.message('@甲 早安，謝謝'));await f.drain();assert.equal((await f.rows())[0].phase,'ignored');assert.equal(f.pushes.length,0);
 const e=f.message();e.source={type:'user',userId:owner};assert.deepEqual(await f.capture(e),[]);
 const all=f.message();all.message.mention.mentionees.push({type:'all'});assert.deepEqual(await f.capture(all),[]);assert.equal(f.submissions.length,0);assert.equal(f.writes.size,0);
}finally{await f.close();}});
test('signed runtime webhook persists mentioned group source before ACK, excludes legacy duplicate and preserves business context',async()=>{const f=await fixture();try{
 let handler,acked=false;const legacy=[],business=[];const live=createLeafGroups(f.options),insert=f.store.insert;
 f.store.insert=async(...args)=>{assert.equal(acked,false);return insert(...args);};
 const sign=raw=>crypto.createHmac('sha256','synthetic').update(raw).digest('base64');
 const platform={...f.options.platform,attachmentArchive:{setTransportResolver(){},capture:async()=>[],health:()=>({})}};
 const deps={
  'node:http':{default:{createServer(fn){handler=fn;return {listen(){}};}}},'node:crypto':{default:crypto},
  './core/bootstrap.js':{bootstrap:async()=>({tenants:[],line:{configured:true,isValidSignature:(raw,s)=>s===sign(raw)},router:{resolveGroupBinding:async()=>({tenant:{key:'fixture'},binding:{status:'啟用'}})},dispatcher:{collectRoutes:()=>[],dispatchMessage:async({event})=>business.push(event)},portal:{},modules:new Map(),platform,llm:f.options.llm,logger:{log(){},warn(){},error(){}}})},
  './modules/meetings/conversation-service.js':{createConversationMeetings:()=>({enabled:false,capture:async()=>[],drain:async()=>{},handle:async()=>false,health:()=>({enabled:false})})},
  './core/central-archive/index.js':{createCentralArchive:async()=>({capture:events=>f.archive.capture(events),health:()=>({})})},
  './core/line-io/index.js':{createLineIo:async()=>({enabled:false,owns:()=>false,capture:async()=>{},handle:async()=>false}),readLineIoBody:async req=>req.rawBody},
  './core/leaf-calendar/index.js':{createLeafCalendar:async()=>({accepts:()=>false,capture:async()=>{},drain:async()=>{},health:()=>({})})},
  './core/common-line-entry.js':commonLineEntry,
  './core/login-continuation-http.js':{createLoginContinuationHttp:()=>({handle:async()=>false,actor:async()=>null})},
      './core/leaf-tasks.js':{createLeafTasks:()=>({capture:async events=>legacy.push(...events),drain:async()=>{},health:()=>({})})},
  './core/leaf-groups.js':{createLeafGroups:()=>live},
  './core/bank-line-reply-intake.js':{createBankLineReplyIntake:()=>({receive:async()=>false,drain:async()=>{}})},
  './core/attachment-retrieval.js':{createAttachmentRetrieval:()=>({handle:async()=>false,deliveryReady:()=>false}),parseAttachmentRequest:()=>null},
  './core/portal-command-entry.js':portalCommandEntry,
  './core/usage-guide-entry.js':usageGuideEntry,
      './core/work-journal-entry.js':workJournalEntry,'./core/uof-setup-entry.js':uofSetupEntry,'./core/direct-line.js':directLine,

  './core/access-directory.js':{createAccessDirectory:()=>({})},'./core/portal-handoff.js':{safePortalHandoffLocation:()=> '/'},
  './core/util.js':{readBody:async req=>req.rawBody,sendJson:(res,status,body)=>{res.status=status;res.body=body;},sendText:(res,status)=>{res.status=status;acked=true;}},
  './core/group-onboarding.js':Object.fromEntries(['GROUP_ONBOARDING_BUILD','deliverGroupOnboardingReply','groupOnboardingProperties','groupOnboardingRepairProperties','groupOnboardingSuccessMessage','parseGroupOnboardingCommand','supportedGroupOnboardingExamples','withResolvedGroupName'].map(k=>[k,()=>({isCommand:false})]))
 };
 const context=vm.createContext({URL,Buffer,console,process:{env:{}},setInterval:()=>({unref(){}})}),module=new vm.SourceTextModule(await fs.readFile(new URL('../server.js',import.meta.url),'utf8'),{context});
 await module.link(name=>new vm.SyntheticModule(Object.keys(deps[name]),function(){for(const [k,v] of Object.entries(deps[name]))this.setExport(k,v);},{context}));await module.evaluate();
 const e=f.message(),raw=JSON.stringify({events:[e]});const denied={};await handler({method:'POST',url:'/webhook/line',rawBody:raw,headers:{'x-line-signature':'wrong'}},denied);assert.equal(denied.status,401);assert.equal((await f.rows()).length,0);
 const res={};await handler({method:'POST',url:'/webhook/line',rawBody:raw,headers:{'x-line-signature':sign(raw)}},res);assert.equal(res.status,200);assert.equal((await f.rows()).length,1);assert.equal(legacy.length,0);assert.equal(f.writes.size,0);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(business.length,1);await live.drain();assert.equal(f.writes.size,0);assert.ok(f.pushes.some(x=>x.message.type==='flex'));
}finally{await f.close();}});


test('unanswered group invitation silently cancels at ten minutes and old buttons cannot revive it',async()=>{const f=await fixture();try{
 await f.capture(f.message());await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');const count=f.pushes.length;
 assert.match(JSON.stringify(f.pushes),/10 分鐘/);assert.equal(f.options.now(),p.confirmationStartedAt);assert.equal(f.options.store, f.store);
 f.advance(599999);await f.drain();assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'confirmation');
 f.advance(1);f.restart();await f.capture(f.button(p.id));await f.drain();p=(await f.rows()).find(x=>x.id===p.id);
 assert.equal(p.phase,'cancelled');assert.equal(p.closedReason,'group-invite-silent-timeout-10m-v1');assert.equal(f.pushes.length,count);assert.equal(f.writes.size,0);assert.equal(f.attempts.length,0);
 for(const action of ['confirm','cancel']){await f.capture(f.button(p.id,1,owner,group,action));await f.drain();}assert.equal(f.pushes.length,count);assert.equal(f.writes.size,0);
 assert.deepEqual(await f.store.drafts(group,owner),[]);f.advance(31*86400000);await f.drain();assert.equal(f.pushes.length,count);
}finally{await f.close();}});
test('background timeout works without clicks, identity lookup or reminders and stays cancelled after restart',async()=>{const f=await fixture();try{
 await f.capture(f.message());await f.drain();const p=(await f.rows()).find(x=>x.mode==='meeting'),count=f.pushes.length;
 f.options.tasks.resolveGroupIdentity=async()=>{throw Error('must_not_resolve_expired_invite');};f.advance(600000);f.restart();await f.drain();
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');assert.equal(f.pushes.length,count);assert.equal(f.writes.size,0);
 f.restart();f.advance();await f.drain();assert.equal(f.pushes.length,count);
}finally{await f.close();}});
test('confirmed meeting preserves created events but stops disconnected participants without automatic catchup',async()=>{const f=await fixture();try{
 await f.capture(f.message());await f.drain();const p=(await f.rows()).find(x=>x.mode==='meeting');f.disconnected.add('a');f.advance(599999);
 await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,2);assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'ignored');
 const count=f.pushes.length,attempts=f.attempts.length;f.advance(600000);f.disconnected.clear();f.restart();await f.drain();await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,2);assert.equal(f.attempts.length,attempts);assert.equal(f.pushes.length,count);assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'ignored');
}finally{await f.close();}});
test('editing cards does not renew deadline; legacy cards expire silently; task waiting unaffected',async()=>{const f=await fixture();try{
 await f.capture(f.message());await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');const started=p.confirmationStartedAt;
 f.advance(300000);await f.capture(f.message('補充活動：明天下午四點',[a]));await f.drain();p=(await f.rows()).find(x=>x.id===p.id);assert.equal(p.revision,2);assert.equal(p.confirmationStartedAt,started);
 const count=f.pushes.length;f.advance(300000);await f.capture(f.button(p.id,2));await f.drain();assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');assert.equal(f.pushes.length,count);
 await f.capture(f.message());await f.drain();const legacy=(await f.rows()).find(x=>x.phase==='confirmation');
 await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{groupDispatch}',(payload->'groupDispatch')-'confirmationStartedAt') WHERE payload->'groupDispatch'->>'id'=$1",[legacy.id]);
 f.advance(600000);await f.drain();assert.equal((await f.rows()).find(x=>x.id===legacy.id).phase,'cancelled');
 f.identities.delete(a);await f.capture(f.message('@甲 請整理清單',[a]));await f.drain();f.advance(600000);f.identities.set(a,{account:'a',bindingId:'a-binding'});await f.drain();assert.equal(f.submissions.length,0);
}finally{await f.close();}});


test('store rejects expired confirmation atomically before background cancellation and delivery retries cannot reset clock',async()=>{const f=await fixture();try{
 const push=f.options.platform.pushLineMessage;let first=true;f.options.platform.pushLineMessage=async(...args)=>{if(first&&args[1]?.type==='flex'){first=false;throw Error('uncertain_card_delivery');}return push(...args);};
 f.restart();await f.capture(f.message());await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');const started=p.confirmationStartedAt;assert.equal(p.phase,'preview');
 f.advance(61000);await f.drain();p=(await f.rows()).find(x=>x.id===p.id);assert.equal(p.phase,'confirmation');assert.equal(p.confirmationStartedAt,started);
 const count=f.pushes.length;f.advance(539000);const result=await f.store.control(p.id,f.button(p.id),'confirm',1);assert.equal(result.code,'expired');
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');await f.drain();assert.equal(f.writes.size,0);assert.equal(f.pushes.length,count);
}finally{await f.close();}});
test('new card timer starts at first delivery rather than old source time; slow corrections cannot confirm after deadline',async()=>{const f=await fixture();try{
 const event=f.message();await f.capture(event);f.advance(3600000);await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');assert.equal(p.phase,'confirmation');assert.equal(p.confirmationStartedAt,f.options.now());
 const started=p.confirmationStartedAt;f.advance(599000);const resolve=f.options.tasks.resolveGroupIdentity;let once=true;f.options.tasks.resolveGroupIdentity=async(...args)=>{if(once){once=false;f.advance(1000);}return resolve(...args);};
 await f.capture(f.button(p.id));await f.drain();p=(await f.rows()).find(x=>x.id===p.id);assert.equal(p.phase,'cancelled');assert.equal(p.confirmationStartedAt,started);assert.equal(f.writes.size,0);
 assert.equal(f.options.now(),started+600000);assert.equal(f.options.store, f.store);
}finally{await f.close();}});

test('mentioning the bot alongside internal and unknown people cannot bypass eligibility through self-task quick create',async()=>{const f=await fixture();try{
 f.identities.delete(b);const e=f.message('@葉小蝸 幫我建立任務：@甲 @乙 整理清單',[bot,a,b]);e.message.mention.mentionees[0].isSelf=true;
 await f.capture(e);await f.drain();assert.equal(f.pushes.length,0);assert.equal(f.selfSubmissions.length,0);assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');assert.equal((await f.rows())[0].mode,'task');
}finally{await f.close();}});

test('legacy self-task draft mentioning other recipients cannot create work on a later confirmation',async()=>{const f=await fixture();try{
 const e=f.message('@葉小蝸 幫我建立任務：@甲 @乙 整理清單',[bot,a,b]);e.message.mention.mentionees[0].isSelf=true;await f.capture(e);
 await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{groupDispatch}',(payload->'groupDispatch') || $1::jsonb)",[JSON.stringify({quickKind:'selftask',mode:'selftask',phase:'selfissue'})]);
 await f.drain();assert.equal(f.pushes.length,0);assert.equal(f.selfSubmissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
}finally{await f.close();}});

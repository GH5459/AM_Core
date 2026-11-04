import * as firstUseMeetings from '../core/first-use-meetings.js';
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
import {fixture,U} from './fixtures/leaf-groups.mjs';
export {fixture} from './fixtures/leaf-groups.mjs';
const bot=U(0),owner=U(1),a=U(2),b=U(3),group='C'+'4'.repeat(32),C=n=>'C'+String(n).repeat(32);
test('quoted assignment replies are queued once in the original group without changing other quoted messages',async()=>{const f=await fixture();try{
 const original=f.message('@甲 任務 整理清單',[a]);original.message.id='12345678901234567';await f.capture(original);await f.drain();assert.equal(f.submissions.length,1);
 const reply=f.message('已整理完成',[],a);reply.message.id='12345678901234568';reply.message.quotedMessageId=original.message.id;await f.capture(reply);await f.drain();assert.equal(f.progress.length,1);assert.equal(f.progress[0].e.message.text,'已整理完成');
 await f.capture(reply);f.restart();await f.drain();assert.equal(f.progress.length,1);
 const unrelated=f.message('其他群',[],a,C(5));unrelated.message.quotedMessageId=original.message.id;await f.capture(unrelated);await f.drain();assert.equal(f.progress.length,1);
}finally{await f.close();}});
test('活動 and 會議 commands bypass semantic classification and create when details are complete',async()=>{for(const word of ['活動','會議']){const f=await fixture();try{
 let classifications=0;const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>{if(input.schema.properties.kind){classifications++;throw Error('should not classify');}return original(input);};
 const e=f.message('@甲 '+word+' 明天15:00',[a]);await f.capture(e);await f.drain();const p=(await f.rows())[0];assert.equal(p.phase,'done');assert.equal(p.activityResultsV2,true);assert.equal(classifications,0);assert.deepEqual(f.attempts.map(x=>x.account),['owner','a']);
 await f.capture(e);await f.capture(f.button(p.id,1,a));f.restart();await f.drain();assert.equal(f.attempts.length,2);
}finally{await f.close();}}});


test('activity extraction timeout tells the group and never creates a calendar event',async()=>{const f=await fixture();try{
 f.options.llm.completeJson=async()=>{throw Error('timeout');};const e=f.message('@甲 活動 明天15:00',[a]);e.message.mention.mentionees[0].index=0;e.message.mention.mentionees[0].length=2;
 await f.capture(e);await f.drain();assert.equal((await f.rows())[0].phase,'ignored');assert.equal(f.writes.size,0);assert.match(f.pushes[0].message,/暫時無法整理活動資料.*尚未建立/s);
 f.restart();await f.capture(e);await f.drain();assert.equal(f.pushes.length,1);
}finally{await f.close();}});
test('replied-image explanation requires the task keyword and preserves its original quote',async()=>{const f=await fixture();try{
 const old=f.message('@同仁甲 請說明這張圖片的目的',[a]);old.message.quotedMessageId='12345678901234567';assert.deepEqual(await f.capture(old),[]);await f.drain();assert.equal(f.submissions.length,0);
 const e=f.message('@同仁甲 任務 請說明這張圖片的目的',[a]);e.message.quotedMessageId=old.message.quotedMessageId;await f.capture(e);await f.drain();assert.equal(f.submissions.length,1);assert.equal(f.submissions[0].e.message.quotedMessageId,e.message.quotedMessageId);assert.equal(f.writes.size,0);
 await f.capture(e);f.restart();await f.drain();assert.equal(f.submissions.length,1);
}finally{await f.close();}});


test('quoted question, progress and cancellation do not use the explicit explanation override',async()=>{const f=await fixture();try{
 for(const text of ['@同仁甲 你覺得這張圖片如何？','@同仁甲 這張圖片的說明進度如何？','@同仁甲 不用說明這張圖片的目的。']){const e=f.message(text,[a]);e.message.quotedMessageId='12345678901234567';await f.capture(e);await f.drain();}
 assert.equal(f.submissions.length,0);assert((await f.rows()).every(p=>p.mode==='none'&&p.phase==='ignored'));
}finally{await f.close();}});
test('one command extraction freezes the original task and all explicitly mentioned recipients',async()=>{const f=await fixture();try{
 let calls=0;f.options.llm.completeJson=async opts=>{calls++;assert(opts.schema.properties.executionDate);return {title:'整理清單',description:'整理本週清單',executionDate:'',missing:[]};};
 const e=f.message('@甲 @乙 任務 整理清單',[a,b]);await f.capture(e);await f.drain();assert.equal(calls,1);assert.equal(f.submissions.length,1);assert.deepEqual(f.submissions[0].p.map(x=>x.account),['owner','a','b']);assert.equal(f.submissions[0].e.message.text,e.message.text);assert.equal(f.submissions[0].d.dueAt,'2026-10-15T12:00:00+08:00');
 await f.capture(e);f.restart();await f.drain();assert.equal(calls,1);assert.equal(f.submissions.length,1);
}finally{await f.close();}});


test('meeting accepts a participant confirmation; fanout deduplicates native mentions and replay',async()=>{const f=await fixture();try{
 const e=f.message();await f.historical(e);await f.drain();assert.equal(f.writes.size,0);let p=(await f.rows())[0];assert.equal(p.phase,'confirmation');
 const card=f.pushes.find(x=>x.message.type==='flex').message;assert.equal(card.contents.footer.contents.length,2);assert.match(JSON.stringify(card),/groupcal:confirm/);
 await f.capture(f.button(p.id,1,U(9)));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.button(p.id,1,owner,C(5)));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.button(p.id,1,a));await f.drain();assert.equal(f.writes.size,3);assert.equal(f.submissions.length,0);
 assert.deepEqual(f.attempts.map(x=>x.account),['owner','a','b']);assert.ok(f.attempts.every(x=>x.event.location==='漫漫回嘉附近的咖啡廳'));
 await f.capture(e);await f.capture(f.button(p.id));f.restart();await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.length,3);
}finally{await f.close();}});
test('explicit activity reports disconnected participants without replaying successful calendars',async()=>{const f=await fixture();try{
 f.disconnected.add('b');const e=f.message('@甲 @乙 活動 明天15:00',[a,b]);await f.capture(e);await f.drain();const p=(await f.rows())[0];
 await f.capture(f.button(p.id,1,a));await f.drain();assert.equal(f.writes.size,2);
 const report=f.pushes.find(x=>typeof x.message==='string'&&x.message.startsWith('活動：'))?.message;
 assert.match(report,/已加入行事曆：發起人、同仁甲/);assert.match(report,/未建立：同仁乙/);
 f.advance(3600000);f.restart();await f.drain();assert.equal(f.attempts.length,3);assert.equal(f.writes.size,2);
}finally{await f.close();}});
test('an unlinked invitee is reported without creating an account or backfilling after login',async()=>{const f=await fixture();try{
 f.identities.delete(b);const e=f.message('@甲 @乙 活動 明天15:00',[a,b]);await f.capture(e);await f.drain();assert.equal(f.writes.size,2);assert.equal((await f.rows())[0].phase,'done');assert.match(f.pushes.at(-1).message,/未建立：同仁乙/);
 f.identities.set(b,{account:'b',bindingId:'b-binding'});f.restart();await f.capture(e);await f.drain();assert.equal(f.attempts.length,2);
}finally{await f.close();}});


test('simultaneous redeliveries and old confirmation clicks create one event per person',async()=>{const f=await fixture();try{
 const e=f.message();await Promise.all([f.capture(e),f.capture(e)]);await Promise.all([f.drain(),f.drain()]);const p=(await f.rows())[0];await Promise.all([f.capture(f.button(p.id,1,owner)),f.capture(f.button(p.id,1,a))]);await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.length,3);
}finally{await f.close();}});


test('an activity may omit location while missing name or time still blocks creation',async()=>{for(const missing of ['location','topic']){const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async input=>{const result=await original(input);if(result.events)result.events[0][missing]='';return result;};
 await f.capture(f.message('@甲 活動 明天15:00',[a]));await f.drain();const p=(await f.rows())[0];if(missing==='location'){assert.equal(p.phase,'done');assert.equal(f.writes.size,2);}else {assert(p.prepared.missing.includes('活動名稱'));assert.equal(f.writes.size,0);await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,0);}
}finally{await f.close();}}});


test('unresolved task identity ends the command and replay never backfills after login',async()=>{const f=await fixture();try{
 f.identities.delete(a);const e=f.message('@甲 任務 整理清單',[a]);await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
 f.identities.set(a,{account:'a',bindingId:'a-binding'});f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);
 await f.capture(f.message('@甲 任務 整理清單',[a]));await f.drain();assert.equal(f.submissions.length,1);
}finally{await f.close();}});


test('mixed linked and unknown task recipients reject the whole command without later replay',async()=>{const f=await fixture();try{
 f.identities.delete(b);const e=f.message('@甲 @乙 任務 整理清單',[a,b]);await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
 f.identities.set(b,{account:'b',bindingId:'b-binding'});f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);
}finally{await f.close();}});


test('ambiguous sender tenant cannot authorize a task command',async()=>{const f=await fixture();try{
 f.options.tasks.groupServices=async()=>[{key:'one'},{key:'two'}];await f.capture(f.message('@甲 任務 整理清單',[a]));await f.drain();assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
}finally{await f.close();}});


test('unavailable identity service retries the same eligible task without duplicate submission',async()=>{const f=await fixture();try{
 const resolver=f.options.tasks.resolveGroupIdentity;f.options.tasks.resolveGroupIdentity=async()=>{throw Error('service_unavailable');};await f.capture(f.message('@甲 任務 整理清單',[a]));await f.drain();assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].retryFailures,1);
 f.options.tasks.resolveGroupIdentity=resolver;f.advance();f.restart();await f.drain();assert.equal(f.submissions.length,1);f.advance();await f.drain();assert.equal(f.submissions.length,1);
}finally{await f.close();}});


test('disabled recipient, late access denial and old deferred login remain terminal',async()=>{for(const scenario of ['disabled','denied','legacy']){const f=await fixture();try{
 if(scenario==='disabled')f.options.tasks.resolveTaskGroupIdentity=async id=>id===b?null:f.identities.get(id);
 if(scenario==='denied')f.options.tasks.submitDirectGroupTask=async()=>{throw Object.assign(Error('disabled'),{code:'ACCESS_DISABLED',status:403});};
 const e=f.message('@甲 @乙 任務 整理清單',[a,b]);if(scenario==='legacy')await f.historical(e,{mode:'task',quickKind:'task',phase:'task',people:[{userId:b,state:'login'}],notices:['login:old']});else await f.capture(e);
 await f.drain();assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');f.options.tasks.resolveTaskGroupIdentity=async id=>f.identities.get(id);f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);
}finally{await f.close();}}});


test('unlinked calendar organizer cannot authorize any participant write or resume after login',async()=>{const f=await fixture();try{
 f.identities.delete(owner);const e=f.message();await f.capture(e);await f.drain();assert.equal((await f.rows())[0].phase,'ignored');assert.equal(f.writes.size,0);
 f.identities.set(owner,{account:'owner',bindingId:'owner-binding'});f.advance();f.restart();await f.capture(e);await f.drain();assert.equal(f.writes.size,0);
}finally{await f.close();}});


test('legacy disconnected fanout stops on first visit and preserves source and every existing calendar receipt',async()=>{const f=await fixture();try{
 await f.historical();await f.drain();const initial=(await f.rows())[0];f.disconnected.add('a');await f.capture(f.button(initial.id));await f.drain();assert.equal(f.writes.size,2);
 await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{groupDispatch}',((payload->'groupDispatch')-'closedReason'-'stopReason'-'stoppedAt')||$1::jsonb) WHERE payload->'groupDispatch'->>'id'=$2",[JSON.stringify({phase:'fanout',attempts:6800,availableAt:0,leaseUntil:0,lease:null}),initial.id]);
 const before=(await f.rows()).find(p=>p.id===initial.id),attempts=f.attempts.length,notices=f.pushes.length;f.restart();await f.drain();const after=(await f.rows()).find(p=>p.id===initial.id);assert.equal(after.phase,'ignored');assert.equal(after.stopReason,'connection_required');assert.deepEqual(after.people,before.people);assert.equal(f.writes.size,2);assert.equal(f.attempts.length,attempts);assert.equal(f.pushes.length,notices);
 f.advance(3600000);f.restart();await f.drain();assert.equal((await f.rows()).find(p=>p.id===initial.id).attempts,6801);assert.equal(await f.store.lease(),null);
}finally{await f.close();}});

test('temporary command extraction failure is reported once and a fresh source can proceed',async()=>{const f=await fixture();try{
 const original=f.options.llm.completeJson;f.options.llm.completeJson=async()=>{throw Error('temporary_network_failure');};const e=f.message();await f.capture(e);await f.drain();assert.equal((await f.rows())[0].phase,'ignored');assert.equal(f.pushes.length,1);assert.equal(f.writes.size,0);
 await f.capture(e);f.restart();await f.drain();assert.equal(f.pushes.length,1);f.options.llm.completeJson=original;await f.capture(f.message());await f.drain();assert.equal(f.writes.size,3);
}finally{await f.close();}});


test('temporary calendar failures have a finite retry budget without group error messages',async()=>{const f=await fixture();try{
 f.options.calendar.writeGroupEvent=async()=>{throw Object.assign(Error('service'),{code:'GOOGLE_UNAVAILABLE'});};await f.historical();await f.drain();const p=(await f.rows())[0];const initialNotices=f.pushes.length;await f.capture(f.button(p.id));await f.drain();assert.equal((await f.rows()).find(x=>x.id===p.id).retryFailures,1);
 f.advance();await f.drain();f.advance(301000);f.restart();await f.drain();const result=(await f.rows()).find(x=>x.id===p.id);assert.equal(result.phase,'ignored');assert.equal(result.retryFailures,3);assert.equal(f.pushes.length,initialNotices);assert.equal(f.writes.size,0);f.advance(3600000);await f.drain();assert.equal(f.pushes.length,initialNotices);
}finally{await f.close();}});
test('ambiguous time blocks creation until the organizer supplies details; old buttons cannot repeat writes',async()=>{const f=await fixture();try{
 await f.capture(f.message('@甲 會議 時間未定',[a]));await f.drain();let p=(await f.rows())[0];assert.ok(p.prepared.missing.length);await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.message('補充活動：明天下午四點',[]));await f.drain();p=(await f.rows()).find(x=>x.mode==='meeting');assert.equal(p.revision,2);assert.equal(p.prepared.event.time,'16:00');assert.equal(f.writes.size,2);
 for(const revision of [1,2]){await f.capture(f.button(p.id,revision));await f.drain();}assert.equal(f.attempts.length,2);
}finally{await f.close();}});


test('uncertain API acceptance and summary delivery retry preserve receipts and do not duplicate copies',async()=>{const f=await fixture();try{
 await f.historical();await f.drain();const p=(await f.rows())[0];f.uncertain();f.failSummary();await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,3);
 f.advance();f.restart();await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.filter(x=>x.account==='a').length,1);assert.equal(f.attempts.filter(x=>x.account==='b').length,1);
 f.advance(301000);await f.drain();assert.equal(f.writes.size,3);
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'done');
}finally{await f.close();}});
test('source removal, cancellation and changed work identity fence future side effects',async()=>{const f=await fixture();try{
 const e=f.message();await f.historical(e);await f.drain();const p=(await f.rows())[0];await f.capture(f.button(p.id));await f.store.removed({source:e.source,unsend:{messageId:e.message.id}});await f.drain();assert.equal(f.writes.size,0);
 await f.historical();await f.drain();let q=(await f.rows()).find(x=>x.phase==='confirmation');await f.capture(f.button(q.id,1,owner,group,'cancel'));await f.drain();assert.equal(f.writes.size,0);
 await f.historical();await f.drain();q=(await f.rows()).find(x=>x.phase==='confirmation');f.identities.set(owner,{account:'other',bindingId:'other'});await f.capture(f.button(q.id));await f.drain();assert.equal(f.writes.size,0);
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
 await f.capture(f.message('@甲 早安，謝謝'));await f.drain();assert.equal((await f.rows()).length,0);assert.equal(f.pushes.length,0);
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
  './core/outbound-traffic.js':{OUTBOUND_TRAFFIC_CONTRACT:'outbound-http-counters-v1',createOutboundTraffic:()=>({snapshot:()=>({contract:'outbound-http-counters-v1',totals:{requests:0}})})},
      './core/bootstrap.js':{bootstrap:async()=>({tenants:[],line:{configured:true,isValidSignature:(raw,s)=>s===sign(raw)},router:{resolveGroupBinding:async()=>({tenant:{key:'fixture'},binding:{status:'啟用'}})},dispatcher:{collectRoutes:()=>[],dispatchMessage:async({event})=>business.push(event)},portal:{},modules:new Map(),platform,llm:f.options.llm,logger:{log(){},warn(){},error(){}}})},
  './modules/meetings/conversation-service.js':{createConversationMeetings:()=>({enabled:false,capture:async()=>[],drain:async()=>{},handle:async()=>false,health:()=>({enabled:false})})},
  './core/central-archive/index.js':{createCentralArchive:async()=>({capture:events=>f.archive.capture(events),health:()=>({})})},
  './core/line-io/index.js':{createLineIo:async()=>({enabled:false,owns:()=>false,capture:async()=>{},handle:async()=>false}),readLineIoBody:async req=>req.rawBody},
  './core/leaf-calendar/index.js':{createLeafCalendar:async()=>({accepts:()=>false,capture:async()=>{},drain:async()=>{},health:()=>({})})},
  './core/common-line-entry.js':commonLineEntry,
      './core/first-use-meetings.js':firstUseMeetings,
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
 const e=f.message('@甲 @乙 會議 時間未定'),raw=JSON.stringify({events:[e]});const denied={};await handler({method:'POST',url:'/webhook/line',rawBody:raw,headers:{'x-line-signature':'wrong'}},denied);assert.equal(denied.status,401);assert.equal((await f.rows()).length,0);
 const res={};await handler({method:'POST',url:'/webhook/line',rawBody:raw,headers:{'x-line-signature':sign(raw)}},res);assert.equal(res.status,200);assert.equal((await f.rows()).length,1);assert.equal(legacy.length,0);assert.equal(f.writes.size,0);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(business.length,1);await live.drain();assert.equal(f.writes.size,0);assert.ok(f.pushes.some(x=>x.message.type==='flex'));
}finally{await f.close();}});


test('unanswered group invitation silently cancels at ten minutes and old buttons cannot revive it',async()=>{const f=await fixture();try{
 await f.historical();await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');const count=f.pushes.length;
 assert.match(JSON.stringify(f.pushes),/10 分鐘/);assert.equal(f.options.now(),p.confirmationStartedAt);assert.equal(f.options.store, f.store);
 f.advance(599999);await f.drain();assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'confirmation');
 f.advance(1);f.restart();await f.capture(f.button(p.id));await f.drain();p=(await f.rows()).find(x=>x.id===p.id);
 assert.equal(p.phase,'cancelled');assert.equal(p.closedReason,'group-invite-silent-timeout-10m-v1');assert.equal(f.pushes.length,count);assert.equal(f.writes.size,0);assert.equal(f.attempts.length,0);
 for(const action of ['confirm','cancel']){await f.capture(f.button(p.id,1,owner,group,action));await f.drain();}assert.equal(f.pushes.length,count);assert.equal(f.writes.size,0);
 assert.deepEqual(await f.store.drafts(group,owner),[]);f.advance(31*86400000);await f.drain();assert.equal(f.pushes.length,count);
}finally{await f.close();}});
test('background timeout works without clicks, identity lookup or reminders and stays cancelled after restart',async()=>{const f=await fixture();try{
 await f.historical();await f.drain();const p=(await f.rows()).find(x=>x.mode==='meeting'),count=f.pushes.length;
 f.options.tasks.resolveGroupIdentity=async()=>{throw Error('must_not_resolve_expired_invite');};f.advance(600000);f.restart();await f.drain();
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');assert.equal(f.pushes.length,count);assert.equal(f.writes.size,0);
 f.restart();f.advance();await f.drain();assert.equal(f.pushes.length,count);
}finally{await f.close();}});
test('confirmed meeting preserves created events but stops disconnected participants without automatic catchup',async()=>{const f=await fixture();try{
 await f.historical();await f.drain();const p=(await f.rows()).find(x=>x.mode==='meeting');f.disconnected.add('a');f.advance(599999);
 await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,2);assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'ignored');
 const count=f.pushes.length,attempts=f.attempts.length;f.advance(600000);f.disconnected.clear();f.restart();await f.drain();await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,2);assert.equal(f.attempts.length,attempts);assert.equal(f.pushes.length,count);assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'ignored');
}finally{await f.close();}});
test('editing cards does not renew deadline; legacy cards expire silently; task waiting unaffected',async()=>{const f=await fixture();try{
 await f.historical();await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');const started=p.confirmationStartedAt;const engine=f.options.llm.completeJson;f.options.llm.completeJson=async input=>{const r=await engine(input);if(JSON.parse(input.userContent).existing)r.events[0].time='';return r;};
 f.advance(300000);await f.capture(f.message('補充活動：時間未定',[a]));await f.drain();p=(await f.rows()).find(x=>x.id===p.id);assert.equal(p.revision,2);assert.equal(p.confirmationStartedAt,started);
 const count=f.pushes.length;f.advance(300000);await f.capture(f.button(p.id,2));await f.drain();assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');assert.equal(f.pushes.length,count);
 await f.historical();await f.drain();const legacy=(await f.rows()).find(x=>x.phase==='confirmation');
 await f.db.query("UPDATE central_archive.jobs SET payload=jsonb_set(payload,'{groupDispatch}',(payload->'groupDispatch')-'confirmationStartedAt') WHERE payload->'groupDispatch'->>'id'=$1",[legacy.id]);
 f.advance(600000);await f.drain();assert.equal((await f.rows()).find(x=>x.id===legacy.id).phase,'cancelled');
 f.identities.delete(a);await f.capture(f.message('@甲 請整理清單',[a]));await f.drain();f.advance(600000);f.identities.set(a,{account:'a',bindingId:'a-binding'});await f.drain();assert.equal(f.submissions.length,0);
}finally{await f.close();}});


test('store rejects expired confirmation atomically before background cancellation and delivery retries cannot reset clock',async()=>{const f=await fixture();try{
 const push=f.options.platform.pushLineMessage;let first=true;f.options.platform.pushLineMessage=async(...args)=>{if(first&&args[1]?.type==='flex'){first=false;throw Error('uncertain_card_delivery');}return push(...args);};
 f.restart();await f.historical();await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');const started=p.confirmationStartedAt;assert.equal(p.phase,'preview');
 f.advance(61000);await f.drain();p=(await f.rows()).find(x=>x.id===p.id);assert.equal(p.phase,'confirmation');assert.equal(p.confirmationStartedAt,started);
 const count=f.pushes.length;f.advance(539000);const result=await f.store.control(p.id,f.button(p.id),'confirm',1);assert.equal(result.code,'expired');
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'cancelled');await f.drain();assert.equal(f.writes.size,0);assert.equal(f.pushes.length,count);
}finally{await f.close();}});
test('new card timer starts at first delivery rather than old source time; slow corrections cannot confirm after deadline',async()=>{const f=await fixture();try{
 const event=f.message();await f.historical(event);f.advance(3600000);await f.drain();let p=(await f.rows()).find(x=>x.mode==='meeting');assert.equal(p.phase,'confirmation');assert.equal(p.confirmationStartedAt,f.options.now());
 const started=p.confirmationStartedAt;f.advance(599000);const resolve=f.options.tasks.resolveGroupIdentity;let once=true;f.options.tasks.resolveGroupIdentity=async(...args)=>{if(once){once=false;f.advance(1000);}return resolve(...args);};
 await f.capture(f.button(p.id));await f.drain();p=(await f.rows()).find(x=>x.id===p.id);assert.equal(p.phase,'cancelled');assert.equal(p.confirmationStartedAt,started);assert.equal(f.writes.size,0);
 assert.equal(f.options.now(),started+600000);assert.equal(f.options.store, f.store);
}finally{await f.close();}});

test('mixed bot and colleague mentions cannot bypass recipient eligibility',async()=>{const f=await fixture();try{
 f.identities.delete(b);const e=f.message('@葉小蝸 @甲 @乙 任務 整理清單',[bot,a,b]);assert.equal((await f.capture(e)).length,1);await f.drain();assert.equal(f.selfSubmissions.length,0);assert.equal(f.submissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
}finally{await f.close();}});


test('a historical self-task draft mentioning colleagues cannot create work after deployment',async()=>{const f=await fixture();try{
 const e=f.message('@葉小蝸 @甲 @乙 任務 整理清單',[bot,a,b]);await f.historical(e,{quickKind:'selftask',mode:'selftask',phase:'selfissue'});await f.drain();assert.equal(f.selfSubmissions.length,0);assert.equal((await f.rows())[0].phase,'ignored');
}finally{await f.close();}});

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
async function fixture(){
 const db=new PGlite();await db.exec(await fs.readFile(new URL('../core/central-archive/schema.sql',import.meta.url),'utf8'));
 let clock=Date.parse('2026-10-13T04:00:00Z');const now=()=>clock;
 const query=(...args)=>db.query(...args),pool={query,connect:async()=>({query,release(){}})},env={LINE_CHANNEL_SECRET:'synthetic',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot};
 const archive=createArchiveStore(pool,bot),store=createGroupStore({env,pool,now});
 const tenant={key:'fixture',tenantId:'fixture-id'},identities=new Map([[owner,{account:'owner',bindingId:'owner-binding'}],[a,{account:'a',bindingId:'a-binding'}],[b,{account:'b',bindingId:'b-binding'}]]);
 const names=new Map([[owner,'發起人'],[a,'同仁甲'],[b,'同仁乙']]),pushes=[],submissions=[],attempts=[],writes=new Map(),disconnected=new Set();let uncertain=false,failSummary=false;
 const line={lineGet:async path=>{const id=path.split('/').at(-1);if(!names.has(id))throw Error('not_member');return {userId:id,displayName:names.get(id)};}};
 const llm={available:true,completeJson:async input=>{const data=JSON.parse(input.userContent);if(input.schema.properties.kind)return {kind:data.text.includes('會議')?'meeting':data.text.includes('整理清單')?'task':'none'};
   return {events:[{topic:'專案會議',date:'2026-10-14',time:data.text.includes('時間未定')?'':'15:00',location:'漫漫回嘉附近的咖啡廳',content:'討論進度',...(data.existing||{}),...(data.existing?{time:'16:00',needsClarification:[]}:{} )}]};}};
 const tasks={groupServices:async()=>[tenant],resolveGroupIdentity:async id=>identities.get(id)||null,submitGroupTask:async(t,e,p)=>{submissions.push({t,e,p});return {ok:true};}};
 const calendar={writeGroupEvent:async(t,account,event)=>{attempts.push({t,account,event});if(disconnected.has(account))throw Object.assign(Error('connect'),{code:'GOOGLE_NOT_CONNECTED'});
   if(!writes.has(event.requestId))writes.set(event.requestId,{id:'saved-'+writes.size});if(uncertain){uncertain=false;throw Object.assign(Error('timeout'),{code:'NETWORK_UNCERTAIN'});}return writes.get(event.requestId);}};
 const platform={llmForTenant:()=>llm,pushLineMessage:async(to,message,_,options)=>{if(failSummary&&typeof message==='string'&&message.startsWith('活動：')){failSummary=false;throw Error('delivery');}pushes.push({to,message,options});}};
 const options={env,store,now,line,tasks,calendar,platform,llm,logger:{warn(){}}};let service=createLeafGroups(options);
 const message=(text='@甲 @乙 明天15:00會議',mentions=[a,b,a],sender=owner,g=group)=>({type:'message',webhookEventId:'event-'+(++serial),timestamp:clock,source:{type:'group',groupId:g,userId:sender},message:{id:'message-'+serial,type:'text',text,mention:{mentionees:mentions.map(userId=>({type:'user',userId}))}}});
 const button=(id,revision=1,sender=owner,g=group,action='confirm')=>({type:'postback',webhookEventId:'button-'+(++serial),timestamp:clock,source:{type:'group',groupId:g,userId:sender},postback:{data:`groupcal:${action}:${id}:${revision}`}});
 const capture=async e=>{await archive.capture([e]);return service.capture([e]);};
 const rows=async()=> (await db.query("SELECT payload->'groupDispatch' AS p FROM central_archive.jobs WHERE payload ? 'groupDispatch' ORDER BY event_at,key")).rows.map(r=>r.p);
 return {db,store,archive,options,identities,names,pushes,submissions,attempts,writes,disconnected,message,button,capture,rows,drain:()=>service.drain(),advance:()=>clock+=61000,restart:()=>service=createLeafGroups(options),uncertain:()=>uncertain=true,failSummary:()=>failSummary=true,close:()=>db.close()};
}
test('meeting requires original organizer confirmation; fanout deduplicates native mentions and replay',async()=>{const f=await fixture();try{
 const e=f.message();await f.capture(e);await f.drain();assert.equal(f.writes.size,0);let p=(await f.rows())[0];assert.equal(p.phase,'confirmation');
 const card=f.pushes.find(x=>x.message.type==='flex').message;assert.equal(card.contents.footer.contents.length,2);assert.match(JSON.stringify(card),/groupcal:confirm/);
 await f.capture(f.button(p.id,1,a));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.button(p.id,1,owner,C(5)));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,3);assert.equal(f.submissions.length,0);
 assert.deepEqual(f.attempts.map(x=>x.account),['owner','a','b']);assert.ok(f.attempts.every(x=>x.event.location==='漫漫回嘉附近的咖啡廳'));
 await f.capture(e);await f.capture(f.button(p.id));f.restart();await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.length,3);
}finally{await f.close();}});
test('unresolved task identity is retained, resumes after login with original evidence and requester',async()=>{const f=await fixture();try{
 f.identities.delete(a);const e=f.message('@甲 明天請整理清單',[a]);await f.capture(e);await f.drain();assert.equal(f.submissions.length,0);assert.match(JSON.stringify(f.pushes),/已保留/);
 f.identities.set(a,{account:'a',bindingId:'a-binding'});f.advance();f.restart();await f.drain();assert.equal(f.submissions.length,1);
 assert.deepEqual(f.submissions[0].e.message,e.message);assert.equal(f.submissions[0].e.timestamp,e.timestamp);assert.deepEqual(f.submissions[0].p.map(x=>x.account),['owner','a']);
 await f.capture(e);await f.drain();assert.equal(f.submissions.length,1);assert.equal((await f.rows())[0].phase,'done');
}finally{await f.close();}});
test('partial fanout waits for work identity and Google connection and resumes only missing participants',async()=>{const f=await fixture();try{
 f.identities.delete(b);f.disconnected.add('a');await f.capture(f.message());await f.drain();const p=(await f.rows())[0];await f.capture(f.button(p.id));await f.drain();assert.equal(f.writes.size,1);
 f.identities.set(b,{account:'b',bindingId:'b-binding'});f.disconnected.delete('a');f.advance();f.restart();await f.drain();assert.equal(f.writes.size,3);assert.equal(f.attempts.filter(x=>x.account==='owner').length,1);
 assert.ok(f.pushes.some(x=>typeof x.message==='string'&&x.message.includes('待處理')));
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
 assert.equal((await f.rows()).find(x=>x.id===p.id).phase,'done');
}finally{await f.close();}});
test('source removal, cancellation and changed work identity fence future side effects',async()=>{const f=await fixture();try{
 const e=f.message();await f.capture(e);await f.drain();const p=(await f.rows())[0];await f.capture(f.button(p.id));await f.store.removed({source:e.source,unsend:{messageId:e.message.id}});await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.message());await f.drain();let q=(await f.rows()).find(x=>x.phase==='confirmation');await f.capture(f.button(q.id,1,owner,group,'cancel'));await f.drain();assert.equal(f.writes.size,0);
 await f.capture(f.message());await f.drain();q=(await f.rows()).find(x=>x.phase==='confirmation');f.identities.set(owner,{account:'other',bindingId:'other'});await f.capture(f.button(q.id));await f.drain();assert.equal(f.writes.size,0);
}finally{await f.close();}});
test('archive source gate rejects invented inputs and other bot scopes; lease tokens fence stale writers',async()=>{const f=await fixture();try{
 const e=f.message();await assert.rejects(f.options.store.insert(e),/not_archived/);await f.archive.capture([e]);await assert.rejects(f.options.store.insert({...e,message:{...e.message,text:'forged'}}),/not_archived/);
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
  './core/central-archive/index.js':{createCentralArchive:async()=>({capture:events=>f.archive.capture(events),health:()=>({})})},
  './core/line-io/index.js':{createLineIo:async()=>({enabled:false,owns:()=>false,capture:async()=>{},handle:async()=>false}),readLineIoBody:async req=>req.rawBody},
  './core/leaf-calendar/index.js':{createLeafCalendar:async()=>({accepts:()=>false,capture:async()=>{},drain:async()=>{},health:()=>({})})},
  './core/leaf-tasks.js':{createLeafTasks:()=>({capture:async events=>legacy.push(...events),drain:async()=>{},health:()=>({})})},
  './core/leaf-groups.js':{createLeafGroups:()=>live},
  './core/bank-line-reply-intake.js':{createBankLineReplyIntake:()=>({receive:async()=>false,drain:async()=>{}})},
  './core/attachment-retrieval.js':{createAttachmentRetrieval:()=>({handle:async()=>false,deliveryReady:()=>false}),parseAttachmentRequest:()=>null},
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

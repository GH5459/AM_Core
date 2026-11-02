import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeafTasks,mentionCandidate,taskAdminKey} from '../core/leaf-tasks.js';
const sender='U'+'1'.repeat(32),recipient='U'+'2'.repeat(32),group='C'+'3'.repeat(32),secret='synthetic-secret',tenant={key:'fixture',tenantId:'synthetic-tenant',runtimeEnabled:true};
function event(text='@同仁 請整理本週客訴清單'){return {type:'message',webhookEventId:'fixture-event',timestamp:Date.now(),source:{type:'group',groupId:group,userId:sender},message:{type:'text',id:'fixture-message',text,mention:{mentionees:[{type:'user',userId:recipient,index:0,length:3}]}}};}
async function fixture({failFirstTenant=false,businessResolution='active',missingRecipient=false,duplicateService=false}={}){let config=null,job=null,judgments=0,issues=0,notices=0,failNotice=false,revoked=false;const paths=[];
 const options={env:{LINE_CHANNEL_SECRET:secret},tenants:failFirstTenant?[{key:'unavailable',runtimeEnabled:true},tenant]:[tenant],store:{service:async t=>{if(t.key==='unavailable')throw Object.assign(Error('synthetic unavailable'),{code:'42501'});return config;},provisionTasks:async()=>{},configureTask:async(t,v)=>config={encrypted_key:{iv:'preserved-calendar',taskService:{baseUrl:v.baseUrl,encryptedKey:v.encryptedKey}}}},router:{resolveGroupBinding:async()=>({tenant,binding:{status:'影子記錄'},resolution:'active'})},line:{lineGet:async p=>({userId:p.split('/').at(-1)})},resolveIdentity:async(u,t)=>revoked?null:({tenantKey:t,account:u===sender?'sender':'recipient',bindingId:'bound-'+u}),platform:{pushLineMessage:async()=>{if(failNotice){failNotice=false;throw Error('synthetic timeout');}notices++;}},llm:{completeJson:async opts=>{judgments++;return JSON.parse(opts.userContent).text.includes('早安')?{assignments:[]}:{assignments:[{title:'整理客訴清單',description:'整理本週客訴清單',recipientIndices:[0]}]};}},logger:{warn(){}},fetchImpl:async(url,init)=>{const path=new URL(url).pathname.split('/').at(-1),input=init.body?JSON.parse(init.body):{};paths.push(path);let output={ok:true};
 if(path==='meeting-person')output={ok:true,person:{name:'合成同仁'}};
 if(path==='health')output={ok:true,contract:'line-mention-dailylog-immediate-v1',directTaskContract:'line-group-bot-direct-v2',tenant:'fixture'};
 if(path==='intake'){if(!job)job={id:input.id,state:'queued',input,result:null,leaseToken:'synthetic-lease'};else assert.equal(input.id,job.id);}
 if(path==='next')output.job=job&&job.state!=='done'&&job.state!=='suppressed'?structuredClone(job):null;
 if(path==='judgment'){job.result={assignments:input.assignments};job.state=input.assignments.length?'judged':'suppressed';}
 if(path==='issue'){issues++;job.state='issued';job.result={taskIds:['work-synthetic'],notice:'已交辦，請補交辦資料。'};}
 if(path==='notified')job.state='done';
 if(path==='suppress')job.state='suppressed';
 if(path==='defer')job.state=job.state;
 if(path==='source')job.state=job.state==='issued'?'issued':'suppressed';
 return Response.json(output);}};
 options.router.resolveGroupBinding=async()=>businessResolution==='active'?{tenant,binding:{status:'影子記錄'},resolution:'active'}:{resolution:businessResolution};
 const priorIdentity=options.resolveIdentity;options.resolveIdentity=async(u,t,opts)=>missingRecipient&&u===recipient?null:priorIdentity(u,t,opts);
 if(duplicateService)options.tenants.push({...tenant,key:'duplicate'});
 let service=createLeafTasks(options);await service.configureService({tenantKey:'fixture',baseUrl:'https://dailylog.example/',apiKey:'synthetic-service-key-with-at-least-32-bytes'});
 const queueLegacy=async(e=event())=>{const people=await Promise.all([e.source.userId,...e.message.mention.mentionees.filter(m=>!m.isSelf).map(m=>m.userId)].map(id=>service.resolveGroupIdentity(id,tenant,e.source.groupId)));if(people.some(x=>!x))return;try{await service.submitGroupTask(tenant,e,people);}catch(error){if(error.code==='ACCESS_DISABLED')return;throw error;}};
 return {service,queueLegacy,paths,options,counts:()=>({judgments,issues,notices}),restart:()=>createLeafTasks(options),failNotice:()=>{failNotice=true;},revoke:()=>{revoked=true;}};}
test('policy fallback never creates a task for group mentions',async()=>{const f=await fixture();for(const text of ['@同仁 請整理','@同仁 任務 整理'])await f.service.capture([event(text)]);await f.service.drain();assert(!f.paths.includes('intake'));assert.equal(f.counts().issues,0);});
test('true colleague mention is required; private, bot, @all, typed @ are excluded',()=>{assert(mentionCandidate(event()));assert(!mentionCandidate({...event(),source:{type:'user',userId:sender}}));for(const mentions of [[],[{type:'all'}],[{type:'user',isSelf:true,userId:recipient}],[{type:'user'}]])assert(!mentionCandidate({...event(),message:{...event().message,mention:{mentionees:mentions}}}));});
test('historical queue: purpose-specific setup, encrypted config, persisted intake, judgment and immediate issue',async()=>{const f=await fixture();assert(f.service.adminAuthorized(taskAdminKey(secret)));assert(!f.service.adminAuthorized('wrong'));await f.queueLegacy();await f.service.drain();assert.deepEqual(f.counts(),{judgments:1,issues:1,notices:1});assert(f.paths.indexOf('intake')<f.paths.indexOf('judgment'));assert(f.paths.indexOf('judgment')<f.paths.indexOf('issue'));assert.deepEqual(f.service.health().configuredTenants,['fixture']);});
test('historical queue: same-event replay does not issue again; general greeting is suppressed',async()=>{const f=await fixture(),e=event();await f.queueLegacy(e);await f.service.drain();await f.queueLegacy(e);await f.service.drain();assert.deepEqual(f.counts(),{judgments:1,issues:1,notices:1});const greeting=await fixture();await greeting.queueLegacy(event('@同仁 早安'));await greeting.service.drain();assert.deepEqual(greeting.counts(),{judgments:1,issues:0,notices:0});});
test('historical queue: notice retry after restart never reclassifies or reissues the task',async()=>{const f=await fixture();f.failNotice();await f.queueLegacy();await f.service.drain();await f.restart().drain();assert.equal(f.counts().judgments,1);assert.equal(f.counts().issues,1);assert.equal(f.counts().notices,1);});
test('historical queue: revoke before intake and unsend after capture do not issue work',async()=>{const f=await fixture();f.revoke();await f.queueLegacy();assert(!f.paths.includes('intake'));const g=await fixture();await g.queueLegacy();await g.service.capture([{type:'unsend',source:event().source,unsend:{messageId:'fixture-message'}}]);await g.service.drain();assert.equal(g.counts().issues,0);});
test('historical queue: unavailable non-enrolled tenant cannot stop an enrolled tenant drain',async()=>{const f=await fixture({failFirstTenant:true});assert.deepEqual(f.service.health().configuredTenants,['fixture']);await f.queueLegacy();await f.service.drain();assert.deepEqual(f.counts(),{judgments:1,issues:1,notices:1});});
test('source diagnostics expose gate results without task writes or private IDs/content',async()=>{
 const f=await fixture(),e=event(),before=f.paths.length;
 const result=await f.service.inspectSource({key:'in:synthetic',event:e});
 assert.equal(result.candidate,true);assert.equal(result.configured,true);assert.equal(result.senderResolved,true);assert.deepEqual(result.recipientResolved,[true]);
 assert(f.paths.slice(before).every(p=>p==='meeting-person'));assert.deepEqual(f.counts(),{judgments:0,issues:0,notices:0});
 for(const privateValue of [sender,recipient,group,e.message.text])assert(!JSON.stringify(result).includes(privateValue));
 f.revoke();assert.equal((await f.service.inspectSource({key:'in:synthetic',event:e})).senderResolved,false);
});
for(const businessResolution of ['not_found','inactive','ambiguous','lookup_failed'])test('historical queued work retains service in any OA group: '+businessResolution,async()=>{
 const f=await fixture({businessResolution});await f.queueLegacy();await f.service.drain();assert.deepEqual(f.counts(),{judgments:1,issues:1,notices:1});
});
test('unbound recipient and ambiguous task-service identities cannot issue work',async()=>{
 for(const option of [{missingRecipient:true},{duplicateService:true}]){const f=await fixture(option);await f.service.capture([event()]);assert(!f.paths.includes('intake'));}
});
test('file requests without the task keyword never reenter legacy work capture',async()=>{
 const f=await fixture({businessResolution:'not_found'});await f.service.capture([event('@同仁 請幫我找回「example.pdf」')]);
 // A recognized assistant operation with a confirmed self mention is outside work intake.
 const count=f.paths.filter(p=>p==='intake').length;assert.equal(count,0);
 const e=event('葉小蝸 請幫我找回「example.pdf」');await f.service.capture([e]);assert.equal(f.paths.filter(p=>p==='intake').length,count);
});
test('group readiness reads native actors and live membership without changing identities or creating work',async()=>{
 const f=await fixture({businessResolution:'not_found'}),before=f.paths.length;
 const result=await f.service.inspectGroup({groupId:group},[sender,recipient]);
 assert.equal(result.observedCurrentMembers,2);assert.equal(result.confirmedCommonTaskService,true);assert.equal(result.groupScope,'all-oa-groups');
 assert.equal(result.members.length,2);assert(result.members.every(m=>m.confirmedTaskIdentity&&!m.ambiguousTaskIdentity));
 assert(f.paths.slice(before).every(p=>p==='meeting-person'));for(const id of [group,sender,recipient])assert(!JSON.stringify(result).includes(id));
 await assert.rejects(f.service.inspectGroup({groupId:'bad'},[]),/invalid_group_probe/);
});

test('group helper freezes same legacy intake identity and preserves source requester and mentions',async()=>{const f=await fixture();const e=event();assert.deepEqual((await f.service.groupServices()).map(t=>t.key),['fixture']);const ids=[sender,recipient];const people=await Promise.all(ids.map(id=>f.service.resolveGroupIdentity(id,tenant,group)));await f.service.submitGroupTask(tenant,e,people);await f.service.capture([e]);await f.service.drain();assert.equal(f.counts().issues,1);assert.equal(f.paths.filter(p=>p==='intake').length,1);});
test('combined group extraction uses original mention indices and does not call AI again; malformed indices cannot enter intake',async()=>{
 const f=await fixture(),e=event(),people=await Promise.all([sender,recipient].map(id=>f.service.resolveGroupIdentity(id,tenant,group))),judgment={policy:'line-task-fast-notice-v1',assignments:[{title:'整理清單',description:'整理本週客訴清單',recipientIndices:[0]}]};
 await assert.rejects(f.service.submitGroupTask(tenant,e,people,{...judgment,assignments:[{...judgment.assignments[0],recipientIndices:[1]}]}),/invalid_task_judgment/);
 assert(!f.paths.includes('intake'));await f.service.submitGroupTask(tenant,e,people,judgment);await f.service.drain();assert.deepEqual(f.counts(),{judgments:0,issues:1,notices:1});
});

 test('own-task transport uses dedicated service path with original actor and evidence, no invented mention',async()=>{
  const f=await fixture(),e=event('@葉小蝸 幫我建立任務：整理清單');e.message.mention.mentionees=[{type:'user',isSelf:true,userId:'U'+'0'.repeat(32)}];f.options.env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID='U'+'0'.repeat(32);const base=f.options.fetchImpl;
  f.options.fetchImpl=async(url,init)=>{if(new URL(url).pathname.endsWith('/self-create')){const v=JSON.parse(init.body);assert.equal(v.actor.userId,sender);assert.equal(v.actor.account,'sender');assert.deepEqual(v.source.text,e.message.text);assert.equal(v.mentions,undefined);assert.equal(v.draft.dueAt,null);return Response.json({ok:true,taskIds:['work-fixture']});}return base(url,init);};
  const service=f.restart(),prior={userId:sender,account:'sender',bindingId:'bound-'+sender},draft={title:'整理清單',description:'本週清單',acceptance:'',dueDate:null,dueAt:null},confirmation={userId:sender,eventId:'confirm',timestamp:Date.now()};
  const r=await service.submitSelfTask(tenant,e,prior,draft,confirmation,1);assert.equal(r.taskIds[0],'work-fixture');assert.match(JSON.stringify(r.message),/已建立自己的任務/);assert.equal(f.counts().issues,0);
  await assert.rejects(()=>service.submitSelfTask(tenant,e,prior,draft,{...confirmation,userId:recipient},1));f.revoke();await assert.rejects(()=>service.submitSelfTask(tenant,e,prior,draft,confirmation,1));
 });

test('quoted progress uses the verified sender and original group, and rejects a revoked identity',async()=>{
 const f=await fixture(),base=f.options.fetchImpl,seen=[];f.options.env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID='U'+'0'.repeat(32);
 f.options.fetchImpl=async(url,init)=>{if(new URL(url).pathname.endsWith('/quoted-progress')){seen.push(JSON.parse(init.body));return Response.json({ok:true,recorded:true});}return base(url,init);};
 const service=f.restart(),e=event('回覆原文');e.message.id='12345678901234568';e.message.quotedMessageId='12345678901234567';e.source.userId=recipient;
 await service.recordQuotedProgress(tenant,e);assert.equal(seen.length,1);assert.equal(seen[0].actor.userId,recipient);assert.equal(seen[0].actor.account,'recipient');assert.equal(seen[0].source.groupId,group);assert.equal(seen[0].source.quotedMessageId,e.message.quotedMessageId);assert.equal(seen[0].source.text,e.message.text);
 f.revoke();await assert.rejects(()=>service.recordQuotedProgress(tenant,e));assert.equal(seen.length,1);
});

test('direct group task and reply use current verified group identities and exact service contracts',async()=>{
 const f=await fixture(),e=event('@同仁 任務 明天盤點'),base=f.options.fetchImpl,seen=[];f.options.env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID='U'+'0'.repeat(32);
 f.options.fetchImpl=async(url,init)=>{const path=new URL(url).pathname.split('/').at(-1);if(path==='self-create'||path==='direct-update'){const value=JSON.parse(init.body);seen.push({path,value});return Response.json({ok:true,contract:value.contract,taskIds:['work-12345678-1234-1234-1234-123456789abc'],taskId:'work-12345678-1234-1234-1234-123456789abc'});}return base(url,init);};
 const service=f.restart(),people=await Promise.all([sender,recipient].map(id=>service.resolveGroupIdentity(id,tenant,group))),draft={title:'盤點',description:'盤點用品',acceptance:'',executionDate:'2026-10-30',dueDate:'2026-11-01',dueAt:'2026-11-01T23:59:00+08:00'};
 await service.submitDirectGroupTask(tenant,e,people,draft,1);assert.equal(seen[0].value.contract,'line-group-bot-direct-assignment-v2');assert.equal(seen[0].value.recipients[0].userId,recipient);assert.equal(seen[0].value.actor.userId,sender);
 await service.updateDirectTask(tenant,e,'work-12345678-1234-1234-1234-123456789abc',{action:'cancel'},1);assert.equal(seen[1].path,'direct-update');assert.equal(seen[1].value.expectedVersion,1);assert.match(seen[1].value.operationId,/^op-/);f.revoke();await assert.rejects(()=>service.updateDirectTask(tenant,e,'work-12345678-1234-1234-1234-123456789abc',{action:'cancel'},1));
});
test('direct task is not sent while the DailyLog service is still on the older contract',async()=>{
 const f=await fixture(),e=event(),base=f.options.fetchImpl;f.options.env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID='U'+'0'.repeat(32);
 f.options.fetchImpl=async(url,init)=>new URL(url).pathname.endsWith('/health')?Response.json({ok:true,contract:'line-mention-dailylog-immediate-v1',tenant:'fixture'}):base(url,init);
 const service=f.restart(),people=await Promise.all([sender,recipient].map(id=>service.resolveGroupIdentity(id,tenant,group)));
 await assert.rejects(()=>service.submitDirectGroupTask(tenant,e,people,{title:'盤點'},1),/direct_task_service_unavailable/);assert(!f.paths.includes('self-create'));
});
test('mixed bot and colleague task commands include the sender only when explicitly mentioned through the bot',async()=>{
 const f=await fixture(),base=f.options.fetchImpl,seen=[];const bot='U'+'0'.repeat(32);f.options.env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID=bot;
 f.options.fetchImpl=async(url,init)=>{if(new URL(url).pathname.endsWith('/self-create')){const v=JSON.parse(init.body);seen.push(v);return Response.json({ok:true,contract:v.contract,taskIds:['work-12345678-1234-1234-1234-123456789abc']});}return base(url,init);};
 const service=f.restart(),e=event('@小葉 @甲 任務 整理清單');e.message.mention.mentionees=[{type:'user',userId:bot,isSelf:true,index:0,length:3},{type:'user',userId:recipient,index:4,length:2}];
 const people=await Promise.all([sender,recipient].map(id=>service.resolveGroupIdentity(id,tenant,group)));await service.submitDirectGroupTask(tenant,e,people,{title:'整理清單'},1);assert.deepEqual(seen[0].recipients.map(p=>p.userId),[sender,recipient]);
});

test('current disabled recipient is rejected by task identity checks; an unavailable roster remains an error',async()=>{
 const f=await fixture(),base=f.options.fetchImpl;let disabled=true,outage=false;
 f.options.fetchImpl=async(url,init)=>{if(new URL(url).pathname.endsWith('/meeting-person')){const a=JSON.parse(init.body).account;if(outage)return Response.json({ok:false,code:'SERVICE_UNAVAILABLE'},{status:503});return Response.json({ok:true,person:disabled&&a==='recipient'?null:{name:'合成'}});}return base(url,init);};
 const service=f.restart(),people=[{userId:sender,account:'sender',bindingId:'bound-'+sender},{userId:recipient,account:'recipient',bindingId:'bound-'+recipient}];
 await assert.rejects(service.submitGroupTask(tenant,event(),people),e=>e.code==='TASK_INELIGIBLE');assert(!f.paths.includes('intake'));outage=true;await assert.rejects(service.submitGroupTask(tenant,event(),people));assert(!f.paths.includes('intake'));outage=false;disabled=false;await service.submitGroupTask(tenant,event(),people);await service.drain();assert.equal(f.counts().issues,1);
});

test('historical queue: eligibility lost after queue receipt is terminal and never turns into a deferred login task',async()=>{
 const f=await fixture();await f.queueLegacy();f.revoke();await f.service.drain();assert(f.paths.includes('suppress'));assert(!f.paths.includes('issue'));assert(!f.paths.includes('defer'));assert.equal(f.counts().notices,0);await f.restart().drain();assert.equal(f.counts().issues,0);
});

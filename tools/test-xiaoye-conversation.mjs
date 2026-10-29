import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {waitingCases,canAutoResume,intake,digest,xiaoyeFetch,notificationCurrent} from '../core/xiaoye-secretary-dailylog.mjs';
import {XiaoyeEvents} from '../core/xiaoye-secretary-events.mjs';
import {resultRequest} from '../core/xiaoye-result-actions.mjs';

const BOT='U'+'b'.repeat(32),PERSON='U'+'a'.repeat(32),OTHER='U'+'c'.repeat(32),ACCOUNT='reporter';
const caseId=n=>'work-'+String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const source=(userId=PERSON,eventId='event-1')=>({type:'user',userId,conversationId:userId,botUserId:BOT,eventId,timestamp:Date.now()});
test('a failed-deploy notice survives only the exact same-case automatic transition',()=>{
 const id='a'.repeat(64),n={kind:'deploy-reconciliation',account:ACCOUNT,expectedUserId:PERSON,sourceVersion:4,proposalHash:'old',context:{eventId:id,botUserId:BOT}},t={secretary:{stage:'blocked',sourceVersion:4,proposal:{hash:'old'},reporters:[{account:ACCOUNT,source:source()}],recovery:{capability:{eventId:id,outcome:'reconciled-failed'}}}};
 assert.equal(notificationCurrent(n,t),true);
 t.secretary.stage='clarifying';t.secretary.sourceVersion=5;t.secretary.proposal=null;t.secretary.deploymentReview={state:'pending',originalEventId:id,originalSourceVersion:4};assert.equal(notificationCurrent(n,t),true);
 t.secretary.deploymentReview.state='reviewed';assert.equal(notificationCurrent(n,t),true);
 for(const stage of ['awaiting_approval','approved','executing']){const x=structuredClone(t);x.secretary.stage=stage;x.secretary.proposal={hash:'new'};assert.equal(notificationCurrent(n,x),true);}
 for(const alteration of [x=>{x.secretary.sourceWithdrawn=true},x=>{x.secretary.stage='paused'},x=>{x.secretary.stage='awaiting_confirmation'},x=>{x.secretary.stage='closed'},x=>{x.secretary.sourceVersion++},x=>{x.secretary.deploymentReview.originalEventId='b'.repeat(64)},x=>{x.secretary.deploymentReview.state='resolved'},x=>{x.secretary.reporters[0].source.userId=OTHER},x=>{x.secretary.reporters[0].source.botUserId=OTHER},x=>{x.deletedAt='now'},x=>{x.status='cancelled'}]){const x=structuredClone(t);alteration(x);assert.equal(notificationCurrent(n,x),false);}
});
test('exception progress survives same-event recovery without sending a stale or misdirected notice',()=>{
 const id='a'.repeat(64),n={id:'event-blocked:'+id+':reporter:'+ACCOUNT,kind:'progress',account:ACCOUNT,expectedUserId:PERSON,sourceVersion:4,proposalHash:'old',context:{eventId:id,botUserId:BOT}},t={secretary:{stage:'blocked',sourceVersion:4,proposal:{hash:'old'},reporters:[{account:ACCOUNT,source:source()}]}};
 assert.equal(notificationCurrent(n,t),true);t.secretary.stage='clarifying';t.secretary.sourceVersion=5;t.secretary.proposal=null;t.secretary.autoRecovery={eventId:id};assert.equal(notificationCurrent(n,t),true);
 for(const stage of ['approved','executing']){const v=structuredClone(t);v.secretary.stage=stage;assert.equal(notificationCurrent(n,v),true);}
 for(const alter of [x=>{x.secretary.stage='paused'},x=>{x.secretary.stage='awaiting_confirmation'},x=>{x.secretary.sourceVersion++},x=>{x.secretary.autoRecovery.eventId='b'.repeat(64)},x=>{x.secretary.sourceWithdrawn=true},x=>{x.secretary.reporters[0].source.userId=OTHER},x=>{x.secretary.reporters[0].source.botUserId=OTHER}]){const x=structuredClone(t);alter(x);assert.equal(notificationCurrent(n,x),false);}
 const old={...n,kind:'progress'};delete old.context;assert.equal(notificationCurrent(old,t,{oaBotUserId:BOT}),true);assert.equal(notificationCurrent(old,t,{}),false);
});
test('group reporter progress targets the original person and bot across the same automatic recovery',()=>{
 const id='d'.repeat(64),group='C'+'d'.repeat(32),n={id:'event-blocked:'+id+':reporter:'+ACCOUNT,kind:'progress',account:ACCOUNT,expectedUserId:PERSON,sourceVersion:4,proposalHash:'old',context:{eventId:id,botUserId:BOT}},t={secretary:{stage:'blocked',sourceVersion:4,proposal:{hash:'old'},reporters:[{account:ACCOUNT,source:{type:'group',conversationId:group,userId:PERSON,botUserId:BOT}}]}};
 assert.equal(notificationCurrent(n,t),true);t.secretary.stage='clarifying';t.secretary.sourceVersion=5;t.secretary.proposal=null;t.secretary.autoRecovery={eventId:id};assert.equal(notificationCurrent(n,t),true);
 for(const alter of [x=>{x.secretary.reporters[0].source.userId=OTHER},x=>{x.secretary.reporters[0].source.botUserId=OTHER},x=>{x.secretary.reporters[0].account='other'},x=>{x.secretary.stage='paused'},x=>{x.secretary.autoRecovery.eventId='e'.repeat(64)}]){const v=structuredClone(t);alter(v);assert.equal(notificationCurrent(n,v),false);}
});

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE work_items(id TEXT PRIMARY KEY,level INTEGER,parent_id TEXT,department TEXT,department_id TEXT,value TEXT,revision INTEGER); CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT,revision INTEGER,PRIMARY KEY(namespace,key)); CREATE TABLE xiaoye_operations(id TEXT PRIMARY KEY,guard INTEGER CHECK(guard=1),fingerprint TEXT,task_id TEXT); CREATE TABLE xiaoye_draft_operations(id TEXT PRIMARY KEY,guard INTEGER CHECK(guard=1)); CREATE TABLE work_notion_jobs(id TEXT PRIMARY KEY,version INTEGER); CREATE TABLE xiaoye_event_outbox(id TEXT PRIMARY KEY,task_id TEXT,version INTEGER,kind TEXT,created_at INTEGER); CREATE TABLE task_attachments(id TEXT PRIMARY KEY,scope TEXT,target_id TEXT,name TEXT,mime TEXT,size INTEGER,digest TEXT,actor TEXT,actor_name TEXT,created_at TEXT); CREATE TABLE task_attachment_chunks(attachment_id TEXT,part INTEGER,content BLOB);');
 const DB={prepare(query){const statement=sql.prepare(query);return {bind(...raw){const values=raw.map(value=>value instanceof ArrayBuffer?new Uint8Array(value):value);return {all:async()=>({results:statement.all(...values)}),first:async()=>statement.get(...values)||null,run:async()=>statement.run(...values)}}}},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={DB,PUBLIC_ORIGIN:'https://example.invalid',LEAF_TASK_SERVICE_KEY:'test',LEAF_TASK_TENANT:'test'};
 const c={oaBotUserId:BOT,ownerAccount:'owner',account:{id:'service:xiaoye',name:'葉小蝸'},autoResolutionEnabled:true,autoResolutionEpoch:'1'.repeat(16),projects:[],contract:'xiaoye-secretary-pilot-v1',enabled:true};
 const base={async fetch(request){if(request.url.endsWith('/identity'))return Response.json({identity:{account:ACCOUNT,identityId:'identity-1'}});if(request.url.endsWith('/meeting-person'))return Response.json({person:{name:'同仁',team:''}});throw Error('unexpected request');}};
 sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('line-work-identities','account:'+BOT+':'+ACCOUNT,JSON.stringify({lineUserId:PERSON,identityId:'identity-1'}));
 function addCase(n,{userId=PERSON,account=ACCOUNT,waiting=true,stage='clarifying',version=3,sourceVersion=2,recovery=null}={}){const id=caseId(n),task={id,version,title:'問題 '+n,description:'開啟很慢',history:[],status:'pending',primaryParentId:null,secretary:{stage,waitingForReporter:waiting,sourceVersion,reporters:[{account,source:source(userId)}],sources:[{text:'開啟很慢'}],proposal:null,approval:null,recovery,lease:null,leaseUntil:0}};sql.prepare('INSERT INTO work_items(id,level,value,revision) VALUES(?,1,?,?)').run(id,JSON.stringify(task),version);return id;}
 return {sql,env,c,base,addCase};
}

test('a plain LINE reply continues the only waiting case and preserves its history',async()=>{
 const f=fixture(),id=f.addCase(1),v={sender:{account:ACCOUNT,userId:PERSON,botUserId:BOT},source:source(PERSON,'reply-1'),text:'手機 LINE 先空白 20 秒，再看到清單'};
 assert.equal((await waitingCases(f.env,v.source,ACCOUNT)).length,1);
 const result=await intake(f.env,f.c,f.base,v);
 assert.equal(result.taskId,id);assert.equal(result.supplemented,true);
 const task=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(id).value);
 assert.equal(task.secretary.waitingForReporter,false);assert.equal(task.secretary.sourceVersion,3);
 assert.equal(task.secretary.sources.at(-1).text,v.text);assert.match(task.description,/手機 LINE/);
 assert.equal(task.history.at(-1).kind,'xiaoye_intake');
 f.addCase(2);
 const replay=await intake(f.env,f.c,f.base,v);
 assert.equal(replay.duplicate,true);assert.equal(replay.taskId,id);
 assert.equal(f.sql.prepare('SELECT revision FROM work_items WHERE id=?').get(caseId(2)).revision,3);
});

test('conversational entry survives process restart and first message creates one case immediately',async()=>{
 const f=fixture(),sender={account:ACCOUNT,userId:PERSON,botUserId:BOT},begin={sender,source:source(PERSON,'begin-1'),begin:true,conversational:true};
 const begun=await intake(f.env,f.c,f.base,begin);
 assert.equal(begun.awaitingFirstMessage,true);assert.equal(begun.begun,true);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM work_items').get().n,0);
 const key=await digest(JSON.stringify([BOT,'user',PERSON,PERSON]));
 assert.equal(JSON.parse(f.sql.prepare("SELECT value FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=?").get(key).value).mode,'conversation-pending');
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));
 const machine=async (action,payload)=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/'+action,{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({tenantKey:'test',...payload})}),f.env,{});
 const active=await (await machine('active',{botUserId:BOT,type:'user',conversationId:PERSON,userId:PERSON})).json();
 assert.equal(active.active,true);assert.equal(active.conversationalPending,true);
 const sessions=await (await machine('sessions',{})).json();assert.equal(sessions.sessions[0].mode,'conversation-pending');
 const first={sender,source:source(PERSON,'first-1'),text:'工作日誌按下去需要 29 秒'};
 const created=await intake(f.env,f.c,f.base,first);
 assert.equal(created.newIssue,true);assert.ok(created.taskId);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM work_items').get().n,1);
 const duplicate=await intake(f.env,f.c,f.base,first);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.taskId,created.taskId);
 const added=await intake(f.env,f.c,f.base,{sender,source:source(PERSON,'second-1'),text:'是在電腦 LINE 裡'});
 assert.equal(added.supplemented,true);assert.equal(added.taskId,created.taskId);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM work_items').get().n,1);
});

test('pending conversational entry can be cancelled without creating a case',async()=>{
 const f=fixture(),sender={account:ACCOUNT,userId:PERSON,botUserId:BOT};
 await intake(f.env,f.c,f.base,{sender,source:source(PERSON,'begin-cancel'),begin:true,conversational:true});
 const cancelled=await intake(f.env,f.c,f.base,{sender,source:source(PERSON,'cancel-1'),cancel:true});
 assert.equal(cancelled.cancelled,true);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM work_items').get().n,0);
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM documents WHERE namespace='xiaoye-intake-sessions'").get().n,0);
});

test('the first image after conversational entry creates the case',async()=>{
 const f=fixture(),sender={account:ACCOUNT,userId:PERSON,botUserId:BOT};
 await intake(f.env,f.c,f.base,{sender,source:source(PERSON,'begin-image'),begin:true,conversational:true});
 const png=Buffer.from([137,80,78,71,13,10,26,10]);
 const created=await intake(f.env,f.c,f.base,{sender,source:source(PERSON,'first-image'),image:{base64:png.toString('base64')}});
 assert.equal(created.newIssue,true);assert.ok(created.taskId);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM task_attachments WHERE target_id=?').get(created.taskId).n,1);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM work_items').get().n,1);
});

test('an existing image draft is preserved when the conversational entry is pressed',async()=>{
 const f=fixture(),sender={account:ACCOUNT,userId:PERSON,botUserId:BOT},key=await digest(JSON.stringify([BOT,'user',PERSON,PERSON]));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-intake-sessions',key,JSON.stringify({mode:'draft',id:'draft-original',actor:{account:ACCOUNT},source:source(PERSON,'original-draft'),entries:[],until:Date.now()+60000}));
 const result=await intake(f.env,f.c,f.base,{sender,source:source(PERSON,'begin-on-draft'),begin:true,conversational:true});
 assert.equal(result.draft,true);assert.equal(result.resumed,true);
 const saved=JSON.parse(f.sql.prepare("SELECT value FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=?").get(key).value);
 assert.equal(saved.id,'draft-original');assert.equal(saved.mode,'draft');
});

test('two waiting cases require a choice and do not change either case',async()=>{
 const f=fixture(),first=f.addCase(1),second=f.addCase(2),v={sender:{account:ACCOUNT,userId:PERSON,botUserId:BOT},source:source(PERSON,'reply-2'),text:'畫面是空白的'};
 const result=await intake(f.env,f.c,f.base,v);
 assert.equal(result.needsCaseSelection,true);assert.deepEqual(new Set(result.cases.map(x=>x.id)),new Set([first,second]));
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM xiaoye_operations').get().n,0);
 assert.equal(f.sql.prepare('SELECT revision FROM work_items WHERE id=?').get(first).revision,3);
 const changed=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(second).value);changed.secretary.waitingForReporter=false;
 f.sql.prepare('UPDATE work_items SET value=? WHERE id=?').run(JSON.stringify(changed),second);
 const replay=await intake(f.env,f.c,f.base,v);assert.equal(replay.duplicate,true);assert.equal(replay.needsCaseSelection,true);
 assert.equal(f.sql.prepare('SELECT revision FROM work_items WHERE id=?').get(first).revision,3);
});

test('a case selected by the reporter receives the next message even with two open questions',async()=>{
 const f=fixture(),first=f.addCase(1),second=f.addCase(2),key=await digest(JSON.stringify([BOT,'user',PERSON,PERSON]));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-intake-sessions',key,JSON.stringify({mode:'followup',taskId:second,until:Date.now()+60000}));
 const result=await intake(f.env,f.c,f.base,{sender:{account:ACCOUNT,userId:PERSON,botUserId:BOT},source:source(PERSON,'selected-1'),text:'這是第二件問題的補充'});
 assert.equal(result.taskId,second);assert.equal(result.supplemented,true);
 assert.equal(f.sql.prepare('SELECT revision FROM work_items WHERE id=?').get(first).revision,3);
});

test('an explicit followup card switches an old non-draft session to the selected case',async()=>{
 const f=fixture(),first=f.addCase(1),second=f.addCase(2),key=await digest(JSON.stringify([BOT,'user',PERSON,PERSON]));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-intake-sessions',key,JSON.stringify({taskId:first,until:Date.now()+60000}));
 const read=async(db,ns,k)=>{const row=await db.prepare('SELECT value,revision FROM documents WHERE namespace=? AND key=?').bind(ns,k).first();return row?{...row,value:JSON.parse(row.value)}:null;};
 const load=async(db,id)=>{const row=await db.prepare('SELECT value,revision FROM work_items WHERE id=?').bind(id).first();return row?{task:JSON.parse(row.value),revision:row.revision}:null;};
 const docsInsert=(db,ns,k,value)=>db.prepare('INSERT INTO documents(namespace,key,value,revision) VALUES(?,?,?,1) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,revision=documents.revision+1').bind(ns,k,JSON.stringify(value));
 const postback=source(PERSON,'choose-2');postback.eventType='postback';postback.postbackData=`xiaoye:result:followup:${second}:3`;
 const result=await resultRequest(f.env,f.c,f.base,{sender:{account:ACCOUNT,userId:PERSON,botUserId:BOT},source:postback},{linePerson:async()=>({account:ACCOUNT}),record:read,load,digest,docsInsert,fail:message=>new Error(message)});
 assert.equal(result.resume,true);assert.equal(result.taskId,second);
 const stored=JSON.parse(f.sql.prepare("SELECT value FROM documents WHERE namespace='xiaoye-intake-sessions' AND key=?").get(key).value);
 assert.equal(stored.mode,'followup');assert.equal(stored.taskId,second);
});

test('a direct image joins the one waiting case',async()=>{
 const f=fixture(),id=f.addCase(1),png=Buffer.from([137,80,78,71,13,10,26,10]);
 const result=await intake(f.env,f.c,f.base,{sender:{account:ACCOUNT,userId:PERSON,botUserId:BOT},source:source(PERSON,'image-1'),image:{base64:png.toString('base64')}});
 assert.equal(result.taskId,id);assert.equal(result.supplemented,true);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM task_attachments WHERE target_id=?').get(id).n,1);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM task_attachment_chunks').get().n,1);
});

test('another reporter cannot attach a direct reply',async()=>{
 const f=fixture();f.addCase(1);
 assert.deepEqual(await waitingCases(f.env,source(OTHER),ACCOUNT),[]);
});

test('deleted or merged questions cannot receive a direct reply',async()=>{
 const f=fixture(),deleted=f.addCase(1),merged=f.addCase(2);
 for(const [id,field] of [[deleted,'deletedAt'],[merged,'mergedInto']]){
  const task=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(id).value);
  task[field]=field==='deletedAt'?new Date().toISOString():caseId(99);
  f.sql.prepare('UPDATE work_items SET value=? WHERE id=?').run(JSON.stringify(task),id);
 }
 assert.deepEqual(await waitingCases(f.env,source(PERSON),ACCOUNT),[]);
 const result=await intake(f.env,f.c,f.base,{sender:{account:ACCOUNT,userId:PERSON,botUserId:BOT},source:source(PERSON,'deleted-reply'),text:'再補充'});
 assert.equal(result.handled,false);
});

test('automatic resume is restricted to the same terminal event and one attempt per reporter update',()=>{
 const c={autoResolutionEnabled:true,autoResolutionEpoch:'1'.repeat(16)},task={id:caseId(1),version:5,secretary:{stage:'blocked',sourceVersion:2,sources:[{}],recovery:{reason:'tool outage'},lease:null,leaseUntil:0,waitingForReporter:false}},event={id:'a'.repeat(64),taskId:task.id,state:'failed',sourceVersion:2,leaseActive:false};
 assert.equal(canAutoResume(c,task,event,false),true);
 assert.equal(canAutoResume(c,task,{...event,taskId:caseId(2)},false),false);
 assert.equal(canAutoResume(c,task,{...event,leaseActive:true},false),false);
 assert.equal(canAutoResume(c,task,event,true),false);
 task.secretary.autoRecovery={sourceCount:1,attempts:1};assert.equal(canAutoResume(c,task,event,false),false);
 task.secretary.sources.push({});assert.equal(canAutoResume(c,task,event,false),true);
});

test('a blocked completed execution may replan within its own bounded budget',()=>{
 const c={autoResolutionEnabled:true,autoResolutionEpoch:'1'.repeat(16)},id='b'.repeat(64);
 const task={id:caseId(1),secretary:{stage:'blocked',sourceVersion:5,sources:[{}],recovery:{reason:'new scope'},lease:null,leaseUntil:0,executionEvent:{id},autoRecovery:{sourceCount:1,attempts:1}}};
 const e={id,taskId:task.id,state:'done',kind:'execute',sourceVersion:5,leaseActive:false};
 assert.equal(canAutoResume(c,task,e,false),true);
 assert.equal(canAutoResume(c,task,{...e,id:'c'.repeat(64)},false),false);
 assert.equal(canAutoResume(c,task,{...e,kind:'analyze'},false),false);
 task.secretary.stage='paused';assert.equal(canAutoResume(c,task,e,false),false);
 task.secretary.stage='blocked';task.secretary.autoRecovery.replanAttempts=2;assert.equal(canAutoResume(c,task,e,false),true);
 task.secretary.autoRecovery.replanAttempts=3;assert.equal(canAutoResume(c,task,e,false),false);
});

test('exact-commit recovery is bound to the recorded dependency and each event',()=>{
 const c={autoResolutionEnabled:true,autoResolutionEpoch:'1'.repeat(16)},id='b'.repeat(64),capability='render-deploy-commit-v1';
 const task={id:caseId(1),secretary:{stage:'blocked',sourceVersion:5,sources:[{}],recovery:{reason:'publisher unavailable',capability:{name:capability,outcome:'rejected',eventId:id,sourceVersion:5}},lease:null,leaseUntil:0,executionEvent:{id},autoRecovery:{sourceCount:1,attempts:1,replanAttempts:3}}};
 const e={id,taskId:task.id,state:'done',kind:'execute',sourceVersion:5,leaseActive:false};
 assert.equal(canAutoResume(c,task,e,false),false);
 assert.equal(canAutoResume(c,task,e,false,'render-read-v1'),false);
 assert.equal(canAutoResume(c,task,e,false,capability),true);
 assert.equal(canAutoResume(c,task,{...e,id:'c'.repeat(64)},false,capability),false);
 assert.equal(canAutoResume(c,task,e,true,capability),false);
 task.secretary.stage='paused';assert.equal(canAutoResume(c,task,e,false,capability),false);
 task.secretary.stage='blocked';task.secretary.autoRecovery.capabilityEvents=[{name:capability,eventId:id,at:Date.now()}];assert.equal(canAutoResume(c,task,e,false,capability),false);
 const next='d'.repeat(64);task.secretary.executionEvent.id=next;task.secretary.recovery.capability.eventId=next;
 assert.equal(canAutoResume(c,task,{...e,id:next},false,capability),true,'a second independent failure can recover');
 task.secretary.recovery.capability.outcome='unknown';assert.equal(canAutoResume(c,task,{...e,id:next},false,capability),false);assert.equal(canAutoResume(c,task,{...e,id:next},false),false);
 task.secretary.recovery.capability.outcome='rejected';task.secretary.autoRecovery.capabilityEvents.push({name:capability,eventId:'e'.repeat(64),at:Date.now()},{name:capability,eventId:'f'.repeat(64),at:Date.now()});assert.equal(canAutoResume(c,task,{...e,id:next},false,capability),false,'three retries in a day trigger backoff');
 task.secretary.autoRecovery.capabilityEvents.forEach(x=>x.at=Date.now()-86400001);assert.equal(canAutoResume(c,task,{...e,id:next},false,capability),true,'a later genuinely distinct event can recover after backoff');
});

test('a new plan gets its own bounded tool-recovery attempt',()=>{
 const c={autoResolutionEnabled:true,autoResolutionEpoch:'1'.repeat(16)},id='c'.repeat(64);
 const task={id:caseId(1),secretary:{stage:'blocked',sourceVersion:6,sources:[{}],recovery:{reason:'temporary tool outage'},lease:null,leaseUntil:0,autoRecovery:{sourceCount:1,attempts:1,replanAttempts:1}}};
 const e={id,taskId:task.id,state:'failed',kind:'execute',sourceVersion:6,leaseActive:false};
 assert.equal(canAutoResume(c,task,e,false),true);
 task.secretary.autoRecovery.failureAfterReplan=1;assert.equal(canAutoResume(c,task,e,false),false);
 task.secretary.stage='paused';assert.equal(canAutoResume(c,task,e,false),false);
});

test('event inspect returns one event without exposing its lease and marks expired lease inactive',async()=>{
 const id='a'.repeat(64),event={id,taskId:caseId(1),kind:'analyze',state:'failed',version:4,sourceVersion:2,lease:'secret-lease',leaseUntil:Date.now()-1000};
 const ctx={storage:{async get(key){return key==='event:'+id?event:null;}}};const instance=new XiaoyeEvents(ctx,{});
 const read=async key=>instance.route(new Request('https://secretary.internal/inspect',{method:'POST',body:JSON.stringify({id:key})}));
 const response=await read(id),value=await response.json();
 assert.equal(response.status,200);assert.equal(value.event.leasePresent,true);assert.equal(value.event.leaseActive,false);assert.equal(JSON.stringify(value).includes('secret-lease'),false);
 assert.equal((await read('b'.repeat(64))).status,404);
 assert.equal((await read('invalid')).status,400);
});

test('runner inspect rejects wrong tenant, credentials and another case id',async()=>{
 const f=fixture(),taskId=f.addCase(1,{stage:'blocked',waiting:false,version:16,sourceVersion:6,recovery:{reason:'連線故障'}}),eventId='a'.repeat(64),event={id:eventId,taskId,kind:'analyze',state:'failed',version:15,sourceVersion:6,leaseUntil:0};
 f.c.runnerHash=await digest('Bearer runner-key');
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));
 f.env.XIAOYE_EVENTS={idFromName:()=>1,get:()=>({fetch:async request=>request.url.endsWith('/inspect')?Response.json({ok:true,event}):Response.json({ok:true})})};
 const call=async (body,key='Bearer runner-key')=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/runner/event-inspect',{method:'POST',headers:{Authorization:key},body:JSON.stringify(body)}),f.env,{});
 assert.equal((await call({tenantKey:'wrong',id:taskId,eventId})).status,403);
 assert.equal((await call({tenantKey:'test',id:taskId,eventId},'Bearer wrong')).status,401);
 assert.equal((await call({tenantKey:'test',id:caseId(2),eventId})).status,404);
 const response=await call({tenantKey:'test',id:taskId,eventId}),value=await response.json();
 assert.equal(response.status,200);assert.equal(value.task.version,16);assert.equal(value.task.sourceVersion,6);assert.equal(value.autoResumeEligible,true);
 assert.equal(value.resultNotification,null);
});

test('legacy blocked case resumes once into a new analyze event, then idempotent replay',async()=>{
 const f=fixture(),taskId=f.addCase(1,{stage:'blocked',waiting:false,version:16,sourceVersion:6,recovery:{reason:'連線故障'}}),eventId='a'.repeat(64),event={id:eventId,taskId,kind:'analyze',state:'failed',version:15,sourceVersion:6,leaseUntil:0};
 f.c.runnerHash=await digest('Bearer runner-key');
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));
 const calls=[];f.env.XIAOYE_EVENTS={idFromName:()=>1,get:()=>({fetch:async request=>{calls.push(new URL(request.url).pathname);return request.url.endsWith('/inspect')?Response.json({ok:true,event}):Response.json({ok:true});}})};
 const body={tenantKey:'test',id:taskId,version:16,eventId,operationId:'auto-resume:'+eventId};
 const call=async()=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/runner/auto-resume',{method:'POST',headers:{Authorization:'Bearer runner-key'},body:JSON.stringify(body)}),f.env,{});
 const response=await call(),result=await response.json();assert.equal(response.status,200);assert.equal(result.version,17);assert.equal(result.sourceVersion,7);
 const saved=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);
 assert.equal(saved.secretary.stage,'clarifying');assert.equal(saved.secretary.recoveryHistory.length,1);assert.equal(saved.secretary.recoveryHistory[0].automatic,true);
 assert.deepEqual(saved.secretary.autoRecovery,{sourceCount:1,attempts:1,at:saved.secretary.autoRecovery.at,eventId});
 assert.equal(f.sql.prepare('SELECT kind FROM xiaoye_event_outbox').get().kind,'analyze');
 assert.ok(calls.includes('/prepare'));assert.ok(calls.includes('/commit'));
 const replay=await call();assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM xiaoye_event_outbox').get().n,1);
});

test('exact-commit recovery consumes its one capability retry in the guarded transaction',async()=>{
 const f=fixture(),taskId=f.addCase(1,{stage:'blocked',waiting:false,version:16,sourceVersion:6,recovery:{reason:'publisher unavailable'}}),eventId='a'.repeat(64),capability='render-deploy-commit-v1';
 const task=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);
 task.secretary.executionEvent={id:eventId};task.secretary.recovery.capability={name:capability,outcome:'rejected',eventId,sourceVersion:6};task.secretary.autoRecovery={sourceCount:task.secretary.sources.length,attempts:1,replanAttempts:3};
 f.sql.prepare('UPDATE work_items SET value=? WHERE id=?').run(JSON.stringify(task),taskId);
 const event={id:eventId,taskId,kind:'execute',state:'done',version:15,sourceVersion:6,leaseActive:false};
 f.c.runnerHash=await digest('Bearer runner-key');
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));
 f.env.XIAOYE_EVENTS={idFromName:()=>1,get:()=>({fetch:async request=>request.url.endsWith('/inspect')?Response.json({ok:true,event}):Response.json({ok:true})})};
 const body={tenantKey:'test',id:taskId,version:16,eventId,operationId:'capability-resume-event-'+eventId,capability};
 const call=async b=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/runner/auto-resume',{method:'POST',headers:{Authorization:'Bearer runner-key'},body:JSON.stringify(b)}),f.env,{});
 assert.equal((await call({...body,version:15})).status,409);
 const response=await call(body);assert.equal(response.status,200);
 const saved=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);
 assert.equal(saved.secretary.autoRecovery.capabilityEvents[0].name,capability);assert.equal(saved.secretary.autoRecovery.capabilityEvents[0].eventId,eventId);assert.equal(saved.secretary.stage,'clarifying');
 assert.equal((await (await call(body)).json()).replayed,true);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM xiaoye_event_outbox').get().n,1);
});
test('legacy dependency is version-guarded, auditable and idempotent, but is a runner assertion',async()=>{
 const f=fixture(),taskId=f.addCase(1,{stage:'blocked',waiting:false,version:16,sourceVersion:6,recovery:{reason:'old publisher unavailable'}}),eventId='a'.repeat(64),capability='render-deploy-commit-v1';
 const task=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);task.secretary.executionEvent={id:eventId};task.secretary.autoRecovery={sourceCount:task.secretary.sources.length,attempts:1,replanAttempts:3};f.sql.prepare('UPDATE work_items SET value=? WHERE id=?').run(JSON.stringify(task),taskId);
 const event={id:eventId,taskId,kind:'execute',state:'done',version:15,sourceVersion:6,leaseActive:false};f.c.runnerHash=await digest('Bearer runner-key');
 f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));
 f.env.XIAOYE_EVENTS={idFromName:()=>1,get:()=>({fetch:async request=>request.url.endsWith('/inspect')?Response.json({ok:true,event}):Response.json({ok:true})})};
 const body={tenantKey:'test',id:taskId,version:16,eventId,operationId:'legacy-capability-'+eventId,capability,evidence:'legacy-local-preflight-v1'};
 const call=async b=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/runner/record-legacy-capability',{method:'POST',headers:{Authorization:'Bearer runner-key'},body:JSON.stringify(b)}),f.env,{});
 assert.equal((await call({...body,version:15})).status,409);assert.equal((await call(body)).status,200);
 const saved=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);assert.equal(saved.secretary.recovery.capability.evidence,'legacy-local-preflight-v1');assert.equal(saved.secretary.recovery.capability.eventId,eventId);assert.equal(saved.secretary.stage,'blocked');
 assert.equal((await (await call(body)).json()).replayed,true);
});
test('unknown deploy reconciliation requires exact immutable deployment identity and live only permits analysis',async()=>{
 const f=fixture(),taskId=f.addCase(1,{stage:'blocked',waiting:false,version:16,sourceVersion:6,recovery:{reason:'deploy unknown'}}),eventId='a'.repeat(64),d={workspaceId:'tea-abc',serviceId:'srv-abc',deployId:'dep-abc',commitId:'b'.repeat(40)};
 const task=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);task.secretary.executionEvent={id:eventId};task.secretary.autoRecovery={sourceCount:task.secretary.sources.length,replanAttempts:3};task.secretary.recovery.capability={name:'render-deploy-commit-v1',outcome:'unknown',eventId,sourceVersion:6,deployment:d};f.sql.prepare('UPDATE work_items SET value=? WHERE id=?').run(JSON.stringify(task),taskId);
 const event={id:eventId,taskId,kind:'execute',state:'done',version:15,sourceVersion:6,leaseActive:false};f.c.runnerHash=await digest('Bearer runner-key');f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));f.env.XIAOYE_EVENTS={idFromName:()=>1,get:()=>({fetch:async r=>r.url.endsWith('/inspect')?Response.json({ok:true,event}):r.url.endsWith('/check')?Response.json({ok:true,job:{taskId,kind:'analyze',sourceVersion:7}}):Response.json({ok:true})})};
 const call=async(action,b)=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/runner/'+action,{method:'POST',headers:{Authorization:'Bearer runner-key'},body:JSON.stringify({tenantKey:'test',...b})}),f.env,{});
 const body={id:taskId,version:16,eventId,operationId:'deploy-reconcile-'+eventId,status:'live',deployment:d};
 assert.equal((await call('record-deploy-reconciliation',{...body,version:15})).status,409);
 assert.equal((await call('record-deploy-reconciliation',{...body,deployment:{...d,commitId:'c'.repeat(40)}})).status,409);
 assert.equal((await call('record-deploy-reconciliation',body)).status,200);
 const saved=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);assert.equal(saved.secretary.stage,'blocked');assert.equal(saved.secretary.recovery.capability.reconciliation.status,'live');
 assert.equal((await call('auto-resume',{id:taskId,version:17,eventId,operationId:'deploy-live-resume-'+eventId,capability:'render-deploy-reconciled-v1'})).status,200);
 const resumed=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);assert.equal(resumed.secretary.stage,'clarifying');assert.equal(f.sql.prepare('SELECT kind FROM xiaoye_event_outbox').get().kind,'analyze');
});
test('a confirmed failed deploy notifies the original reporter and cannot resume the original deployment',async()=>{
 const f=fixture(),taskId=f.addCase(1,{stage:'blocked',waiting:false,version:16,sourceVersion:6,recovery:{reason:'deploy unknown'}}),eventId='a'.repeat(64),d={workspaceId:'tea-abc',serviceId:'srv-abc',deployId:'dep-abc',commitId:'b'.repeat(40)};
 const task=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);task.secretary.executionEvent={id:eventId};task.secretary.autoRecovery={sourceCount:task.secretary.sources.length,replanAttempts:3};task.secretary.recovery.capability={name:'render-deploy-commit-v1',outcome:'unknown',eventId,sourceVersion:6,deployment:d};f.sql.prepare('UPDATE work_items SET value=? WHERE id=?').run(JSON.stringify(task),taskId);
 const event={id:eventId,taskId,kind:'execute',state:'done',version:15,sourceVersion:6,leaseActive:false};f.c.runnerHash=await digest('Bearer runner-key');f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('xiaoye-secretary','config',JSON.stringify(f.c));f.sql.prepare('INSERT INTO documents VALUES(?,?,?,1)').run('service-accounts','ai-xiaoye',JSON.stringify({id:f.c.account.id,active:true,type:'ai'}));f.env.XIAOYE_EVENTS={idFromName:()=>1,get:()=>({fetch:async r=>r.url.endsWith('/inspect')?Response.json({ok:true,event}):r.url.endsWith('/check')?Response.json({ok:true,job:{taskId,kind:'analyze',sourceVersion:7}}):Response.json({ok:true})})};
 const call=async(action,b)=>xiaoyeFetch(new Request('https://example.invalid/api/integrations/leaf-snail/tasks/secretary/runner/'+action,{method:'POST',headers:{Authorization:'Bearer runner-key'},body:JSON.stringify({tenantKey:'test',...b})}),f.env,{});
 assert.equal((await call('record-deploy-reconciliation',{id:taskId,version:16,eventId,operationId:'deploy-reconcile-'+eventId,status:'build_failed',deployment:d})).status,200);
 const notice=JSON.parse(f.sql.prepare("SELECT value FROM documents WHERE namespace='xiaoye-notifications' AND json_extract(value,'$.kind')='deploy-reconciliation'").get().value);assert.equal(notice.account,ACCOUNT);assert.equal(notice.expectedUserId,PERSON);assert.match(notice.message,/未成功/);
 assert.equal((await call('auto-resume',{id:taskId,version:17,eventId,operationId:'not-retry-'+eventId,capability:'render-deploy-reconciled-v1'})).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM xiaoye_event_outbox').get().n,0);
 const resumed=await call('auto-resume',{id:taskId,version:17,eventId,operationId:'failure-analysis-'+eventId,capability:'render-deploy-failure-analysis-v1'});assert.equal(resumed.status,200);
 const now=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);assert.equal(now.secretary.stage,'clarifying');assert.equal(now.secretary.deploymentReview.state,'pending');assert.equal(now.secretary.deploymentReview.deployment.deployId,d.deployId);
 assert.equal(f.sql.prepare('SELECT kind FROM xiaoye_event_outbox').get().kind,'analyze');
 const currentId='c'.repeat(64),base={id:taskId,version:18,eventId:currentId,eventLease:'lease',operationId:'review-original-deploy',originalEventId:eventId,deployId:d.deployId,effectsStatus:'none',summary:'隔離副作用核對',evidence:['隔離唯讀證據']};
 assert.equal((await call('propose',{...base,operationId:'premature-proposal'})).status,409);
 assert.equal((await call('deploy-effects-check',{...base,deployId:'dep-wrong'})).status,409);
 assert.equal((await call('deploy-effects-check',{...base,effectsStatus:'unknown'})).status,400);
 assert.equal((await call('deploy-effects-check',base)).status,200);assert.equal((await (await call('deploy-effects-check',base)).json()).replayed,true);
 const reviewed=JSON.parse(f.sql.prepare('SELECT value FROM work_items WHERE id=?').get(taskId).value);assert.equal(reviewed.secretary.deploymentReview.state,'reviewed');
});

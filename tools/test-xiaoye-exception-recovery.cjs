const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {exceptionDispatchSettled,CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
const {failedEventCandidates}=require('./xiaoye-failed-event-scan.cjs');
const id='a'.repeat(64),taskId='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',threadId='thread-fixture',before='previous-turn',turnId='original-turn';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-exception-')),run=path.join(dir,'event-runs',id),active={id,taskId,sourceVersion:10,lease:'fixture-lease'};fs.mkdirSync(run,{recursive:true});const put=(name,value)=>fs.writeFileSync(path.join(run,name),JSON.stringify(value));put('acquire.response.private.json',{job:{...active,kind:'execute'}});put('failure.input.private.json',{id,lease:active.lease,operationId:'original-failure-operation'});return {dir,run,active,put};}
const client=(turns,status='notLoaded')=>({async request(method,args){assert.equal(method,'thread/read');assert.equal(args.threadId,threadId);return {thread:{id:threadId,status:{type:status},turns}};}});
test('exception fail intent is only a candidate when exact event and lease match',()=>{
 const f=fixture();assert.deepEqual(failedEventCandidates(f.dir).map(x=>x.id),[id]);f.put('failure.input.private.json',{id,lease:'other',operationId:'original-failure-operation'});assert.deepEqual(failedEventCandidates(f.dir),[]);
});
test('after dispatch only the recorded exact terminal turn may start a new analysis',async()=>{
 const f=fixture(),exited={readProcessIdentity:async()=>({state:'absent'})};f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-turn-started.private.json',{eventId:id,taskId,sourceVersion:10,threadId,turnId,serverPid:1234,serverStartedAt:'original-start'});
 assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,exited),true);
 assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,{readProcessIdentity:async()=>({state:'present',startedAt:'original-start'})}),false);
 assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,{readProcessIdentity:async()=>({state:'unknown'})}),false);
 assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,{readProcessIdentity:async()=>({state:'present',startedAt:'reused-pid-new-start'})}),true);
 for(const [turns,status] of [[[{id:turnId,status:'inProgress'}],'notLoaded'],[[{id:'other',status:'completed'}],'notLoaded'],[[{id:turnId,status:'completed'}],'running'],[[{id:turnId,status:'completed'}],'systemError'],[[{id:turnId,status:'completed'},{id:'other',status:'completed'}],'notLoaded']])assert.equal(await exceptionDispatchSettled(client(turns,status),f.dir,f.active,exited),false);
});
test('old missing turn and process identities stay unknown despite an interrupted readback',async()=>{
 const f=fixture();f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-before.private.json',{polls:[{thread:{id:threadId},latestTurn:{id:before}}]});
 assert.equal(await exceptionDispatchSettled(client([{id:before,status:'completed'},{id:turnId,status:'interrupted'}]),f.dir,f.active),false);
 assert.equal(await exceptionDispatchSettled(client([{id:before,status:'completed'},{id:turnId,status:'inProgress'}]),f.dir,f.active),false);
 assert.equal(await exceptionDispatchSettled(client([{id:before,status:'completed'},{id:turnId,status:'interrupted'},{id:'extra',status:'completed'}]),f.dir,f.active),false);
});
test('a corrupt dispatch record is not mistaken for a never-dispatched event',async()=>{
 const f=fixture();fs.writeFileSync(path.join(f.run,'chat-dispatch.input.private.json'),'{');assert.equal(await exceptionDispatchSettled(client([]),f.dir,f.active),false);
});
test('uncertain finalization intent never proves it ran',()=>{
 const f=fixture();fs.unlinkSync(path.join(f.run,'failure.input.private.json'));f.put('event-complete.input.private.json',{id,lease:f.active.lease,operationId:'fixture-complete-op'});assert.deepEqual(failedEventCandidates(f.dir).map(x=>x.id),[id]);
});
test('long-running turn identity is persisted before its wait can time out',async()=>{
 const c=new CodexAppServerClient({turnTimeoutMs:1});let saved;
 c.request=async method=>{assert.equal(method,'turn/start');return {turn:{id:turnId}};};
 await assert.rejects(c.startTurn({threadId,prompt:'fixture',permissions:':danger-full-access',onTurnStarted:async v=>{saved=v;}}),e=>e.code==='turn_timeout'&&e.turnId===turnId);
 assert.deepEqual(saved,{threadId,turnId,serverPid:null,serverStartedAt:null});
});
test('the original server exit receipt carries its exact persisted creation identity',async()=>{
 const {EventEmitter}=require('node:events'),c=new CodexAppServerClient({turnTimeoutMs:1,readProcessIdentity:async()=>({state:'present',startedAt:'original-start'})}),child=new EventEmitter();child.pid=1234;c.child=child;let started,exited;
 c.request=async()=>({turn:{id:turnId}});await assert.rejects(c.startTurn({threadId,prompt:'fixture',permissions:':danger-full-access',onTurnStarted:v=>{started=v;},onServerExit:v=>{exited=v;}}));
 child.emit('exit',1,null);assert.deepEqual(started,{threadId,turnId,serverPid:1234,serverStartedAt:'original-start'});assert.equal(exited.serverStartedAt,started.serverStartedAt);assert.equal(exited.serverPid,started.serverPid);assert.equal(exited.turnId,turnId);assert.equal(exited.exitCode,1);
});
test('exit receipt must bind the exact event, turn, PID and process creation time',async()=>{
 const f=fixture(),mark={eventId:id,taskId,sourceVersion:10,threadId,turnId,serverPid:1234,serverStartedAt:'original-start'};f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-turn-started.private.json',mark);
 const queryUnknown={readProcessIdentity:async()=>({state:'unknown'})};f.put('chat-server-exit.private.json',{...mark,serverStartedAt:'wrong-start'});assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,queryUnknown),false);
 f.put('chat-server-exit.private.json',{...mark,exitCode:1});assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,queryUnknown),true);
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {exceptionDispatchSettled,CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
const {failedEventCandidates}=require('./xiaoye-failed-event-scan.cjs');
const id='a'.repeat(64),taskId='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',threadId='thread-fixture',before='previous-turn',turnId='original-turn';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-exception-')),run=path.join(dir,'event-runs',id),active={id,taskId,sourceVersion:10,lease:'fixture-lease'};fs.mkdirSync(run,{recursive:true});const put=(name,value)=>fs.writeFileSync(path.join(run,name),JSON.stringify(value));put('acquire.response.private.json',{job:{...active,kind:'execute'}});put('failure.input.private.json',{id,lease:active.lease,operationId:'original-failure-operation'});return {dir,run,active,put};}
const client=(turns,status='notLoaded')=>({async request(method,args){assert.equal(method,'thread/read');assert.equal(args.threadId,threadId);return {thread:{id:threadId,status:{type:status},turns}};}});
test('exception fail intent is only a candidate when exact event and lease match',()=>{
 const f=fixture();assert.deepEqual(failedEventCandidates(f.dir).map(x=>x.id),[id]);f.put('failure.input.private.json',{id,lease:'other',operationId:'original-failure-operation'});assert.deepEqual(failedEventCandidates(f.dir),[]);
});
test('parent exit, PID reuse and a terminal turn never establish process-tree completion',async()=>{
 const f=fixture();f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});const mark={eventId:id,taskId,sourceVersion:10,threadId,turnId,serverPid:1234,serverStartedAt:'original-start'};f.put('chat-turn-started.private.json',mark);f.put('chat-server-exit.private.json',{...mark,exitCode:1});
 for(const state of [{state:'absent'},{state:'present',startedAt:'reused-pid-new-start'},{state:'unknown'}])assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,{readProcessIdentity:async()=>state}),false);
});
test('a finalization before any dispatch can be inspected for recovery',async()=>{
 const f=fixture();assert.equal(await exceptionDispatchSettled(client([]),f.dir,f.active),true);
});
test('an explicitly completed normal event keeps its existing recovery path',async()=>{
 const f=fixture();fs.unlinkSync(path.join(f.run,'failure.input.private.json'));f.put('event-complete.input.private.json',{id,lease:f.active.lease,operationId:'event-complete-'+id});f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-dispatch.response.private.json',{threadId,turnId,status:'completed'});f.put('chat-completed.private.json',{threadId,turnId});f.put('completion.private.json',{state:'done'});assert.equal(await exceptionDispatchSettled(client([]),f.dir,f.active),true);
 f.put('bridge-error.private.json',{category:'turn_timeout'});assert.equal(await exceptionDispatchSettled(client([]),f.dir,f.active),false);
});
test('normal completion requires matching dispatch, turn and done receipt',async()=>{
 const f=fixture();fs.unlinkSync(path.join(f.run,'failure.input.private.json'));f.put('event-complete.input.private.json',{id,lease:f.active.lease});f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-dispatch.response.private.json',{threadId,turnId,status:'completed'});f.put('chat-completed.private.json',{threadId,turnId:'other'});f.put('completion.private.json',{state:'done'});assert.equal(await exceptionDispatchSettled(client([]),f.dir,f.active),false);f.put('chat-completed.private.json',{threadId,turnId});f.put('completion.private.json',{state:'failed'});assert.equal(await exceptionDispatchSettled(client([]),f.dir,f.active),false);
});
test('an exited parent with a living child cannot permit another dispatch',async()=>{
 const {spawn}=require('node:child_process'),f=fixture();let childPid;
 const script="const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{detached:true,stdio:'ignore',windowsHide:true});c.unref();process.stdout.write(String(c.pid))";
 const parent=spawn(process.execPath,['-e',script],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';parent.stdout.setEncoding('utf8');parent.stdout.on('data',s=>output+=s);
 try{const code=await new Promise((resolve,reject)=>{parent.once('error',reject);parent.once('close',resolve);});assert.equal(code,0);childPid=Number(output);assert(Number.isSafeInteger(childPid)&&childPid>0);assert.doesNotThrow(()=>process.kill(childPid,0));
  const mark={eventId:id,taskId,sourceVersion:10,threadId,turnId,serverPid:parent.pid,serverStartedAt:'fixture-parent-start'};f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-turn-started.private.json',mark);f.put('chat-server-exit.private.json',{...mark,exitCode:0});
  assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active),false);assert.doesNotThrow(()=>process.kill(childPid,0));
 }finally{if(childPid)try{process.kill(childPid);}catch{}}
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
test('even an exact parent exit receipt cannot prove that descendants stopped',async()=>{
 const f=fixture(),mark={eventId:id,taskId,sourceVersion:10,threadId,turnId,serverPid:1234,serverStartedAt:'original-start'};f.put('chat-dispatch.input.private.json',{threadId,hostId:'local'});f.put('chat-turn-started.private.json',mark);
 const queryUnknown={readProcessIdentity:async()=>({state:'unknown'})};f.put('chat-server-exit.private.json',{...mark,serverStartedAt:'wrong-start'});assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,queryUnknown),false);
 f.put('chat-server-exit.private.json',{...mark,exitCode:1});assert.equal(await exceptionDispatchSettled(client([{id:turnId,status:'interrupted'}]),f.dir,f.active,queryUnknown),false);
});

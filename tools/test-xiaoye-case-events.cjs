const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {runCaseEvent}=require('./xiaoye-case-events.cjs');

function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-event-case-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const keys=['am','dailylog','uof','meeting','hozo'],routes=keys.map(key=>({key,id:crypto.randomUUID(),serviceProjectId:'p-'+key,threadId:crypto.randomUUID(),hostId:'local',workRoot:'D:/fixture/'+key}));
 const caseId='work-'+crypto.randomUUID(),threadId=crypto.randomUUID(),state={phase:'create',creates:0,sends:0,waits:0,binds:0,moves:0},saved=new Map();
 const config={routes,caseChatsDirectory:dir},checked={job:{id:'e',taskId:caseId,kind:'analyze'},task:{id:caseId,title:'隔離問題',primaryParentId:'p-dailylog',secretary:{}},projects:keys.map(key=>({key,id:'p-'+key}))};
 const client={async call(name,input){
  if(name==='create_thread'){state.creates++;assert(saved.has('started.private.json'));assert.equal(input.target.projectId,routes[1].id);return {threadId};}
  if(name==='read_thread')return {thread:{id:threadId,hostId:'local',cwd:routes[1].workRoot}};
  if(name==='move_thread_to_project'){state.moves++;return {threadId,projectId:input.projectId};}
  if(name==='send_message_to_thread'){state.sends++;assert(state.binds>0);return {threadId};}
  if(name==='wait_threads'){state.waits++;return {polls:[{thread:{id:threadId,status:{type:'idle'}},cursor:String(state.waits),latestTurn:{id:state.sends?'turn-'+state.sends:'initialized',status:'completed'}}]};}
  throw Error('unexpected '+name);
 }};
 const args={client,config,checked,check:async()=>checked,save:(f,v)=>saved.set(f,v),prompt:'隔離案件',bind:async v=>{state.binds++;assert.equal(v.threadId,threadId);assert(saved.has('started.private.json'));},timeoutMs:5000};
 return {args,state,saved,threadId,checked};
}

test('a new case starts a single project chat and binds the original card',async t=>{
 const f=fixture(t),result=await runCaseEvent(f.args);
 assert.equal(result.threadId,f.threadId);assert.equal(f.state.creates,1);assert.equal(f.state.sends,1);assert.equal(f.state.binds,1);assert(f.saved.has('chat-completed.private.json'));
});
test('a later event resumes the same chat without creating another',async t=>{
 const f=fixture(t);await runCaseEvent(f.args);f.state.phase='continue';f.state.waits=0;f.saved.clear();
 const result=await runCaseEvent(f.args);assert.equal(result.threadId,f.threadId);assert.equal(f.state.creates,1);assert.equal(f.state.sends,2);assert.equal(f.state.binds,2);
});
test('a classification change moves the same chat before dispatch',async t=>{
 const f=fixture(t);await runCaseEvent(f.args);f.checked.task.primaryParentId='p-meeting';f.saved.clear();
 const result=await runCaseEvent(f.args);assert.equal(result.threadId,f.threadId);assert.equal(f.state.creates,1);assert.equal(f.state.sends,2);assert.equal(f.state.moves,1);
});
test('lost desktop creation response is not silently retried',async t=>{
 const f=fixture(t);let creates=0;f.args.client.call=async name=>{if(name==='create_thread'){creates++;throw Error('response unknown');}throw Error('unexpected');};
 await assert.rejects(runCaseEvent(f.args),/response unknown/);await assert.rejects(runCaseEvent(f.args),/未確認/);assert.equal(creates,1);
});
test('a new classification during analysis moves and rebinds before marking the event complete',async t=>{
 const f=fixture(t),call=f.args.client.call.bind(f.args.client);
 f.args.client.call=async(name,input)=>{const value=await call(name,input);if(name==='wait_threads'&&f.state.sends>0)f.checked.task.primaryParentId='p-meeting';return value;};
 const result=await runCaseEvent(f.args);assert.equal(result.threadId,f.threadId);assert.equal(f.state.moves,1);assert.equal(f.state.binds,2);assert(f.saved.has('chat-completed.private.json'));
});
test('a required folder confirmation stops before dispatch and keeps the original chat',async t=>{
 const f=fixture(t);await runCaseEvent(f.args);f.checked.task.primaryParentId='p-meeting';f.saved.clear();const original=f.args.client.call.bind(f.args.client);
 f.args.client.call=async(name,input)=>{if(name==='move_thread_to_project')throw Object.assign(Error('需要確認'),{code:'confirmation_required'});return original(name,input);};
 await assert.rejects(runCaseEvent(f.args),/需要確認/);assert.equal(f.state.creates,1);assert.equal(f.state.sends,1);
});

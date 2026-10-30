'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseReporterReply,deliverReporterReply}=require('./xiaoye-chat-reply.cjs');
const {CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
const {runVisibleEvent}=require('./xiaoye-visible-chats.cjs');
const item=text=>[{type:'agentMessage',text}];
const question={type:'question',text:'您是在哪個畫面看到的？'};
const answer={type:'answer',text:'請按更新按鈕。',explanation:{cause:'需要更新畫面。',handling:'提供操作方式。',outcome:'請確認畫面是否更新。'},evidence:['原操作畫面']};
const marked=value=>'小葉回覆JSON：'+JSON.stringify(value);
function context(){const job={kind:'analyze',id:'e'.repeat(64),lease:'lease-1',taskId:'work-1',sourceVersion:3};return {job,checked:{job,task:{id:job.taskId,version:6,primaryParentId:'project-1',secretary:{stage:'clarifying',waitingForReporter:false,sourceVersion:3}},projects:[]}};}
test('only marked final reporter text is parsed; internal output and incomplete answer are not forwarded',()=>{
 assert.equal(parseReporterReply(item('查核工具：私人資訊')),null);
 assert.equal(parseReporterReply(item(marked({type:'answer',text:'已處理'}))),null);
 assert.equal(parseReporterReply(item(marked({...question,text:'x'.repeat(2001)}))),null);
 assert.deepEqual(parseReporterReply([...item('內部過程'),...item(marked(question))]),question);
 assert.deepEqual(parseReporterReply(item(marked(answer))),answer);
});
test('a question and an answer use the original APIs, same event, and a stable operation id',async()=>{
 for(const [reply,action] of [[question,'clarify'],[answer,'answer']]){
  const {job,checked}=context(),calls=[];assert.equal(await deliverReporterReply({reply,job,check:async()=>checked,call:async(...v)=>calls.push(v),savePath:'private.json'}),true);
  assert.equal(calls.length,1);assert.equal(calls[0][0],action);assert.equal(calls[0][1].id,job.taskId);assert.equal(calls[0][1].eventId,job.id);assert.equal(calls[0][1].eventLease,job.lease);assert.equal(calls[0][1].operationId,'chat-reply-'+job.id);assert.equal(calls[0][2],'private.json');
  if(action==='answer'){assert.equal(calls[0][1].projectId,'project-1');assert.equal(calls[0][1].result,answer.text);}
 }
});
test('already answered, asked, proposed, or changed cases do not send another message',async()=>{
 const {job,checked}=context();let writes=0;const args={reply:answer,job,check:async()=>checked,call:async()=>writes++};
 checked.task.secretary.waitingForReporter=true;assert.equal(await deliverReporterReply(args),false);
 checked.task.secretary.waitingForReporter=false;checked.task.secretary.stage='awaiting_confirmation';assert.equal(await deliverReporterReply(args),false);
 checked.task.secretary.stage='approved';assert.equal(await deliverReporterReply(args),false);
 checked.task.secretary.stage='clarifying';checked.task.secretary.sourceVersion++;await assert.rejects(deliverReporterReply(args));
 assert.equal(writes,0);
});
test('the actual completed turn returns only the marked reporter message',async()=>{
 const c=new CodexAppServerClient({readProcessIdentity:async()=>({state:'unknown'})});c.child={pid:1};
 c.request=async method=>method==='turn/start'?{turn:{id:'turn-1'}}:{thread:{turns:[{id:'turn-1',status:'completed',items:item(marked(question))}]}};
 c.waitForTurn=async()=>({id:'turn-1',status:'completed'});
 const result=await c.startTurn({threadId:'thread-1',prompt:'fixture',permissions:':danger-full-access'});assert.deepEqual(result.reporterReply,question);
});
test('only the reply from the same completed chat turn is passed to the bridge',async()=>{
 const {job,checked}=context(),keys=['am','dailylog','uof','meeting','hozo'],routes=keys.map(key=>({key,id:'id-'+key,serviceProjectId:'service-'+key,threadId:'thread-'+key,hostId:'local',workRoot:'D:/fixture/'+key}));
 checked.task.primaryParentId='service-am';checked.projects=[{id:'service-am',key:'am'}];let poll=0;
 const client={call:async(name)=>{if(name==='read_thread')return {thread:{id:'thread-am',hostId:'local',cwd:'D:/fixture/am'}};if(name==='send_message_to_thread')return {threadId:'thread-am',turnId:'turn-1',reporterReply:question};if(name==='wait_threads')return {polls:[{thread:{id:'thread-am',status:{type:'idle'}},latestTurn:poll++?{id:'turn-1',status:'completed'}:null}]};throw Error('unexpected call');}};
 const result=await runVisibleEvent({client,config:{routes},checked,check:async()=>checked,save:()=>{},prompt:'fixture'});assert.deepEqual(result.reporterReply,question);
});

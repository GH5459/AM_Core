const {CaseChatRegistry,getOrCreateCaseChat}=require('./xiaoye-case-chat-registry.cjs');
const {selectRoute,runVisibleEvent}=require('./xiaoye-visible-chats.cjs');

// Opt-in path: one persistent desktop chat per original work item. Unknown
// desktop outcomes remain blocked for inspection; no hidden replacement chat.
async function runCaseEvent({client,config,checked,check,save,prompt,caseUrl,bind,clock=Date.now,timeoutMs=27*60000}) {
 const initial=selectRoute(config,checked),caseId=checked.task.id,projectId=initial.id;
 if(!projectId||!config.caseChatsDirectory)throw Error('案件聊天專案設定不完整');
 const registry=new CaseChatRegistry(config.caseChatsDirectory),deadline=clock()+timeoutMs;
 let created=false;
 const checkCase=async()=>{const value=await check(),route=selectRoute(config,value);return {caseId:value.task.id,projectId:route.id,valid:value.task.id===caseId};};
 const move=async({threadId,targetProjectId,projectId})=>client.call('move_thread_to_project',{threadId,hostId:'local',projectId:targetProjectId||projectId});
 const mark=()=>save('started.private.json',{at:new Date(clock()).toISOString(),jobKind:checked.job.kind,caseId,delivery:'case-desktop-chat'});
 const chat=await getOrCreateCaseChat({registry,caseId,projectId,workRoot:initial.workRoot,check:checkCase,move,create:async()=>{
  mark();created=true;
  const title=('案件｜'+String(checked.task.title||'待釐清').replace(/[\r\n]+/g,' ').slice(0,65));
  return client.call('create_thread',{title,prompt:'這是案件聊天的初始化。請只回覆「案件聊天已建立」後結束，不讀取案件、不修改檔案、不發送訊息。',target:{type:'project',projectId,environment:{type:'local'}}});
 }});
 if(!created)mark();
 if(created){
  let initialized=false;
  while(clock()<deadline){
   await check();
   const response=await client.call('wait_threads',{targets:[{threadId:chat.threadId,hostId:initial.hostId}],timeoutMs:60000});
   save('chat-initialization.private.json',response);
   const p=response?.polls?.find(x=>x.thread?.id===chat.threadId);
   if(!p||response.errors?.length)throw Error('無法確認案件聊天初始化');
   const running=['active','running'].includes(p.thread?.status?.type)||['inProgress','in_progress','running'].includes(p.latestTurn?.status);
   if(p.latestTurn?.id&&!running){if(p.latestTurn.status!=='completed')throw Error('案件聊天初始化未完成');initialized=true;break;}
  }
  if(!initialized)throw Error('案件聊天初始化尚未確認');
 }
 let current=await check();
 if(current.task.id!==caseId)throw Error('案件已變更，停止接線');
 if(selectRoute(config,current).id!==projectId)throw Error('案件專案已變更，請先確認原聊天');
 await bind({checked:current,threadId:chat.threadId,projectId:chat.projectId});
 current=await check();
 const routed={...config,routes:config.routes.map(r=>r.id===initial.id?{...r,threadId:chat.threadId,workRoot:chat.workRoot||initial.workRoot}:r)};
 let completed;
 const saveChecked=(file,value)=>{if(file==='chat-completed.private.json')completed=value;else save(file,value);};
 const casePrompt=caseUrl?prompt+'\n\n工作日誌中的原案件：'+caseUrl:prompt;
 const result=await runVisibleEvent({client,config:routed,checked:current,check,save:saveChecked,prompt:casePrompt,clock,timeoutMs:Math.max(1,deadline-clock())});
 current=await check();
 const finalRoute=selectRoute(config,current);
 if(finalRoute.id!==projectId){
  const moved=await getOrCreateCaseChat({registry,caseId,projectId:finalRoute.id,check:checkCase,move});
  current=await check();
  if(selectRoute(config,current).id!==moved.projectId)throw Error('案件專案已變更，請先確認原聊天');
  await bind({checked:current,threadId:moved.threadId,projectId:moved.projectId,moved:true});
 }
 if(completed)save('chat-completed.private.json',completed);
 return result;
}
module.exports={runCaseEvent};

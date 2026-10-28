// Synthetic case, actual desktop creation and message delivery; no business data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DesktopMcp}=require('./xiaoye-visible-chats.cjs');
const {runCaseEvent}=require('./xiaoye-case-events.cjs');
(async()=>{
 const context=JSON.parse(fs.readFileSync(process.env.XIAOYE_DESKTOP_CONTEXT,'utf8'));
 context.ownerThreadId=process.env.XIAOYE_OWNER_THREAD;
 if(!context.ownerThreadId||!process.env.XIAOYE_ROUTES||!process.env.XIAOYE_TEST_DIRECTORY)throw Error('Missing synthetic test configuration');
 const config=JSON.parse(fs.readFileSync(process.env.XIAOYE_ROUTES,'utf8'));
 config.caseChatsDirectory=path.join(process.env.XIAOYE_TEST_DIRECTORY,'case-chats');
 const caseId='work-'+crypto.randomUUID(),route=config.routes.find(x=>x.key==='am');
 const checked={job:{id:'synthetic-event',taskId:caseId,kind:'analyze'},task:{id:caseId,title:'隔離測試：案件聊天自動建立',primaryParentId:route.serviceProjectId,secretary:{}},projects:config.routes.map(r=>({key:r.key,id:r.serviceProjectId}))};
 const client=new DesktopMcp(context),saved={};let bound=null;
 try{
  await client.connect();
  const result=await runCaseEvent({client,config,checked,check:async()=>checked,save:(name,value)=>{saved[name]=value;},bind:async v=>{bound=v;},timeoutMs:100000,prompt:'這是虛構隔離測試案件，請只回覆「已接續隔離案件」後結束，不修改任何檔案、工作日誌、LINE 或正式資料。'});
  if(bound?.threadId!==result.threadId||!saved['chat-completed.private.json'])throw Error('Synthetic binding was not verified');
  console.log(JSON.stringify({passed:true,threadId:result.threadId,simulatedCard:true,realDesktop:true}));
 }finally{client.close();}
})().catch(e=>{console.error(JSON.stringify({message:e.message,code:e.code||null,method:e.method||null}));process.exitCode=1});

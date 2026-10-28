// Explicitly targeted synthetic chat only. The original event service is not used.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DesktopMcp}=require('./xiaoye-visible-chats.cjs');
const {CaseChatRegistry}=require('./xiaoye-case-chat-registry.cjs');
const {runCaseEvent}=require('./xiaoye-case-events.cjs');
(async()=>{
 const context=JSON.parse(fs.readFileSync(process.env.XIAOYE_DESKTOP_CONTEXT,'utf8'));
 context.ownerThreadId=process.env.XIAOYE_OWNER_THREAD;
 const threadId=process.env.XIAOYE_TEST_THREAD,projectId=process.env.XIAOYE_TEST_PROJECT;
 if(!threadId||!projectId||!context.ownerThreadId)throw Error('Missing explicit synthetic target');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-real-chat-'));
 const registry=new CaseChatRegistry(dir),caseId='work-'+crypto.randomUUID(),reservation=registry.reserve(caseId,projectId);registry.finish(caseId,reservation.operationId,threadId);
 const keys=['am','dailylog','uof','meeting','hozo'],routes=keys.map(key=>({key,id:key==='dailylog'?projectId:crypto.randomUUID(),serviceProjectId:'synthetic-'+key,threadId:crypto.randomUUID(),hostId:'local',workRoot:key==='dailylog'?'D:/CodexWork/DailyLog':'D:/fixture/'+key}));
 const checked={job:{id:'synthetic-event',taskId:caseId,kind:'analyze'},task:{id:caseId,title:'隔離測試',primaryParentId:'synthetic-dailylog',secretary:{}},projects:keys.map(key=>({key,id:'synthetic-'+key}))};
 const client=new DesktopMcp(context);
 try{
  await client.connect();
  const result=await runCaseEvent({client,config:{routes,caseChatsDirectory:dir},checked,check:async()=>checked,save:()=>{},bind:async()=>{},timeoutMs:90000,prompt:'這是同一筆隔離測試案件的自動派送驗證。請只回覆「已收到隔離派送」並結束；不要修改檔案、工作日誌、LINE 或任何正式資料。'});
  assert.equal(result.threadId,threadId);console.log(JSON.stringify({passed:true,existingSyntheticChat:true}));
 }finally{client.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(JSON.stringify({message:e.message,method:e.method||null,code:e.mcpError?.code||null,detail:e.mcpError?.message||null}));process.exitCode=1});

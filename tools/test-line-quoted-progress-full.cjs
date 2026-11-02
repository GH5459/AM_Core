const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
if(!process.env.DAILYLOG_TEST_ROOT||!process.env.DAILYLOG_ROUTINE_PACKAGE)throw Error('set DAILYLOG_TEST_ROOT and DAILYLOG_ROUTINE_PACKAGE to isolated fixture paths');
const fixturePath=path.join(process.env.DAILYLOG_TEST_ROOT,'scripts/routine-tabs.worker.test.cjs'),fixtureModule=new Module(fixturePath,module);
fixtureModule.filename=fixturePath;fixtureModule.paths=Module._nodeModulePaths(path.dirname(fixturePath));
fixtureModule._compile(fs.readFileSync(fixturePath,'utf8').replace("name:'routines-fixture',...(outboundService?", "name:'routines-fixture',compatibilityFlags:['nodejs_compat'],...(outboundService?"),fixturePath);
const {fixture}=fixtureModule.exports;
const key='synthetic-service-key-at-least-thirty-two-bytes',bot='U'+'0'.repeat(32),user='U'+'1'.repeat(32),group='C'+'2'.repeat(32),original='12345678901234567';
test('full Worker records the original quoted reply once with original permissions',async()=>{
 const f=await fixture({extraBindings:{LEAF_TASK_SERVICE_KEY:key,LEAF_TASK_TENANT:'fixture'}});
 try{
  await f.db.prepare('CREATE TABLE IF NOT EXISTS line_assignment_intake(id TEXT PRIMARY KEY,tenant TEXT,state TEXT,input TEXT,result TEXT)').run();
  let r=await f.send('900003','/api/tasks',{id:'work-'+crypto.randomUUID(),title:'隔離任務',description:'隔離內容',sourceDate:'2026-10-16',leadAccount:'900001',collaboratorAccounts:[],level:1,workSchema:2,workSource:'assigned'});assert.equal(r.status,201,await r.clone().text());const task=(await r.json()).task;
  const source={groupId:group,messageId:original};await f.db.prepare('INSERT INTO line_assignment_intake VALUES(?,?,?,?,?)').bind('a'.repeat(64),'fixture','issued',JSON.stringify(source),JSON.stringify({taskIds:[task.id]})).run();
  const payload={tenantKey:'fixture',botUserId:bot,actor:{userId:user,account:'900001',bindingId:'fixture-binding'},source:{groupId:group,quotedMessageId:original,messageId:'12345678901234568',timestamp:Date.now(),text:'聯絡資料已提供'}};
  const call=(body,token=key)=>f.mf.dispatchFetch('http://example.test/api/integrations/leaf-snail/tasks/quoted-progress',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await call(payload,'wrong')).status,401);
  for(let i=0;i<2;i++){r=await call(payload);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).recorded,true);}
  const stored=JSON.parse((await f.db.prepare('SELECT value FROM work_items WHERE id=?').bind(task.id).first()).value),comments=stored.history.filter(h=>h.kind==='comment');assert.equal(comments.length,1);assert.equal(comments[0].actor.account,'900001');assert.equal(comments[0].text,'LINE 群組回覆：\n聯絡資料已提供');assert.notEqual(stored.status,'done');
  payload.source.messageId='12345678901234569';payload.actor.account='900003';r=await call(payload);assert.equal((await r.json()).recorded,false,'requester is not the executor');
  payload.actor.account='900002';r=await call(payload);assert.notEqual((await r.json()).recorded,true);
  payload.actor.account='900001';payload.source.groupId='C'+'3'.repeat(32);r=await call(payload);assert.equal((await r.json()).recorded,false);
  payload.source.groupId=group;await f.db.prepare('UPDATE line_assignment_intake SET input=?').bind(JSON.stringify({...source,sourceRemoved:true})).run();r=await call(payload);assert.equal((await r.json()).recorded,false);
  await f.db.prepare('UPDATE line_assignment_intake SET input=?,state=?').bind(JSON.stringify(source),'queued').run();r=await call(payload);assert.equal(r.status,503,'wait while the original task is still being created');
  await f.db.prepare('UPDATE line_assignment_intake SET state=?,result=?').bind('issued',JSON.stringify({taskIds:[task.id,'work-'+crypto.randomUUID()]})).run();r=await call(payload);assert.equal((await r.json()).reason,'ambiguous');
  assert.equal(JSON.parse((await f.db.prepare('SELECT value FROM work_items WHERE id=?').bind(task.id).first()).value).history.filter(h=>h.kind==='comment').length,1);
 }finally{await f.close();}
});

const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2],runtime=require(process.argv[3]||'miniflare');
(async()=>{
 const candidate=folder+'/candidate',names=fs.readdirSync(candidate).filter(n=>n.endsWith('.mjs'));
 const modules=names.map(name=>({type:'ESModule',path:candidate+'/'+name,contents:fs.readFileSync(candidate+'/'+name,'utf8')}));
 const main=modules.find(m=>m.path.endsWith('/worker.mjs')),match=main.contents.match(/memoryTaskService\((dailylogExecutionRelease\.core),/);assert(match);
 main.contents+='\nexport {assignmentMachine as testMachine,memoryTaskService as testMemory};\nexport const testCore='+match[1]+';';
 const entry=`import {testMachine,testMemory,testCore} from './worker.mjs';
 const people=[{account:'111',name:'本人',id:'uof:111',team:'合成部門',teamId:'fixture'}];
 export default {fetch(request,env){return testMachine(request,env,{now:()=>1792375200000,directory:async()=>({people,assertCurrent:async()=>{if(request.headers.get('x-revoke-late'))throw Object.assign(Error('revoked'),{code:'ACCESS_DISABLED',status:403});}}),permission:a=>a==='111'&&!request.headers.get('x-revoked'),makeService:members=>testMemory(testCore,members.people,()=>1792375200000,a=>a==='111'),publish:()=>{}});}};`;
 const worker={name:'quick-test',modules:[{type:'ESModule',path:candidate+'/entry.mjs',contents:entry},...modules],modulesRoot:candidate,compatibilityDate:'2026-10-06',bindings:{LEAF_TASK_SERVICE_KEY:'synthetic-quick-secret'.repeat(3),LEAF_TASK_TENANT:'fixture',PUBLIC_ORIGIN:'https://fixture.example.test'},d1Databases:['DB']};
 const options={workers:[worker]},mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE work_items(id TEXT PRIMARY KEY,level INTEGER,department TEXT,department_id TEXT,value TEXT,revision INTEGER); CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT,revision INTEGER,PRIMARY KEY(namespace,key));');
  const at=1792375200000,input={tenantKey:'fixture',contract:'line-group-bot-quick-create-v1',id:'a'.repeat(64),botUserId:'U'+'0'.repeat(32),actor:{userId:'U'+'1'.repeat(32),account:'111',bindingId:'confirmed'},source:{groupId:'C'+'2'.repeat(32),messageId:'synthetic-message',eventId:'synthetic-event',text:'@葉小蝸 幫我建立任務：整理招募進度，10月23日前完成',timestamp:at-60000},draft:{title:'整理招募進度',description:'各職缺人數清單',acceptance:'表格',dueDate:'2026-10-23',dueAt:null},confirmation:{userId:'U'+'1'.repeat(32),eventId:'confirm-event',timestamp:at-1000},revision:1};
  const call=(v,headers={},auth=true)=>mf.dispatchFetch('https://fixture/api/integrations/leaf-snail/tasks/self-create',{method:'POST',headers:{'Content-Type':'application/json',...auth?{Authorization:'Bearer '+'synthetic-quick-secret'.repeat(3)}:{},...headers},body:JSON.stringify(v)});
  assert.equal((await call(input,{},false)).status,401);assert.equal((await call({...input,tenantKey:'other'})).status,403);
  assert.equal((await call({...input,confirmation:{...input.confirmation,userId:'U'+'9'.repeat(32)}})).status,400);
  assert.equal((await call({...input,actor:{...input.actor,account:'222'}})).status,403);
  assert.equal((await call({...input,draft:{...input.draft,dueDate:'2026-02-30'}})).status,400);
  assert.equal((await call({...input,draft:{...input.draft,dueAt:'2026-10-23T25:00:00+08:00'}})).status,400);
  assert.equal((await call(input,{'x-revoke-late':'1'})).status,403);
  assert.equal((await db.prepare('SELECT count(*) n FROM work_items').first()).n,0);
  const [r1,r2]=await Promise.all([call(input),call(input)]);const b1=await r1.json(),b2=await r2.json();assert.equal(r1.status,200,JSON.stringify(b1));assert.equal(r2.status,200,JSON.stringify(b2));assert.deepEqual(b1.taskIds,b2.taskIds);
  assert.equal((await db.prepare('SELECT count(*) n FROM work_items').first()).n,1);assert.equal((await db.prepare('SELECT count(*) n FROM documents').first()).n,1);
  let task=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert.equal(task.lead.account,'111');assert.equal(task.requester.account,'111');assert.equal(task.origin,'self');assert.equal(task.workSource,'self');assert.equal(task.assignment,undefined);assert.equal(task.dueDate,'2026-10-23');assert.equal(task.dueAt,null);assert.equal(task.status,'pending');assert.equal(task.department,'合成部門');assert(task.description.includes(input.source.text));
  await db.prepare("UPDATE work_items SET value=json_set(value,'$.progressNote','original progress','$.status','in_progress')").run();
  assert.equal((await call(input)).status,200);task=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert.equal(task.progressNote,'original progress');assert.equal(task.status,'in_progress');
  assert.equal((await call({...input,draft:{...input.draft,title:'changed'}})).status,409);assert.equal((await call(input,{'x-revoked':'1'})).status,403);
  const optional={...input,id:'b'.repeat(64),source:{...input.source,messageId:'other'},draft:{...input.draft,dueDate:null}};let r=await call(optional);assert.equal(r.status,200,await r.text());assert.equal((await db.prepare('SELECT count(*) n FROM work_items').first()).n,2);
  // An existing ID collision forces the entire receipt transaction to roll back.
  const failed={...input,id:'c'.repeat(64)},crypto=require('crypto'),key='fixture:'+failed.id,raw=crypto.createHash('sha256').update('self-task:'+key).digest('hex'),id='work-'+[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20,32)].join('-');
  await db.prepare('INSERT INTO work_items(id,value,revision) VALUES(?,?,1)').bind(id,'{}').run();assert.equal((await call(failed)).status,503);assert.equal((await db.prepare('SELECT count(*) n FROM documents WHERE key=?').bind(key).first()).n,0);
  fs.writeFileSync(folder+'/worker-tests.private.json',JSON.stringify({passed:true,fullLiveWorker:true,realWorkerd:true,realD1:true,checks:['auth','tenant','actor confirmation','disabled account','date validation','late revocation','concurrent duplicate','self ownership/source/due','date-only precision','no assignment reminder','replay preserves progress','changed replay conflict','optional deadline','transaction rollback']},null,2));
  console.log('Full current Worker + real workerd/D1: self task creation and 14 boundary/reliability checks passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

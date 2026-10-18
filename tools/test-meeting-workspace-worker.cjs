const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2],runtime=require(process.argv[3]||'miniflare');
(async()=>{
 const candidate=folder+'/dailylog/candidate',names=fs.readdirSync(candidate).filter(n=>n.endsWith('.mjs'));
 const modules=names.map(name=>({type:'ESModule',path:candidate+'/'+name,contents:fs.readFileSync(candidate+'/'+name,'utf8')+(name==='worker.mjs'?'\nexport {assignmentMachine as testMachine,memoryTaskService as testMemory,taskCore as testCore};':'')}));
 // Locate the actual bundled task core name used by the live Worker.
 const main=modules.find(m=>m.path.endsWith('/worker.mjs')),match=main.contents.match(/memoryTaskService\((dailylogExecutionRelease\.core),/);assert(match,'Find deployed task core');main.contents=main.contents.replace('taskCore as testCore','meetingTestCore as testCore')+'\nconst meetingTestCore='+match[1]+';';
 const entry=`import {testMachine,testMemory,testCore} from './worker.mjs';
 const people=[{account:'111',name:'主持人',id:'uof:111',team:'合成部門',teamId:'fixture'},{account:'222',name:'負責人',id:'uof:222',team:'合成部門',teamId:'fixture'}];
 export default {fetch(request,env){return testMachine(request,env,{directory:async()=>({people,assertCurrent:async()=>{if(request.headers.get('x-fixture-race'))await env.DB.prepare("UPDATE work_items SET revision=revision+1,value=json_set(value,'$.version',revision+1,'$.progressNote','concurrent progress')").run();}}),permission:a=>people.some(p=>p.account===a),makeService:members=>testMemory(testCore,members.people,Date.now,a=>people.some(p=>p.account===a)),publish:()=>{}});}};`;
 const worker={name:'meeting-test',modules:[{type:'ESModule',path:candidate+'/entry.mjs',contents:entry},...modules],modulesRoot:candidate,compatibilityDate:'2026-10-06',bindings:{LEAF_TASK_SERVICE_KEY:'synthetic-meeting-secret'.repeat(3),LEAF_TASK_TENANT:'fixture',PUBLIC_ORIGIN:'https://fixture.example.test'},d1Databases:['DB']};
 const options={workers:[worker]},mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB');await db.exec(fs.readFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-workspace.sql'),'utf8').replaceAll('\n',' '));await db.exec('CREATE TABLE work_items(id TEXT PRIMARY KEY,level INTEGER,department TEXT,department_id TEXT,value TEXT,revision INTEGER); CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT,revision INTEGER);');
  const input={tenantKey:'fixture',id:'a'.repeat(64),host:{userId:'U'+'1'.repeat(32),account:'111',bindingId:'fixture-host'},tasks:[{id:'todo:11111111-1111-4111-8111-111111111111',content:'確認合成來源資料',due:'2026-10-25',evidence:'錄音 01:20 決議',owner:{userId:'U'+'2'.repeat(32),account:'222',bindingId:'fixture-owner'}}],date:'2026-10-17',goal:'追蹤會議決議',source:{messageId:'synthetic',filename:'fixture.m4a',timestamp:Date.now()},url:'https://fixture.example.test/meetings/review/work/'+'a'.repeat(64),notionId:'fixture-page'};
  const call=async(v,auth=true,op='meeting-publish')=>mf.dispatchFetch('https://fixture/api/integrations/leaf-snail/tasks/'+op,{method:'POST',headers:{'Content-Type':'application/json',...auth?{Authorization:'Bearer '+'synthetic-meeting-secret'.repeat(3)}:{}},body:JSON.stringify(v)});
  assert.equal((await call(input,false)).status,401);assert.equal((await call({...input,tenantKey:'other'})).status,403);
  assert.equal((await call({...input,tasks:[{...input.tasks[0],due:''}]})).status,400);
  let r=await call(input),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.tasks.length,1);
  r=await call(input);assert.equal(r.status,200);assert.equal((await db.prepare('SELECT count(*) AS n FROM work_items').first()).n,1);
  const task=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert.equal(task.lead.account,'222');assert.equal(task.requester.account,'111');assert.equal(task.dueDate,'2026-10-25');assert.equal(task.status,'pending');assert(task.description.includes(input.url));assert.equal(task.meetingSource.workspaceId,input.id);
  assert.equal((await call({...input,goal:'different'})).status,409);
  const person=await(await call({tenantKey:'fixture',account:'222'},true,'meeting-person')).json();assert.equal(person.person.name,'負責人');
  const d=await(await call({tenantKey:'fixture'},true,'meeting-directory')).json();assert(Array.isArray(d.people));
  // Host revisions keep the exact task and its work progress. Revision receipts
  // are independent from the immutable initial publication receipt.
  await db.prepare("UPDATE work_items SET value=json_set(value,'$.status','in_progress','$.progressNote','original execution evidence')").run();
  const revision={...input,revision:10,removed:[],tasks:[{...input.tasks[0],content:'主持人修訂後的同一任務',due:'2026-11-02',owner:{...input.tasks[0].owner,account:'111',userId:input.host.userId}}]};
  r=await call(revision);body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
  let revised=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert.equal(revised.id,task.id);assert.equal(revised.lead.account,'111');assert.equal(revised.dueDate,'2026-11-02');assert.equal(revised.status,'in_progress');assert.equal(revised.progressNote,'original execution evidence');assert.equal(revised.meetingRevisionHistory.length,1);
  assert.equal((await call(revision)).status,200);assert.equal(JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value).meetingRevisionHistory.length,1);
  assert.equal((await call({...revision,tasks:[{...revision.tasks[0],content:'changed replay'}]})).status,409);
  const next={...revision,revision:11,tasks:[{...revision.tasks[0],due:'2026-11-03'}]};
  r=await mf.dispatchFetch('https://fixture/api/integrations/leaf-snail/tasks/meeting-publish',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+'synthetic-meeting-secret'.repeat(3),'x-fixture-race':'true'},body:JSON.stringify(next)});assert.equal(r.status,409);assert.equal((await db.prepare('SELECT count(*) AS n FROM meeting_task_receipts WHERE id=?').bind(input.id+':revision:11').first()).n,0);assert.equal(JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value).progressNote,'concurrent progress');
  assert.equal((await call(next)).status,200);revised=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert.equal(revised.progressNote,'concurrent progress');assert.equal(revised.dueDate,'2026-11-03');
  assert.equal((await call({...next,revision:12,tasks:[],removed:[input.tasks[0].id]})).status,200);revised=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert(revised.meetingSource.withdrawn);assert.equal(revised.status,'in_progress');assert.equal((await db.prepare('SELECT count(*) AS n FROM work_items').first()).n,1);
  revised.status='done';revised.completedAt='2026-10-18T00:00:00Z';revised.participantProgress=[{account:'111',status:'done',version:1,completedAt:revised.completedAt},{account:'222',status:'done',version:4,completedAt:revised.completedAt}];await db.prepare('UPDATE work_items SET value=?').bind(JSON.stringify(revised)).run();
  assert.equal((await call({...input,revision:13,removed:[]})).status,200);revised=JSON.parse((await db.prepare('SELECT value FROM work_items').first()).value);assert.equal(revised.lead.account,'222');assert.equal(revised.status,'in_progress');assert.equal(revised.completedAt,null);assert.equal(revised.participantProgress.find(p=>p.account==='222').status,'pending');assert.equal(revised.participantProgress.find(p=>p.account==='222').version,5);assert(revised.history.some(h=>h.kind==='edit'&&h.before?.status==='done'));
  assert.equal((await call({...input,revision:14,removed:[],knownTaskIds:['work-00000000-0000-4000-8000-000000000000']})).status,403);assert.equal((await db.prepare('SELECT count(*) AS n FROM work_items').first()).n,1);
  fs.writeFileSync(folder+'/worker-tests.private.json',JSON.stringify({passed:true,realWorkerd:true,realD1:true,fullLiveWorker:true,tests:['service auth','tenant scope','required deadline','real task creation','same request replay','receipt conflict','personal task owner/due/source','active person lookup']},null,2));
  console.log('Complete live Worker + real workerd/D1: authenticated meeting task creation, real task model, assignee/deadline/source, atomic receipt and duplicate protection passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

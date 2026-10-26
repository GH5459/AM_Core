const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2],runtime=require(process.argv[3]||'miniflare');
(async()=>{
 const candidate=folder+'/dailylog/candidate',names=fs.readdirSync(candidate).filter(n=>/\.(?:mjs|js)$/.test(n));
 const modules=names.map(name=>({type:'ESModule',path:candidate+'/'+name,contents:fs.readFileSync(candidate+'/'+name,'utf8')+(name==='worker.mjs'?'\nexport {assignmentMachine as testMachine,memoryTaskService as testMemory,taskCore as testCore};':'')}));
 // Locate the actual bundled task core name used by the live Worker.
 const main=modules.find(m=>m.path.endsWith('/worker.mjs')),match=main.contents.match(/memoryTaskService\((dailylogExecutionRelease\.core),/);assert(match,'Find deployed task core');main.contents=main.contents.replace('taskCore as testCore','meetingTestCore as testCore')+'\nconst meetingTestCore='+match[1]+';';
 const entry=`import {testMachine,testMemory,testCore} from './worker.mjs';
 const people=[{account:'111',name:'主持人',id:'uof:111',team:'合成部門',teamId:'fixture'},{account:'222',name:'負責人',id:'uof:222',team:'合成部門',teamId:'fixture'}];
 export default {fetch(request,env){return testMachine(request,env,{directory:async()=>({people,assertCurrent:async()=>{if(request.headers.get('x-fixture-race'))await env.DB.prepare("UPDATE work_items SET revision=revision+1,value=json_set(value,'$.version',revision+1,'$.progressNote','concurrent progress')").run();}}),permission:a=>people.some(p=>p.account===a),makeService:members=>testMemory(testCore,members.people,Date.now,a=>people.some(p=>p.account===a)),publish:()=>{}});}};`;
 const worker={name:'meeting-test',modules:[{type:'ESModule',path:candidate+'/entry.mjs',contents:entry},...modules],modulesRoot:candidate,compatibilityDate:process.env.MEETING_TEST_COMPATIBILITY_DATE||'2026-10-06',compatibilityFlags:['nodejs_compat'],bindings:{LEAF_TASK_SERVICE_KEY:'synthetic-meeting-secret'.repeat(3),LEAF_TASK_TENANT:'fixture',PUBLIC_ORIGIN:'https://fixture.example.test'},d1Databases:['DB']};
 const options={workers:[worker]},mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB');await db.exec(fs.readFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-workspace.sql'),'utf8').replaceAll('\n',' '));await db.exec('CREATE TABLE work_items(id TEXT PRIMARY KEY,level INTEGER,department TEXT,department_id TEXT,value TEXT,revision INTEGER); CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT,revision INTEGER);');
  await db.prepare("INSERT INTO documents(namespace,key,value,revision) VALUES('settings','access',?,1)").bind(JSON.stringify({revision:1,experienceLocales:{}})).run();
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
  const deferred={...input,id:'d'.repeat(64),revision:1,deliverySequence:1,removed:[],knownTaskIds:[]};
  r=await call(deferred);body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.tasks.length,1);
  assert.equal((await call(deferred)).status,200);assert.equal((await call({...deferred,goal:'altered replay'})).status,409);
  const later={...deferred,deliverySequence:2,knownTaskIds:body.tasks.map(t=>t.id),tasks:[{...deferred.tasks[0],id:'todo:22222222-2222-4222-8222-222222222222',content:'完成連線後補派',due:'2026-10-26'}]};
  assert.equal((await call(later)).status,200);assert.equal((await call(later)).status,200);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM work_items').first()).n,3);
  assert.equal((await call({...later,deliverySequence:0})).status,400);
  // Historical meetings can be delivered after their original deadlines. The
  // real task model must validate the original range before the atomic batch.
  const pastMeeting='2020-01-13',pastDue='2020-01-20';
  const oldTask={...input.tasks[0],due:pastDue};
  const historical={...input,id:'e'.repeat(64),date:pastMeeting,tasks:[oldTask]};
  r=await call(historical);body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
  const historicalId=body.tasks[0].id;
  const readTask=async id=>JSON.parse((await db.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first()).value);
  let historicalTask=await readTask(historicalId);
  assert.equal(historicalTask.startDate,pastMeeting);assert.equal(historicalTask.initialStartDate,pastMeeting);assert.equal(historicalTask.sourceDate,pastMeeting);assert.equal(historicalTask.dueDate,pastDue);
  assert.equal(historicalTask.dueAt,pastDue+'T23:59:59+08:00');
  const countBeforeReplay=(await db.prepare('SELECT count(*) AS n FROM work_items').first()).n;
  assert.equal((await call(historical)).status,200);assert.equal((await db.prepare('SELECT count(*) AS n FROM work_items').first()).n,countBeforeReplay);
  const delayed={...historical,id:'f'.repeat(64),revision:91,deliverySequence:1,removed:[],knownTaskIds:[],tasks:Array.from({length:4},(_,i)=>({...oldTask,id:'todo:'+String(i+3).repeat(8)+'-'+String(i+3).repeat(4)+'-'+String(i+3).repeat(4)+'-'+String(i+3).repeat(4)+'-'+String(i+3).repeat(12),content:'Historical assigned item '+(i+1),due:i===2?pastDue:'2030-10-31'}))};
  r=await call(delayed);body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.tasks.length,4);
  const deliveredIds=body.tasks.map(t=>t.id);assert.equal(new Set(deliveredIds).size,4);
  for(const [index,id]of deliveredIds.entries()){const task=await readTask(id);assert.equal(task.startDate,pastMeeting);assert.equal(task.initialStartDate,pastMeeting);assert.equal(task.sourceDate,pastMeeting);assert.equal(task.dueDate,delayed.tasks[index].due);assert.equal(task.meetingSource.todoId,delayed.tasks[index].id);}
  const frozen=JSON.stringify(await Promise.all(deliveredIds.map(readTask)));
  assert.equal((await call(delayed)).status,200);assert.equal(JSON.stringify(await Promise.all(deliveredIds.map(readTask))),frozen,'A repeated frozen delivery must not recreate or rewrite any of the four tasks');
  assert.equal((await call({...delayed,date:'2020-01-14'})).status,409,'A changed replay still conflicts with its original receipt');
  const invalidRange={...historical,id:'9'.repeat(64),tasks:[{...oldTask,due:'2020-01-12'}]};
  assert.equal((await call(invalidRange)).status,400,'Deadlines before the actual meeting start remain invalid');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM meeting_task_receipts WHERE id=?').bind(invalidRange.id).first()).n,0);
  console.log('Historical initial and deferred delivery: original start/deadline, four-item atomic creation, stable replay, changed-replay rejection and invalid-range protection passed.');
  if(names.includes('meeting-task-progress.mjs')){
   await db.prepare("UPDATE documents SET value=? WHERE namespace='settings' AND key='access'").bind(JSON.stringify({revision:2,experienceLocales:{'111':'en'}})).run();
   const query={tenantKey:'fixture',contract:'meeting-live-task-progress-v1',id:input.id,host:input.host,viewer:{account:'111'},todoIds:[input.tasks[0].id]};
   const taskRow=await db.prepare('SELECT id,value FROM work_items WHERE json_extract(value,\'$.meetingSource.todoId\')=?').bind(input.tasks[0].id).first(),task=JSON.parse(taskRow.value),original=taskRow.value;
   task.status='done';task.finalResult='完整 Worker 合成成果與附件依據';await db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(task),taskRow.id).run();
   let pr=await call(query,true,'meeting-progress');assert.equal(pr.status,200);let p=await pr.json();assert.equal(p.items[0].status,'done');assert.equal(p.items[0].result,task.finalResult);assert(p.items[0].url.endsWith('/?task='+taskRow.id));
   p=await (await call({...query,viewer:{account:'not-authorized'}},true,'meeting-progress')).json();assert.equal(p.items[0].result,'');assert(p.items[0].evidenceRestricted);
   task.finalResult='';await db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(task),taskRow.id).run();p=await (await call(query,true,'meeting-progress')).json();assert.equal(p.items[0].status,'pending_confirmation');
   task.status='in_progress';await db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(task),taskRow.id).run();p=await (await call(query,true,'meeting-progress')).json();assert.equal(p.items[0].status,'in_progress');
   assert.equal(JSON.parse((await db.prepare('SELECT value FROM work_items WHERE id=?').bind(taskRow.id).first()).value).finalResult,'');
   assert.equal((await call(query,false,'meeting-progress')).status,401);assert.equal((await call({...query,tenantKey:'other'},true,'meeting-progress')).status,403);
   await db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(original,taskRow.id).run();
   console.log('Progress read through full original authenticated Worker + real D1: original task IDs/links, task-model evidence permissions, missing-result confirmation and reopening passed.');
  }
  fs.writeFileSync(folder+'/worker-tests.private.json',JSON.stringify({passed:true,realWorkerd:true,realD1:true,fullLiveWorker:true,tests:['service auth','tenant scope','required deadline','real task creation','same request replay','receipt conflict','personal task owner/due/source','active person lookup','deferred delivery sequence at same meeting revision','later connected recipient without duplicate task','past-due initial delivery','past-due four-item deferred batch','original start and deadline','frozen four-item replay unchanged','invalid historical range rejected',...names.includes('meeting-task-progress.mjs')?['read-only live progress','original task evidence permissions','completion evidence','reopening']:[]]},null,2));
  console.log('Complete live Worker + real workerd/D1: authenticated meeting task creation, real task model, assignee/deadline/source, atomic receipt and duplicate protection passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

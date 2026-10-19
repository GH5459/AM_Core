const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const folder=process.argv[2],runtime=require(process.argv[3]||'miniflare');
(async()=>{
 const candidate=folder+'/candidate',modules=fs.readdirSync(candidate).filter(n=>n.endsWith('.mjs')).map(n=>({type:'ESModule',path:candidate+'/'+n,contents:fs.readFileSync(candidate+'/'+n,'utf8')}));
 const main=modules.find(m=>m.path.endsWith('/worker.mjs')),core=main.contents.match(/memoryTaskService\((dailylogExecutionRelease\.core),/);assert(core);
 main.contents+='\nexport {assignmentMachine as testMachine,memoryTaskService as testMemory};\nexport const testCore='+core[1]+';';
 const entry=`import {testMachine,testMemory,testCore} from './worker.mjs';
 const people=['111','222','333'].map(account=>({account,name:account,id:'uof:'+account,team:'合成',teamId:'fixture'}));
 export default {fetch(request,env){let revoked=false;const allowed=a=>people.some(p=>p.account===a)&&!(a==='333'&&(revoked||request.headers.has('x-disabled')));
 return testMachine(request,env,{now:()=>1792375200000,directory:async()=>{if(request.headers.has('x-outage'))throw Error('unavailable');return {people,assertCurrent:async()=>{if(request.headers.has('x-late-disabled'))revoked=true;}};},permission:allowed,makeService:m=>testMemory(testCore,m.people,()=>1792375200000,allowed),publish:()=>{}});}};`;
 const options={workers:[{name:'eligibility-test',modules:[{type:'ESModule',path:candidate+'/entry.mjs',contents:entry},...modules],modulesRoot:candidate,compatibilityDate:'2026-10-06',bindings:{LEAF_TASK_SERVICE_KEY:'synthetic-task-key'.repeat(3),LEAF_TASK_TENANT:'fixture',PUBLIC_ORIGIN:'https://fixture.example'},d1Databases:['DB']}]};const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB'),now=1792375200000,key='synthetic-task-key'.repeat(3),policy='line-task-silent-ineligible-v1';
  await db.exec("CREATE TABLE line_assignment_intake(id TEXT PRIMARY KEY,tenant TEXT,input_hash TEXT,input TEXT,result TEXT,state TEXT DEFAULT 'queued',created_at INTEGER,lease_token TEXT,lease_until INTEGER DEFAULT 0,notified INTEGER DEFAULT 0,attempts INTEGER DEFAULT 0,next_attempt INTEGER DEFAULT 0); CREATE TABLE work_items(id TEXT PRIMARY KEY,level INTEGER,department TEXT,department_id TEXT,value TEXT,revision INTEGER); CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT,revision INTEGER,PRIMARY KEY(namespace,key));");
  const call=(op,value={},headers={},auth=true)=>mf.dispatchFetch('https://fixture/api/integrations/leaf-snail/tasks/'+op,{method:'POST',headers:{'Content-Type':'application/json',...auth?{Authorization:'Bearer '+key}:{},...headers},body:JSON.stringify({tenantKey:'fixture',...value})});
  let n=0;async function seed(state='judged'){
   const id=crypto.createHash('sha256').update(String(++n)).digest('hex'),who=(account,i)=>({account,userId:'U'+String(i).repeat(32),bindingId:'binding-'+account});
   const input={tenantKey:'fixture',id,eventId:'event-'+n,messageId:'message-'+n,groupId:'C'+'4'.repeat(32),sender:who('111',1),mentions:[who('222',2),who('333',3)],text:'@甲 @乙 請整理清單',timestamp:now-1000},encoded=JSON.stringify(input),result={assignments:[{title:'整理清單',description:'整理明確事項',recipientAccounts:['222']}]};
   await db.prepare('INSERT INTO line_assignment_intake(id,tenant,input_hash,input,result,state,created_at,lease_token,lease_until) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,'fixture',crypto.createHash('sha256').update(encoded).digest('hex'),encoded,JSON.stringify(result),state,now,'lease-'+id,now+90000).run();return {input,id,leaseToken:'lease-'+id,policy};
  }
  const a=await seed();assert.equal((await call('suppress',a,{},false)).status,401);assert.equal((await call('suppress',{...a,tenantKey:'other'})).status,403);assert.equal((await call('suppress',{...a,leaseToken:'wrong'})).status,409);
  assert.equal((await call('issue',a,{'x-disabled':'1'})).status,403,'Even an unselected mentioned recipient disables the entire issue');
  assert.equal((await call('suppress',a)).status,200);assert.equal((await call('suppress',a)).status,200);assert.equal((await call('issue',a)).status,409);assert.equal((await call('intake',a.input)).status,200);assert.equal((await db.prepare('SELECT state FROM line_assignment_intake WHERE id=?').bind(a.id).first()).state,'suppressed');assert.equal((await (await call('next')).json()).job,null);
  const b=await seed('queued');assert.equal((await call('suppress',b)).status,200);
  const c=await seed();assert.equal((await call('issue',c,{'x-late-disabled':'1'})).status,403);assert.equal((await call('suppress',c)).status,200);assert.equal((await db.prepare('SELECT count(*) n FROM work_items').first()).n,0);
  const d=await seed();assert.equal((await call('issue',d,{'x-outage':'1'})).status,503);assert.equal((await db.prepare('SELECT state FROM line_assignment_intake WHERE id=?').bind(d.id).first()).state,'judged');
  let r=await call('issue',d);assert.equal(r.status,200,await r.text());assert.equal((await db.prepare('SELECT count(*) n FROM work_items').first()).n,1);const before=JSON.stringify((await db.prepare('SELECT * FROM work_items').all()).results);assert.equal((await call('suppress',d)).status,409);assert.equal(JSON.stringify((await db.prepare('SELECT * FROM work_items').all()).results),before);
  const p=await call('meeting-person',{account:'333'},{'x-disabled':'1'});assert.equal((await p.json()).person,null);
  fs.writeFileSync(folder+'/eligibility-worker-tests.private.json',JSON.stringify({passed:true,fullLiveWorker:true,realWorkerd:true,realD1:true,checks:['authentication','tenant','lease','mixed recipients including unselected','queued suppression','judged suppression','terminal replay after grant','late revocation','outage retry','eligible issue','issued work untouched','current eligibility']},null,2));
  console.log('Full Worker / workerd / D1: 12 task eligibility and suppression checks passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

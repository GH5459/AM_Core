const fs=require('fs'),path=require('path'),assert=require('assert/strict'),runtime=require(process.argv[3]||'miniflare'),folder=process.argv[2];
(async()=>{
 const root=folder+'/dailylog/candidate',files=fs.readdirSync(root).filter(f=>f.endsWith('.mjs'));
 const modules=files.map(name=>({type:'ESModule',path:root+'/'+name,contents:fs.readFileSync(root+'/'+name,'utf8')+(name==='worker.mjs'?'\nexport {assignmentMachine as meetingSharingTest};':'')}));
 const entry=`import {meetingSharingTest} from './worker.mjs';export default {fetch(request,env){return meetingSharingTest(request,env,{directory:async()=>{throw Error('Do not substitute the enabled work directory for central personnel');},permission:()=>false});}};`;
 const snapshot={schemaVersion:1,revision:7,fetchedAt:new Date().toISOString(),employees:[{account:'111',name:'主持人',department:'公司',userType:'Employee'},{account:'222',name:'同名夥伴',department:'工程',userType:'Employee'},{account:'333',name:'同名夥伴',department:'營運',userType:'Employee'}]};
 const options={workers:[{name:'sharing-test',modules:[{type:'ESModule',path:root+'/sharing-entry.mjs',contents:entry},...modules],modulesRoot:root,compatibilityDate:'2026-10-06',bindings:{LEAF_TASK_SERVICE_KEY:'sharing-synthetic-key'.repeat(3),LEAF_TASK_TENANT:'fixture',CENTRAL_DIRECTORY_REQUIRED:'true'},d1Databases:['DB'],serviceBindings:{PERSONNEL_DIRECTORY:async()=>Response.json({valid:true,revision:7})}}]};const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT,revision INTEGER);');
  const insert=(namespace,key,value)=>db.prepare('INSERT INTO documents VALUES(?,?,?,1)').bind(namespace,key,JSON.stringify(value)).run();
  await insert('central-personnel','snapshot',snapshot);await insert('settings','organization',{departments:[{id:'root',parentId:null,name:'公司'},{id:'eng',parentId:'root',name:'工程'},{id:'ops',parentId:'root',name:'營運'}],people:[{account:'111',affiliations:[{departmentId:'root'}]},{account:'222',affiliations:[{departmentId:'eng'}]},{account:'333',affiliations:[{departmentId:'ops'}]},{account:'999',name:'停用',affiliations:[{departmentId:'ops'}]}]});
  const call=(op,account='111',auth=true,tenant='fixture')=>mf.dispatchFetch('https://fixture/api/integrations/leaf-snail/tasks/'+op,{method:'POST',headers:{'Content-Type':'application/json',...auth?{Authorization:'Bearer '+'sharing-synthetic-key'.repeat(3)}:{}},body:JSON.stringify({account,tenantKey:tenant})});
  assert.equal((await call('meeting-sharing-directory','111',false)).status,401);assert.equal((await call('meeting-sharing-directory','111',true,'other')).status,403);
  let r=await call('meeting-sharing-directory'),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.organization.people.length,3);assert.equal(body.organization.departments.find(d=>d.id==='eng').parentId,'root');assert.equal(body.organization.people.filter(p=>p.name==='同名夥伴').length,2);assert(!JSON.stringify(body).includes('999'));
  assert.equal((await call('meeting-sharing-directory','999')).status,403);
  assert.equal((await(await call('meeting-sharing-person','333')).json()).person.name,'同名夥伴');assert.equal((await(await call('meeting-sharing-person','999')).json()).person,null);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM documents').first()).n,2,'Reading the current cached authority does not write work/task/settings data');
  console.log('Complete Worker + workerd/D1: service/tenant auth, actual central personnel service/cache, organization hierarchy, same-name distinct accounts, work-disabled active colleagues, inactive rejection and minimal read-only sharing directory passed.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

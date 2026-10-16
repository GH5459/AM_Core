const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.DAILYLOG_ROUTINE_PACKAGE='.dailylog-data/line-task-edit-release-20261016';
const {fixture}=require('./routine-tabs.worker.test.cjs');
const key='synthetic-photo-service-key-at-least-32-bytes',group='C'+'1'.repeat(32),user='U'+'2'.repeat(32),id='a'.repeat(64),messageId='12345678901234567';
test('quoted-image upload uses source quote, original sender and same task; replay, removed file, edit link, ACL and expiry independent of interactive session',async()=>{
 const a=await fixture({extraBindings:{LEAF_TASK_SERVICE_KEY:key,LEAF_TASK_TENANT:'fixture'}});
 try{
 await a.db.prepare('CREATE TABLE IF NOT EXISTS line_assignment_intake(id TEXT PRIMARY KEY,tenant TEXT,state TEXT,input TEXT,result TEXT)').run();
 const task=(await(await a.send('900003','/api/tasks',{id:'work-'+crypto.randomUUID(),title:'隔離交辦',description:'補充內容',sourceDate:'2026-10-16',leadAccount:'900001',collaboratorAccounts:[],level:1,workSchema:2,workSource:'assigned'})).json()).task;assert(task);
 const row=await a.db.prepare('SELECT value FROM work_items WHERE id=?').bind(task.id).first(),stored=JSON.parse(row.value);stored.assignment={sourceId:id,assignmentState:'issued',detailsState:'needs_requester_details'};
 await a.db.prepare('UPDATE work_items SET value=? WHERE id=?').bind(JSON.stringify(stored),task.id).run();
 const unchanged=JSON.stringify(stored),source={sender:{userId:user,account:'900003',bindingId:'fixture-original'},mentions:[{userId:'U'+'3'.repeat(32),account:'900001',bindingId:'fixture-recipient'}],groupId:group,quotedMessageId:messageId,timestamp:Date.now()};
 await a.db.prepare('INSERT INTO line_assignment_intake VALUES(?,?,?,?,?)').bind(id,'fixture','issued',JSON.stringify(source),JSON.stringify({taskIds:[task.id]})).run();
 const context={tenantKey:'fixture',id,groupId:group,userId:user,account:'900003',bindingId:'fixture-original',taskId:task.id,messageId};
 const api=async(action,extra={},file=null,auth=key)=>{let body=JSON.stringify({...context,...extra}),headers={Authorization:'Bearer '+auth,'Content-Type':'application/json'};if(file){const form=new FormData();form.set('context',body);form.set('file',file);const request=new Request('http://example.test',{method:'POST',body:form});headers['Content-Type']=request.headers.get('Content-Type');body=await request.arrayBuffer();}return a.mf.dispatchFetch('http://example.test/api/integrations/leaf-snail/tasks/photos/'+action,{method:'POST',headers,body});};
 assert.equal((await api('quoted-status',{},null,'wrong')).status,401);assert.equal((await api('quoted-status')).status,403);
 assert.equal((await api('configure',{enabled:true})).status,200);
 assert.equal((await api('quoted-status',{messageId:'99999999999999999'})).status,403);
 assert.equal((await api('quoted-status',{userId:'U'+'3'.repeat(32),account:'900001'})).status,403);
 assert.equal((await api('quoted-status',{groupId:'C'+'4'.repeat(32)})).status,403);
 assert.equal((await api('quoted-status',{taskId:'work-other'})).status,403);
 assert.equal((await api('quoted-upload',{},new File(['bad'],'bad.png',{type:'image/png'}))).status,400);
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),file=()=>new File([bytes],'引用圖.png',{type:'image/png'});
 for(let i=0;i<2;i++){const r=await api('quoted-upload',{},file());assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).imported,true);}
 assert.equal((await a.db.prepare('SELECT count(*) n FROM task_attachments').first()).n,1);
 assert.equal((await a.db.prepare("SELECT count(*) n FROM documents WHERE namespace='line-task-photos' AND key<> 'pilot:fixture'").first()).n,0,'no waiting session');
 const files=(await(await a.send('900001','/api/attachments/normal/'+task.id)).json()).attachments;assert.equal(files.length,1);
 const download=await a.send('900001','/api/attachments/normal/'+task.id+'/'+files[0].id);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 assert([403,404].includes((await a.send('900002','/api/tasks/'+task.id)).status));
 const taskPath='/?task='+task.id+'&openExternalBrowser=1';let r=await a.mf.dispatchFetch('http://example.test'+taskPath,{redirect:'manual'});assert.equal(r.status,303);const login=new URL(r.headers.get('Location'),'http://example.test');assert.equal(login.searchParams.get('returnTo'),'/?task='+task.id);
 r=await a.send('900003',login.pathname+login.search);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/?task='+task.id);
 assert.equal((await a.send('900003','/?task='+task.id)).status,200);
 assert.equal((await a.db.prepare('SELECT value FROM work_items WHERE id=?').bind(task.id).first()).value,unchanged,'no work completion/change');
 await a.db.prepare("UPDATE task_attachments SET removed_at='2026-10-16' WHERE id=?").bind(files[0].id).run();assert.equal((await(await api('quoted-upload',{},file())).json()).removed,true);assert.equal((await a.db.prepare('SELECT removed_at FROM task_attachments WHERE id=?').bind(files[0].id).first()).removed_at,'2026-10-16');
 source.sourceRemoved=true;await a.db.prepare('UPDATE line_assignment_intake SET input=? WHERE id=?').bind(JSON.stringify(source),id).run();assert.equal((await api('quoted-status')).status,409);delete source.sourceRemoved;await a.db.prepare('UPDATE line_assignment_intake SET input=? WHERE id=?').bind(JSON.stringify(source),id).run();
 a.access.accounts['900003'].enabled=false;a.access.accounts['900003'].standardEnabled=false;await a.updateAccess();assert.equal((await api('quoted-status')).status,403);
 }finally{await a.close();}
});
test('task return destinations reject external, malformed and additional actions',async()=>{const {taskReturnPath}=await import('../cloudflare/line-task-edit-entry.mjs');assert.equal(taskReturnPath('/?task=work-example&openExternalBrowser=1'),'/?task=work-example');for(const v of ['https://evil.test/?task=a','//evil.test/?task=a','/\\evil.test/?task=a','/?task=a&returnTo=https://evil.test','/?task=a#x','/admin?task=a','/?task=a%2Fb',null])assert.equal(taskReturnPath(v),null,String(v));});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function once(s,a,b){assert.equal(s.split(a).length,2,'Baseline differs: '+a.slice(0,100));return s.replace(a,b);}
function section(s,start,end,change){const a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,'Section missing');return s.slice(0,a)+change(s.slice(a,b))+s.slice(b);}
function transformWorker(name,source){let s=source;assert(!s.includes("from './entry-speed.mjs'"),'Already transformed');
 if(name==='dailylog'){
  s="import {dailyEntryFetch,taskDeliveryJobs} from './entry-speed.mjs';\n"+s;
  s=once(s,'continuation_worker as default','entry_speed_worker as default');
  s+='\nconst entry_speed_worker={...continuation_worker,fetch:async(request,env,ctx)=>await dailyEntryFetch(request,env,ctx,continuation_worker)||continuation_worker.fetch(request,env,ctx)};\n';
  s=section(s,'  function createUnifiedCloudTasks2(env, canUse, now, membersSnapshot, legacyCore, authority2 = {}) {','  __name(createUnifiedCloudTasks2,',part=>{
   part=once(part,'      for (const todo of Object.values(snapshot2?.todos || {})) {',`      const imported=await db.prepare("SELECT json_extract(value,'$.sourceTodoId') AS todo FROM work_items WHERE json_extract(value,'$.requester.account')=? AND json_extract(value,'$.sourceTodoId') IS NOT NULL").bind(user.account).all();
      const importedTodos=new Set(imported.results.map(r=>r.todo));
      for (const todo of Object.values(snapshot2?.todos || {})) {`);
   part=once(part,`if (await db.prepare("SELECT id FROM work_items WHERE json_extract(value,'$.requester.account')=? AND json_extract(value,'$.sourceTodoId')=?").bind(user.account, todo.id).first()) continue;`,'if (importedTodos.has(todo.id)) continue;');
   part=once(part,'const result = await Promise.all(visible.map((t) => present(user, t, visible)));','await ensureTaskSharing(db,visible);\n        const result = await Promise.all(visible.map((t) => present(user, t, visible)));');
   return part;
  });
  s=section(s,'async function assertTaskSharingRead(', '__name(assertTaskSharingRead,',part=>{
   part=once(part,'  for (const row of rows2.results) {','  const fresh=await hydrateTaskSharing(env.DB,rows2.results.map(row=>JSON.parse(row.value)));\n  for (const row of fresh) {');
   part=once(part,'const current = await readSharedTask(env.DB, row.id), expected = targets.get(row.id);','const current = row, expected = targets.get(row.id);');
   return once(part,'\n  }\n}', '\n  }\n  await assertSharingVersions(env.DB,fresh,true);\n}');
  });
  s=once(s,'function createCloudTaskNotionSync(env, canUse, fetchApi = fetch, now = Date.now) {','function createCloudTaskNotionSync(env, canUse, fetchApi = fetch, now = Date.now, readJobs = null) {');
  s=section(s,'function createCloudTaskNotionSync(', '__name(createCloudTaskNotionSync,',part=>once(part,'(await readDocument2222222(db, namespace, key))?.value || null','readJobs ? readJobs.get(key) || null : (await readDocument2222222(db, namespace, key))?.value || null'));
  s=once(s,'if (request.method === "GET") return taskResponse({ tasks: await Promise.all((await tasks.list(user)).map(decorate3)) });',`if (request.method === "GET") {
              const listed=await tasks.list(user),jobs=await taskDeliveryJobs(env.DB,listed),statusReader=createCloudTaskNotionSync(env,async()=>false,fetchApi,now,jobs);
              return taskResponse({tasks:await Promise.all(listed.map(async task=>({...task,notionSync:await statusReader.status(task)})))});
            }`);
 }else if(name==='uof-line-cloud'){
  s="import {reviewBootstrap} from './entry-speed.mjs';\nimport entryReviewHtml from './entry-review.mjs';\n"+s;
  s=once(s,'    return env.APP.get(env.APP.idFromName("uof-line-production")).fetch(request);',`    const app=env.APP.get(env.APP.idFromName("uof-line-production"));
    if(path==='/api/uof-review/bootstrap'&&request.method==='GET')return reviewBootstrap(request,app);
    const response=await app.fetch(request);
    if(path==='/Line/Review'&&request.method==='GET'&&response.ok&&response.headers.get('Content-Type')?.includes('text/html')){
      const text=await response.text(),headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('ETag');
      return new Response(text===webReviewHtml?entryReviewHtml:text,{status:response.status,headers});
    }
    return response;`);
 }else throw Error('Unknown target');return s;
}
function transformReview(source){let html=JSON.parse(source.trim().slice('export default '.length).replace(/;$/,''));
 html=once(html,'async function refresh({keepView=false}={})','async function refresh({keepView=false,bootstrap=null}={})');
 html=once(html,"const data=await api('/api/uof-review/web-pending');","const data=bootstrap||await api('/api/uof-review/web-pending');if(data.pendingError)throw Object.assign(Error(data.pendingError.message),{status:data.pendingError.status});");
 html=once(html,"async function connect(){try{S.session=await api('/api/uof-review/session');", "async function connect(){try{S.session=await api(demo?'/api/uof-review/session':'/api/uof-review/bootstrap');");
 html=once(html,'await refresh();const saved=loadRecord();', 'await refresh({bootstrap:S.session.pending||S.session.pendingError?S.session.pending||{pendingError:S.session.pendingError}:null});delete S.session.pending;delete S.session.pendingError;const saved=loadRecord();');
 return 'export default '+JSON.stringify(html)+';\n';
}
module.exports={transformWorker,transformReview};
if(require.main===module){const [name,baseline,out]=process.argv.slice(2);assert(path.isAbsolute(baseline)&&path.isAbsolute(out),'Absolute private paths required');assert(!fs.existsSync(out),'New output required');fs.cpSync(baseline,out,{recursive:true,errorOnExist:true});fs.writeFileSync(path.join(out,'worker.mjs'),transformWorker(name,fs.readFileSync(path.join(baseline,'worker.mjs'),'utf8')));fs.copyFileSync(path.join(__dirname,'entry-speed.mjs'),path.join(out,'entry-speed.mjs'));if(name==='uof-line-cloud')fs.writeFileSync(path.join(out,'entry-review.mjs'),transformReview(fs.readFileSync(path.join(baseline,'assets/review.mjs'),'utf8')));}

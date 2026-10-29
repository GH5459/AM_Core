const assert=require('node:assert/strict');
function once(s,a,b){assert.equal(s.split(a).length,2,'Live source changed: '+a.slice(0,90));return s.replace(a,b);}
exports.patchEntry=s=>once(s,"if(destination.origin===target.origin&&destination.pathname==='/login')return", "if(destination.origin===target.origin&&destination.pathname==='/login'&&url.searchParams.get('afterConnect')!=='1')return");
exports.patchWorker=function(s){
 s=once(s,'async function register(user) {','async function register(user, suppliedProfile) {');
 s=once(s,'const values = await profile(env, user, state2);','const values = suppliedProfile || await profile(env, user, state2);');
 s=once(s,'const entryBootstrap=async()=>{await register(session3.user);return "window.DAILYLOG_AUTH = " + safe({ ...await profile(env, session3.user, state2),','const entryBootstrap=async()=>{const values=await profile(env,session3.user,state2);await register(session3.user,values);return "window.DAILYLOG_AUTH = " + safe({ ...values,');
 // Request-local measurements preserve every existing operation and check.
 const timed=(name,expression)=>`await (env.ENTRY_TASK_MEASURE||((_,fn)=>fn()))('${name}',async()=>${expression})`;
 for(const [a,b] of [
 ['const directory = createDirectory2(env, now), members22 = await directory.read(), enabled = new Set(members22.people.map((p) => p.account));','const directory = createDirectory2(env, now), members22 = '+timed('directory','directory.read()')+', enabled = new Set(members22.people.map((p) => p.account));'],
 ['await importOwn(user);\n        const visible = await filterHrTasks(env, user, await service.list(user));',timed('import','importOwn(user)')+';\n        const visible = await filterHrTasks(env, user, await service.list(user));'],
 ['const visible = await filterHrTasks(env, user, await service.list(user));',`const coreList=${timed('core_list','service.list(user)')};const visible=${timed('hr_filter','filterHrTasks(env,user,coreList)')};`],
 ['await ensureTaskSharing(db,visible);',timed('sharing','ensureTaskSharing(db,visible)')+';'],
 ['const relations=await taskRelations(db,visible,hydrateTaskSharing);','const relations='+timed('relations','taskRelations(db,visible,hydrateTaskSharing)')+';'],
 ['const result = await Promise.all(visible.map((t) => present(user, t, visible,relations)));','const result = '+timed('presentation','Promise.all(visible.map((t)=>present(user,t,visible,relations)))')+';'],
 ['await assertSharingVersions(db,[...relations.values()],true);',timed('sharing_versions','assertSharingVersions(db,[...relations.values()],true)')+';'],
 ['const user = { ...session3.user, ...(await profile(env, session3.user, state2)).profile };','const user = { ...session3.user, ...('+timed('profile','profile(env,session3.user,state2)')+').profile };'],
 ['const listed=await tasks.list(user),jobs=await taskDeliveryJobs(env.DB,listed),statusReader=',`const listed=${timed('list_total','tasks.list(user)')},jobs=${timed('delivery_jobs','taskDeliveryJobs(env.DB,listed)')},statusReader=`],
 ['await authority2.assertCurrent();\n            await assertTaskSharingRead(env, body2, user.account);',timed('final_authority','authority2.assertCurrent()')+';\n            '+timed('final_sharing','assertTaskSharingRead(env,body2,user.account)')+';']
 ]){const count=s.split(a).length-1;if(a.startsWith('await importOwn(user);')||a.startsWith('const visible = await filterHrTasks')){assert.equal(count,a.startsWith('const visible')?3:2);s=s.replaceAll(a,b);}else s=once(s,a,b);}
 const defaults=[...s.matchAll(/\b([A-Za-z_$][\w$]*)\s+as\s+default\b/g)];assert.equal(defaults.length,1);const prior=defaults[0][1];
 s=once(s,prior+' as default','entry_measured_worker as default');
 s+=`\nconst entry_measured_worker={...${prior},async fetch(request,env,ctx){if(request.method!=='GET'||new URL(request.url).pathname!=='/api/tasks')return ${prior}.fetch(request,env,ctx);const times=[],start=performance.now();const measure=async(name,fn)=>{const t=performance.now();try{return await fn();}finally{times.push(name+';dur='+(performance.now()-t).toFixed(1));}};const response=await ${prior}.fetch(request,{...env,ENTRY_TASK_MEASURE:measure},ctx);if(response.status!==200)return response;const headers=new Headers(response.headers);headers.set('Server-Timing',times.concat('total;dur='+(performance.now()-start).toFixed(1)).join(', '));headers.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,headers});}};\n`;
 return s;
};
exports.patchDetail=function(s){
 const timed=(name,expression)=>`await (env.ENTRY_TASK_MEASURE||((_,fn)=>fn()))('${name}',async()=>${expression})`;
 s=once(s,'const stateResult = await accessState(env), state2 = stateResult.state;','const stateResult = '+timed('initial_access','accessState(env)')+', state2 = stateResult.state;');
 const query='db.prepare("SELECT token_hash,csrf,user_json,expires_at FROM sessions WHERE token_hash=? AND expires_at>?").bind(await hash222(token), now()).first()';
 s=once(s,'const row = await '+query+';','const row = '+timed('session_read',query)+';');
 s=once(s,'const tokenHash = await hash4(token), [state2, remote2] = await Promise.all([localState(env, tokenHash), remoteState(env)]), identity = authorized(env, state2, remote2);','const tokenHash = await hash4(token), [state2, remote2] = '+timed('shared_authority','Promise.all([localState(env, tokenHash), remoteState(env)])')+', identity = authorized(env, state2, remote2);');
 s=once(s,'await taskOriginsResponse(request,await line_completion_report_worker.fetch(request,env,ctx),env)', 'await (async()=>{const response=await line_completion_report_worker.fetch(request,env,ctx);return '+timed('origin_enrichment','taskOriginsResponse(request,response,env)')+';})()');
 return s;
};

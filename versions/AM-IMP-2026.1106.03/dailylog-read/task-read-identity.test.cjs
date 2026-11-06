const test=require('node:test'),assert=require('node:assert/strict');
const helper=()=>import('./task-read-identity.mjs');
const request=(cookie='one')=>new Request('https://example.test/api/tasks',{headers:{Cookie:cookie}});
test('private identity uses the original guarded session path and transfers objects without JSON',async()=>{
 const h=await helper(),auth={authenticated:true,user:{id:'one',account:'1'}};let seen;
 const result=await h.readTaskIdentity({fetch:async(r,e,c)=>{seen=r;assert.equal(r.url,'https://example.test/api/auth/session');assert.equal(r.method,'GET');assert.equal(r.headers.get('Cookie'),'one');assert(h.requestsTaskReadIdentity(r));assert.equal(e,'env');assert.equal(c,'ctx');return h.captureTaskReadIdentity(r,auth);}},request(),'env','ctx');
 assert.equal(result.response.status,204);assert.equal(await result.response.text(),'');assert.equal(result.auth,auth);assert(!h.requestsTaskReadIdentity(seen));
});
test('external headers and clones do not possess the private capability',async()=>{
 const h=await helper(),r=new Request('https://example.test/api/auth/session',{headers:{'X-Task-Read-Identity':'true'}});
 assert(!h.requestsTaskReadIdentity(r));assert.equal(h.captureTaskReadIdentity(r,{authenticated:true}),null);
 await h.readTaskIdentity({fetch:async internal=>{assert(!h.requestsTaskReadIdentity(internal.clone()));return h.captureTaskReadIdentity(internal,{authenticated:false});}},request());
});
test('ordinary session JSON remains a safe fallback for wrappers that replace the Request',async()=>{
 const h=await helper(),auth={authenticated:true,user:{account:'2'},supervision:{available:true}};
 const result=await h.readTaskIdentity({fetch:async internal=>{assert(!h.requestsTaskReadIdentity(new Request(internal)));return Response.json(auth);}},request());assert.deepEqual(result.auth,auth);assert.equal(result.response.status,200);
});
test('failure responses retain their status and body instead of manufacturing identity',async()=>{
 const h=await helper(),response=Response.json({error:'denied'},{status:403});
 const result=await h.readTaskIdentity({fetch:async()=>response},request());assert.equal(result.response,response);assert.equal(result.auth,undefined);assert.deepEqual(await result.response.json(),{error:'denied'});
});
test('a final 200 unauthenticated response overrides an earlier capture',async()=>{
 const h=await helper();const result=await h.readTaskIdentity({fetch:async r=>{h.captureTaskReadIdentity(r,{authenticated:true,user:{account:'1'}});return Response.json({authenticated:false});}},request());assert.deepEqual(result.auth,{authenticated:false});
});
test('a final 200 different identity overrides an earlier capture',async()=>{
 const h=await helper(),final={authenticated:true,user:{account:'2'}};const result=await h.readTaskIdentity({fetch:async r=>{h.captureTaskReadIdentity(r,{authenticated:true,user:{account:'1'}});return Response.json(final);}},request());assert.deepEqual(result.auth,final);
});
test('a final denial cannot expose an earlier capture',async()=>{
 const h=await helper();const result=await h.readTaskIdentity({fetch:async r=>{h.captureTaskReadIdentity(r,{authenticated:true,user:{account:'1'}});return Response.json({error:'revoked'},{status:403});}},request());assert.equal(result.auth,undefined);assert.equal(result.response.status,403);assert.deepEqual(await result.response.json(),{error:'revoked'});
});
test('an empty 204 without capture fails closed and removes the capability',async()=>{
 const h=await helper();let seen;await assert.rejects(h.readTaskIdentity({fetch:async r=>{seen=r;return new Response(null,{status:204});}},request()),/not captured/);assert(!h.requestsTaskReadIdentity(seen));
});
test('capability cleanup also occurs after errors',async()=>{
 const h=await helper();let seen;await assert.rejects(h.readTaskIdentity({fetch:async r=>{seen=r;throw Error('unavailable');}},request()),/unavailable/);assert(!h.requestsTaskReadIdentity(seen));
});
test('concurrent requests never share identity, cookies or capture state',async()=>{
 const h=await helper();let unblock;const wait=new Promise(r=>unblock=r);const base={fetch:async r=>{const account=r.headers.get('Cookie');if(account==='one')await wait;else unblock();return h.captureTaskReadIdentity(r,{authenticated:true,user:{account}});}};
 const [a,b]=await Promise.all([h.readTaskIdentity(base,request('one')),h.readTaskIdentity(base,request('two'))]);assert.equal(a.auth.user.account,'one');assert.equal(b.auth.user.account,'two');
});
test('patch rejects source drift and repeat application',()=>{
 const {patchWorker,patchMultilingual}=require('./patch-worker.cjs');assert.throws(()=>patchWorker(''),/Expected exactly one/);assert.throws(()=>patchMultilingual(''),/Expected exactly one/);
 const source="  const sessionResponse=await base.fetch(new Request(new URL('/api/auth/session',url),{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx);\n  const auth=await sessionResponse.json();";
 const changed=patchMultilingual(source);assert(changed.includes("request.method==='GET'&&taskRoute(p)"));assert(changed.includes('identity?identity.auth:await sessionResponse.json()'));assert.throws(()=>patchMultilingual(changed),/Expected exactly one/);
});
test('profile default retains supervisor behavior and lightweight reads preserve every identity field',async()=>{
 const {patchWorker}=require('./patch-worker.cjs');
 const profile=`async function profile(env, user, state2) {
  const values = (await readDocument2222222(env.DB, "profiles", user.id))?.value || {};
  const source = { name: user.name || "", team: user.team || "", title: user.title || "" };
  return { user: { id: user.id, account: user.account }, profile: Object.fromEntries(Object.keys(LIMITS).map((key) => [key, source[key] || values[key] || ""])), uof: source, access: permission(env, user.account, state2), supervision: await createCloudSupervisor(env).status(user.account) };
}`;
 const anchors="\n// readProfile:()=>measure('session_profile',()=>profile(env,session3.user,state2)),\n// return send(json3({ authenticated: !!session3.user, csrfToken: session3.csrf, configured: true, ...values }));\n// ('profile',async()=>profile(env,session3.user,state2))).profile";
 const changed=patchWorker(profile+anchors);assert.throws(()=>patchWorker(changed),/Expected exactly one/);
 let calls=0,permissions=0;
 const fn=new Function('readDocument2222222','LIMITS','permission','createCloudSupervisor',changed.slice(changed.indexOf('async function profile'),changed.indexOf('\n//'))+'\nreturn profile;')(
  async()=>({value:{name:'saved name',team:'saved team',title:'saved title'}}),{name:1,team:1,title:1},()=>{permissions++;return {enabled:true};},()=>({status:async()=>{calls++;return {available:true};}}));
 const full=await fn({DB:{}},{id:'id',account:'1',name:'session name'},{}),light=await fn({DB:{}},{id:'id',account:'1',name:'session name'},{},false);
 assert.deepEqual(full,{...light,supervision:{available:true}});assert.equal(light.profile.name,'session name');assert.equal(light.profile.team,'saved team');assert.equal(calls,1);assert.equal(permissions,2);
 assert(changed.includes("request.method!=='GET'"));assert(changed.includes('if(identityResponse)return send(identityResponse);'));
});

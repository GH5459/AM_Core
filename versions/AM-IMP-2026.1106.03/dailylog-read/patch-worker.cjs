'use strict';
function exact(source, before, after, label) {
  if (source.split(before).length !== 2) throw Error('Expected exactly one ' + label);
  return source.replace(before, after);
}
function patchWorker(source) {
  source = "import {requestsTaskReadIdentity,captureTaskReadIdentity} from './task-read-identity.mjs';\n" + source;
  source = exact(source, 'async function profile(env, user, state2) {', 'async function profile(env, user, state2, includeSupervision = true) {', 'profile definition');
  source = exact(source, 'supervision: await createCloudSupervisor(env).status(user.account) };', '...(includeSupervision ? { supervision: await createCloudSupervisor(env).status(user.account) } : {}) };', 'optional supervisor status');
  source = exact(source, "readProfile:()=>measure('session_profile',()=>profile(env,session3.user,state2)),", "readProfile:()=>measure('session_profile',()=>profile(env,session3.user,state2,!requestsTaskReadIdentity(request))),", 'session profile');
  const response = 'return send(json3({ authenticated: !!session3.user, csrfToken: session3.csrf, configured: true, ...values }));';
  source = exact(source, response, 'const identityResponse=captureTaskReadIdentity(request,{authenticated:!!session3.user,csrfToken:session3.csrf,configured:true,...values});\n          if(identityResponse)return send(identityResponse);\n          ' + response, 'private identity response');
  source = exact(source, "('profile',async()=>profile(env,session3.user,state2))).profile", "('profile',async()=>profile(env,session3.user,state2,request.method!=='GET'))).profile", 'task profile');
  return source;
}
function patchMultilingual(source) {
  source = "import {readTaskIdentity} from './task-read-identity.mjs';\n" + source;
  source = exact(source, "  const sessionResponse=await base.fetch(new Request(new URL('/api/auth/session',url),{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx);", "  const identity=request.method==='GET'&&taskRoute(p)?await readTaskIdentity(base,request,env,ctx):null;\n  const sessionResponse=identity?identity.response:await base.fetch(new Request(new URL('/api/auth/session',url),{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx);", 'multilingual session read');
  source = exact(source, '  const auth=await sessionResponse.json();', '  const auth=identity?identity.auth:await sessionResponse.json();', 'multilingual identity');
  return source;
}
module.exports = { patchWorker, patchMultilingual };

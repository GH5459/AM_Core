import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {firstScreenAssets,FIXED_FILES,VERSION_BINDING} from '../versions/AM-IMP-2026.1029.50/first-screen.mjs';
const require=createRequire(import.meta.url),{patchWorker}=require('../versions/AM-IMP-2026.1029.50/build.cjs');
const origin='https://dailylog.test',env={DAILYLOG_RUNTIME_VERSION:{id:'version-a'}};
const html='<html><head></head><main id="personalWorkspace"></main><script src="auth-client.js"></script><script>originalInline()</script><script src="/tasks.js"></script><script src="/google-config.js"></script><script src="/auth/bootstrap.js"></script><link rel="stylesheet" href="tasks.css"></html>';
test('versioned preloads preserve script order and inline/config/bootstrap behavior',async()=>{
 const r=await firstScreenAssets(new Request(origin+'/line-entry'),new Response(html,{headers:{'Content-Type':'text/html','Set-Cookie':'original','ETag':'old'}}),env),s=await r.text();
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(r.headers.get('Set-Cookie'),'original');assert.equal(r.headers.get('ETag'),null);
 assert(s.indexOf('as="script"')<s.indexOf('</head>'));
 assert.equal((s.match(/rel="preload"/g)||[]).length,2);
 assert(s.includes('href="/tasks.css?assetVersion=version-a"'));
 assert(s.includes('<script src="/google-config.js"></script>'));assert(s.includes('<script src="/auth/bootstrap.js"></script>'));
 assert(s.indexOf('<script src="/auth-client.js?')<s.indexOf('originalInline()'));assert(s.indexOf('originalInline()')<s.indexOf('<script src="/tasks.js?'));
});
test('only successful fixed code without cookies caches under the current immutable version',async()=>{
 for(const file of FIXED_FILES){const type=file.endsWith('.css')?'text/css':'text/javascript',r=await firstScreenAssets(new Request(origin+file+'?assetVersion=version-a'),new Response('fixed code',{headers:{'Content-Type':type}}),env);assert.match(r.headers.get('Cache-Control'),/^private, max-age=31536000, immutable$/);}
 assert.deepEqual(VERSION_BINDING,{type:'version_metadata',name:'DAILYLOG_RUNTIME_VERSION'});
 for(const suffix of ['','?assetVersion=version-old','?assetVersion=version-a&account=x','?assetVersion=version-a&assetVersion=version-a']){const r=await firstScreenAssets(new Request(origin+'/tasks.js'+suffix),new Response('code',{headers:{'Content-Type':'text/javascript','Cache-Control':'private, no-store'}}),env);assert.equal(r.headers.get('Cache-Control'),'private, no-store');}
 for(const headers of [{'Content-Type':'text/javascript','Set-Cookie':'session=rotated'},{'Content-Type':'text/html'}]){const r=await firstScreenAssets(new Request(origin+'/tasks.js?assetVersion=version-a'),new Response('sensitive',{headers}),env);assert.equal(r.headers.get('Cache-Control'),null);}
});
test('auth/config/data/errors/other origins never gain caching or preloading',async()=>{
 for(const path of ['/auth/bootstrap.js','/google-config.js','/api/tasks','/api/auth/session','/private-vault/data']){const r=await firstScreenAssets(new Request(origin+path+'?assetVersion=version-a'),new Response('user data',{headers:{'Content-Type':'text/javascript','Cache-Control':'private, no-store'}}),env);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(await r.text(),'user data');}
 for(const status of [302,401,403,503]){const r=await firstScreenAssets(new Request(origin+'/tasks.js?assetVersion=version-a'),new Response('denied',{status}),env);assert.equal(r.status,status);assert.equal(r.headers.get('Cache-Control'),null);}
 for(const context of [{},{DAILYLOG_RUNTIME_VERSION:{id:'bad"version'}}]){const r=await firstScreenAssets(new Request(origin+'/'),new Response(html,{headers:{'Content-Type':'text/html'}}),context);assert.equal(await r.text(),html);}
 const external=html.replace('auth-client.js','https://other.test/auth-client.js');const r=await firstScreenAssets(new Request(origin+'/'),new Response(external,{headers:{'Content-Type':'text/html'}}),env);assert((await r.text()).includes('src="https://other.test/auth-client.js"'));
});

// Execute the actual generated bootstrap against deliberately held operations.
function bootstrapFixture(state='ready'){
 const old='const entryBootstrap=async()=>{const values=await profile(env,session3.user,state2);await register(session3.user,values);return "window.DAILYLOG_AUTH = " + safe({ ...values, csrfToken: session3.csrf, cloud: true, notionSyncEnabled: true, privateNativeActive: await privateNativeProtected(env, session3.user.id), privateVaultOrigin: webVaultOrigin }) + ";";};';
 const capture="env.ENTRY_SPEED_CAPTURE_BOOTSTRAP(await entryBootstrap()+'\\nwindow.DAILYLOG_EXPERIENCE='+safe(await employeeExperience(env,session3.user.account))+';\\n');";
 const patched=patchWorker(old+'\nif(false)'+capture+'\nconst original={};export {original as default};');
 const body=patched.slice(patched.indexOf('const entryMeasure='),patched.indexOf('\nif(false)'));
 let finish;const held=new Promise(r=>{finish=r;}),started=[],pending=[];
 const values={user:{id:'fixture',account:'900003'},profile:{name:'fixture'},access:{enabled:true}};
 const context={env:{},state2:{},session3:{user:values.user,csrf:'csrf'},webVaultOrigin:'https://vault.test',safe:JSON.stringify,
  profile:async()=>{started.push('profile');return values;},privateNativeProtected:async()=>{started.push('private');return true;},
  notion:{status:async()=>{started.push('registration_status');return {state};}},register:async(user,p)=>{assert.equal(p,values);started.push('register');await held;},ctx:{waitUntil:p=>pending.push(p)}};
 vm.createContext(context);vm.runInContext(body+';this.bootstrap=entryBootstrap;',context);
 return {...context,started,pending,finish};
}
test('returning bootstrap completes with private/access fields while original registration continues',async()=>{const f=bootstrapFixture();const result=await f.bootstrap();assert(result.includes('"privateNativeActive":true'));assert(result.includes('"enabled":true'));assert.deepEqual(f.started,['profile','private','registration_status','register']);assert.equal(f.pending.length,1);f.finish();await Promise.all(f.pending);});
test('first registration is awaited before returning a new account bootstrap',async()=>{const f=bootstrapFixture('not_registered');let done=false;const p=f.bootstrap().then(()=>{done=true;});await new Promise(r=>setImmediate(r));assert.equal(done,false);assert.equal(f.pending.length,0);f.finish();await p;assert(done);});

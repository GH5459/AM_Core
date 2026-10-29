const assert=require('node:assert/strict');
function once(s,a,b){assert.equal(s.split(a).length,2,'Live source changed: '+a.slice(0,100));return s.replace(a,b);}
exports.patchFixed=s=>once(s," '/auth-client.js','/private-data.js','/private-vault-shell.js',"," '/multilingual.js','/dailylog-meetings-client.js',\n '/auth-client.js','/private-data.js','/private-vault-shell.js',");
exports.patchWorker=function(s){
 s=once(s,`if (session3.user && !session3.management) await register(session3.user);
          return send(json3({ authenticated: !!session3.user, csrfToken: session3.csrf, configured: true, ...session3.user ? await profile(env, session3.user, state2) : {} }));`,
 `const measure=env.ENTRY_SCREEN_MEASURE||((_,fn)=>fn());
          const values=await sessionBootstrap({user:session3.user,management:session3.management,
            readProfile:()=>measure('session_profile',()=>profile(env,session3.user,state2)),
            registrationStatus:()=>measure('session_registration_status',()=>notion.status(session3.user.id)),
            register:values=>register(session3.user,values),ctx});
          return send(json3({ authenticated: !!session3.user, csrfToken: session3.csrf, configured: true, ...values }));`);
 const defaults=[...s.matchAll(/\b([A-Za-z_$][\w$]*)\s+as\s+default\b/g)];assert.equal(defaults.length,1);assert(!s.includes('first_screen_session_worker'));const previous=defaults[0][1];
 return "import {sessionBootstrap,preloadGoogleConfig} from './first-screen-session.mjs';\n"+once(s,previous+' as default','first_screen_session_worker as default')+`\nconst first_screen_session_worker={...${previous},async fetch(request,env,ctx){return preloadGoogleConfig(request,await ${previous}.fetch(request,env,ctx));}};\n`;
};

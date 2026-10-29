const assert=require('node:assert/strict');
function once(s,a,b){assert.equal(s.split(a).length,2,'Live source changed: '+a.slice(0,100));return s.replace(a,b);}
exports.patchWorker=function(s){
 const old='const entryBootstrap=async()=>{const values=await profile(env,session3.user,state2);await register(session3.user,values);return "window.DAILYLOG_AUTH = " + safe({ ...values, csrfToken: session3.csrf, cloud: true, notionSyncEnabled: true, privateNativeActive: await privateNativeProtected(env,session3.user.id), privateVaultOrigin: webVaultOrigin }) + ";";};';
 // Live sources contain one harmless space in the original private guard.
 const actual=old.replace('privateNativeProtected(env,session3.user.id)','privateNativeProtected(env, session3.user.id)');
 const next=`const entryMeasure=env.ENTRY_SCREEN_MEASURE||((_,fn)=>fn());
        const entryBootstrap=async()=>{
          const [values,privateNativeActive,registration]=await Promise.all([
            entryMeasure('bootstrap_profile',()=>profile(env,session3.user,state2)),
            entryMeasure('private_guard',()=>privateNativeProtected(env,session3.user.id)),
            entryMeasure('registration_status',()=>notion.status(session3.user.id))
          ]);
          if(registration.state==='not_registered')await entryMeasure('first_registration',()=>register(session3.user,values));
          else ctx.waitUntil(register(session3.user,values).catch(()=>{}));
          return "window.DAILYLOG_AUTH = " + safe({ ...values, csrfToken:session3.csrf, cloud:true, notionSyncEnabled:true, privateNativeActive, privateVaultOrigin:webVaultOrigin }) + ";";
        };`;
 s=once(s,actual,next);
 s=once(s,"env.ENTRY_SPEED_CAPTURE_BOOTSTRAP(await entryBootstrap()+'\\nwindow.DAILYLOG_EXPERIENCE='+safe(await employeeExperience(env,session3.user.account))+';\\n');",`{const [bootstrap,experience]=await Promise.all([entryBootstrap(),entryMeasure('experience',()=>employeeExperience(env,session3.user.account))]);env.ENTRY_SPEED_CAPTURE_BOOTSTRAP(bootstrap+'\\nwindow.DAILYLOG_EXPERIENCE='+safe(experience)+';\\n');}`);
 const defaults=[...s.matchAll(/\b([A-Za-z_$][\w$]*)\s+as\s+default\b/g)];assert.equal(defaults.length,1);assert(!s.includes('first_screen_worker'));
 const previous=defaults[0][1];
 s="import {firstScreenAssets} from './first-screen.mjs';\n"+once(s,previous+' as default','first_screen_worker as default');
 return s+`\nconst first_screen_worker={...${previous},async fetch(request,env,ctx){
 const eligible=request.method==='GET'&&['/','/index.html','/line-entry','/auth/bootstrap.js'].includes(new URL(request.url).pathname);
 const times=[],start=performance.now(),measure=async(name,fn)=>{const t=performance.now();try{return await fn();}finally{times.push(name+';dur='+(performance.now()-t).toFixed(1));}};
 let response=await ${previous}.fetch(request,eligible?{...env,ENTRY_SCREEN_MEASURE:measure,ENTRY_TASK_MEASURE:measure}:env,ctx);
 response=await firstScreenAssets(request,response,env);
 if(!eligible||!response.ok)return response;
 const headers=new Headers(response.headers);headers.append('Server-Timing',times.concat('entry_total;dur='+(performance.now()-start).toFixed(1)).join(', '));
 return new Response(response.body,{status:response.status,headers});
}};\n`;
};

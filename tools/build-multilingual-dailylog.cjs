const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'DailyLog baseline changed: '+a.slice(0,90));return s.replace(a,b);};
function build(folder){
 let s=fs.readFileSync(path.join(folder,'baseline/worker.mjs'),'utf8');
 s='import {createMultilingualDailylog,employeeExperience,multilingualProbe} from "./multilingual-dailylog.mjs";\n'+s;
 const exports=[...s.matchAll(/\b([a-zA-Z_$][\w$]*) as default\b/g)];assert.equal(exports.length,1,'Expected one current worker export');const current=exports[0][1];assert(s.includes('var '+current+' =')||s.includes('const '+current+'='),'Current wrapper definition required');
 s=once(s,current+' as default','multilingual_dailylog_worker as default');
 // This check runs only after the existing tenant/service authorization. It
 // never blocks assigning a task to a foreign-language recipient.
 s=once(s,'if (value.tenantKey !== tenant) throw fail222("TENANT_MISMATCH", 403);','if (value.tenantKey !== tenant) throw fail222("TENANT_MISMATCH", 403);\n    if(route.endsWith("/multilingual-probe"))return response(await multilingualProbe(env,value));\n    if(["/intake","/self-create","/meeting-publish"].some(p=>route.endsWith(p))){const initiator=value.sender?.account||value.actor?.account||value.host?.account;if(initiator&&(await employeeExperience(env,initiator)).locale!=="zh-Hant")throw Object.assign(Error("此版本可回覆與變更任務狀態；建立及編輯任務請由中文版處理。"),{status:403});}');
 s+='\nconst multilingual_dailylog_worker=createMultilingualDailylog('+current+');\n';
 fs.writeFileSync(path.join(folder,'candidate/worker.mjs'),s);
 for(const name of ['multilingual-policy.js','multilingual-client.js','multilingual-dailylog.mjs'])fs.copyFileSync(path.join(__dirname,'../core',name),path.join(folder,'candidate',name));
 console.log(JSON.stringify({built:true,changedModules:['worker.mjs'],addedModules:['multilingual-policy.js','multilingual-client.js','multilingual-dailylog.mjs'],assetsPreserved:true}));
}
module.exports={build};if(require.main===module)build(process.argv[2]);

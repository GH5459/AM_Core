const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
function build(folder){
 const source=path.resolve(__dirname,'../versions/AM-IMP-2026.1020.30/dailylog'),before=JSON.parse(fs.readFileSync(folder+'/before.private.json'));
 const baseline=fs.readFileSync(folder+'/baseline/worker.mjs','utf8'),match=baseline.match(/\n  (\w+) as default\n\};/);assert(match,'Main export changed');
 for(const name of ['line-personal-completion.mjs','line-personal-completion-response.mjs'])fs.copyFileSync(source+'/'+name,folder+'/candidate/'+name);
 assert(baseline.includes('const completionReportAuthority='),'Existing authority adapter unavailable');
 const installed=baseline.includes('const personal_completion_worker='),base=installed?'multilingual_dailylog_worker':match[1];
 // Reuse the exact existing base expression when upgrading an installed wrapper.
 const old=installed?baseline.match(/const personal_completion_worker=\{fetch:async\(request,env,ctx\)=>\{const handled=await personalCompletionRoute[\s\S]*?scheduled:\(\.\.\.args\)=>\w+\.scheduled\(\.\.\.args\)\};/):null;
 if(installed)assert(old,'Installed personal wrapper changed');
 const actualBase=installed?old[0].match(/personalCompletionResponse\(request,await (\w+)\.fetch/)[1]:base;
 const wrapper=`const personal_completion_worker={fetch:async(request,env,ctx)=>withAuthorityInvocation(env,async scoped=>{const read=async(r,e)=>personalAuthority(r,e,readAuthority,async(req,scope)=>{const response=await ${actualBase}.fetch(new Request(new URL('/api/auth/session',req.url),{headers:{Cookie:req.headers.get('cookie')||''}}),scope,ctx);if(!response.ok)throw Object.assign(Error('登入資格暫時無法確認，請稍後重試。'),{status:response.status});if(!(await response.json()).authenticated)throw Object.assign(Error('請先登入。'),{status:401});beginAuthorityStage();});const handled=await personalCompletionRoute(request,scoped,{readAuthority:read,authority:completionReportAuthority});return handled||personalCompletionResponse(request,await ${actualBase}.fetch(request,scoped,ctx));}),scheduled:(...args)=>${actualBase}.scheduled(...args)};`;
 const worker=installed?baseline.replace('import {personalCompletionRoute}', 'import {personalCompletionRoute,personalAuthority}').replace(old[0],wrapper):'import {personalCompletionRoute,personalAuthority} from "./line-personal-completion.mjs";\nimport {personalCompletionResponse} from "./line-personal-completion-response.mjs";\n'+baseline.replace(base+' as default','personal_completion_worker as default')+'\n'+wrapper+'\n';
 fs.writeFileSync(folder+'/candidate/worker.mjs',worker);
 const walk=(dir,p='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name,p+e.name+'/'):[p+e.name]);
 const sourceHash=Object.fromEntries(walk(folder+'/candidate').sort().map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(folder+'/candidate/'+f)).digest('hex')]));
 const changed=installed?['worker.mjs','line-personal-completion.mjs']:['worker.mjs'];
 for(const m of before.modules)if(!changed.includes(m.name))assert.equal(sourceHash[m.name],m.sha256,'Original module changed: '+m.name);
 fs.writeFileSync(folder+'/review.private.json',JSON.stringify({source:sourceHash,baseVersion:before.version,preservedOriginalModules:before.modules.length-changed.length,changed,added:installed?[]:['line-personal-completion.mjs','line-personal-completion-response.mjs'],keepAssets:true},null,2));
 return {baseVersion:before.version,modules:Object.keys(sourceHash).length,preserved:before.modules.length-changed.length};
}
module.exports={build};if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]))));

const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
function build(folder){
 const source=path.resolve(__dirname,'../versions/AM-IMP-2026.1020.30/dailylog'),before=JSON.parse(fs.readFileSync(folder+'/before.private.json'));
 const baseline=fs.readFileSync(folder+'/baseline/worker.mjs','utf8'),match=baseline.match(/\n  (\w+) as default\n\};/);assert(match,'Main export changed');assert(!baseline.includes('personal_completion_worker'),'Personal reporter already installed');
 for(const name of ['line-personal-completion.mjs','line-personal-completion-response.mjs']){assert(!before.modules.some(m=>m.name===name),'Module already installed');fs.copyFileSync(source+'/'+name,folder+'/candidate/'+name);}
 assert(baseline.includes('const completionReportAuthority='),'Existing authority adapter unavailable');
 const base=match[1];const worker='import {personalCompletionRoute} from "./line-personal-completion.mjs";\nimport {personalCompletionResponse} from "./line-personal-completion-response.mjs";\n'+baseline.replace(base+' as default','personal_completion_worker as default')+`\nconst personal_completion_worker={fetch:async(request,env,ctx)=>{const handled=await personalCompletionRoute(request,env,{readAuthority,authority:completionReportAuthority});return handled||personalCompletionResponse(request,await ${base}.fetch(request,env,ctx));},scheduled:(...args)=>${base}.scheduled(...args)};\n`;
 fs.writeFileSync(folder+'/candidate/worker.mjs',worker);
 const walk=(dir,p='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name,p+e.name+'/'):[p+e.name]);
 const sourceHash=Object.fromEntries(walk(folder+'/candidate').sort().map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(folder+'/candidate/'+f)).digest('hex')]));
 for(const m of before.modules)if(m.name!=='worker.mjs')assert.equal(sourceHash[m.name],m.sha256,'Original module changed: '+m.name);
 fs.writeFileSync(folder+'/review.private.json',JSON.stringify({source:sourceHash,baseVersion:before.version,preservedOriginalModules:before.modules.length-1,changed:['worker.mjs'],added:['line-personal-completion.mjs','line-personal-completion-response.mjs'],keepAssets:true},null,2));
 return {baseVersion:before.version,modules:Object.keys(sourceHash).length,preserved:before.modules.length-1};
}
module.exports={build};if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]))));

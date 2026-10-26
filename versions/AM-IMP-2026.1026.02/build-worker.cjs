const fs=require('node:fs'),path=require('node:path');
function transformWorker(source){
 const replacements=[
  ['if (new TextEncoder().encode(body2).length > 1024 * 1024) return base.fetch(request, env, ctx);','if (new TextEncoder().encode(body2).length > 1536 * 1024) return base.fetch(request, env, ctx);'],
  ['journal.submit(session3.user, await bodyJson(request, 1024 * 1024), { defer: true })','journal.submit(session3.user, await bodyJson(request, 1536 * 1024), { defer: true })']
 ];
 for(const [from,to]of replacements){if(source.split(from).length!==2)throw Error('Current journal save point must match exactly once');source=source.replace(from,to);}
 const point='return await dailyContinuationFetch(request,env)||future_work_worker.fetch(request,env,ctx);';
 if(source.split(point).length!==2)throw Error('Current DailyLog wrapper must match exactly once');
 return "import {journalRecoveryAsset} from './journal-recovery.mjs';\n"+source.replace(point,"return await dailyContinuationFetch(request,env)||await journalRecoveryAsset(request,env,ctx,future_work_worker)||future_work_worker.fetch(request,env,ctx);");
}
module.exports={transformWorker};
if(require.main===module){const [baseline,out]=process.argv.slice(2);if(!baseline||!out||fs.existsSync(out))throw Error('Use complete baseline and a new output directory');fs.cpSync(baseline,out,{recursive:true,errorOnExist:true});fs.writeFileSync(path.join(out,'worker.mjs'),transformWorker(fs.readFileSync(path.join(baseline,'worker.mjs'),'utf8')));for(const name of ['journal-recovery.mjs'])fs.copyFileSync(path.join(__dirname,name),path.join(out,name));fs.copyFileSync(path.join(__dirname,'../AM-IMP-2026.1023.50/login-continuation-worker.mjs'),path.join(out,'login-continuation-worker.mjs'));}

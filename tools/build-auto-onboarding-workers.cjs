'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const privateRoot=process.argv[2];if(!privateRoot)throw Error('Provide the private directory containing freshly read production baselines');
const repo=path.resolve(__dirname,'..'),src=path.join(repo,'versions/auto-onboarding');
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Baseline anchor must occur once: '+a.slice(0,100));return s.replace(a,()=>b);}
function candidate(service,source){const target=path.join(privateRoot,service+'-candidate');fs.mkdirSync(target,{recursive:true});fs.cpSync(path.join(privateRoot,source),target,{recursive:true});return target;}
const uof=candidate('uof','baseline'),daily=candidate('dailylog','dailylog-baseline');
for(const f of ['policy.mjs','coordinator.mjs','directory-hook.mjs'])fs.copyFileSync(path.join(src,f),path.join(uof,'auto-onboarding-'+f));
// Rewrite only our own relative imports, keeping each production module intact.
for(const f of ['coordinator.mjs','directory-hook.mjs']){const p=path.join(uof,'auto-onboarding-'+f);let s=fs.readFileSync(p,'utf8');s=s.replaceAll("'./policy.mjs'","'./auto-onboarding-policy.mjs'").replaceAll("'./coordinator.mjs'","'./auto-onboarding-coordinator.mjs'");fs.writeFileSync(p,s);}
let worker=fs.readFileSync(path.join(uof,'worker.mjs'),'utf8');
worker="import {rememberBaseline,evaluateDirectory,maintenance as autoMaintenance,confirmed as autoConfirmed} from './auto-onboarding-directory-hook.mjs';\nimport {groupQuery as autoGroupQuery} from './auto-onboarding-coordinator.mjs';\nimport {targetGroupIds} from './auto-onboarding-policy.mjs';\n"+worker;
worker=replace(worker,'        await this.app.store.update("access", (current) => {\n          mergeCatalog(current, employees);','        let autoGroups=null;\n        try { const candidate=await this.app.api.readQuery(autoGroupQuery(),5000); targetGroupIds(candidate); autoGroups=candidate; } catch {}\n        await this.app.store.update("access", (current) => {\n          try { rememberBaseline(current,eligiblePerson); } catch { current.autoOnboardingNeedsEvaluation=true; }\n          mergeCatalog(current, employees);');
worker=replace(worker,'          current.employees = effective;\n          current.directorySyncedAt',`          current.employees = effective;
          if(autoGroups && details){
            try { const candidate=structuredClone(current); evaluateDirectory(candidate,autoGroups,eligiblePerson,time); Object.assign(current,candidate); delete current.autoOnboardingBootstrap; }
            catch { current.autoOnboardingNeedsEvaluation=true; current.autoOnboardingNextEvaluationAt=time+300000; }
          }else{ current.autoOnboardingNeedsEvaluation=true; current.autoOnboardingNextEvaluationAt=time+300000; }
          current.directorySyncedAt`);
worker=replace(worker,'  async access() {\n    const value = await this.sharedAccess.ensure();','  scheduleAutoOnboarding(account) {\n    this.ctx.waitUntil(autoConfirmed(this,account,commonMeetingRecheck).catch(()=>{}));\n  }\n  scheduleAutoOnboardingScan() {\n    this.ctx.waitUntil((async()=>{await this.store.update("access",a=>{if(a?.autoOnboarding)a.autoOnboarding.scanNeeded=true;return a;});await autoMaintenance(this,eligiblePerson,commonMeetingRecheck);})().catch(()=>{}));\n  }\n  async access() {\n    const value = await this.sharedAccess.ensure();');
worker=replace(worker,'      if(this.env.CENTRAL_DIRECTORY_REQUIRED === "true") await this.directory.sync({force:false});\n      return json({linePollPolicy:', '      if(this.env.CENTRAL_DIRECTORY_REQUIRED === "true") { await this.directory.sync({force:false}); this.ctx.waitUntil(autoMaintenance(this,eligiblePerson,commonMeetingRecheck).catch(()=>{})); }\n      return json({linePollPolicy:');
fs.writeFileSync(path.join(uof,'worker.mjs'),worker);
let common=fs.readFileSync(path.join(uof,'common-line-uof.mjs'),'utf8');common=replace(common,"if(!result?.ok)throw fail('帳號已確認，工作身分接續尚未完成，請重試。',503);", "if(!result?.ok)throw fail('帳號已確認，工作身分接續尚未完成，請重試。',503);\n  try{app.scheduleAutoOnboarding?.(a);}catch{}");common=replace(common,'if(recovery)return recovery;',"if(recovery){if(recovery.recovered&&recovery.linked){try{app.scheduleAutoOnboardingScan?.();}catch{}}return recovery;}");fs.writeFileSync(path.join(uof,'common-line-uof.mjs'),common);
fs.copyFileSync(path.join(src,'dailylog-auto.mjs'),path.join(daily,'auto-onboarding-meeting.mjs'));
let d=fs.readFileSync(path.join(daily,'worker.mjs'),'utf8');d="import {autoMeetingBridge} from './auto-onboarding-meeting.mjs';\n"+d;d=replace(d,'  async commonLineIdentity(input){return commonLineIdentity(this.env,input);}', '  async commonLineIdentity(input){return commonLineIdentity(this.env,input);}\n  async autoOnboardingPersonal(input){return autoMeetingBridge(this.env,input,{lookup:commonLineIdentity});}');fs.writeFileSync(path.join(daily,'worker.mjs'),d);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');console.log(JSON.stringify({uofWorker:hash(path.join(uof,'worker.mjs')),dailyWorker:hash(path.join(daily,'worker.mjs')),commonLine:hash(path.join(uof,'common-line-uof.mjs'))}));

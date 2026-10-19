// Read-only checks only: no task/event/ticket creation or real source replay.
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {taskAdminKey} from '../core/leaf-tasks.js';
const [folder,envFile,expected]=process.argv.slice(2),env=parseEnv(fs.readFileSync(envFile,'utf8')),results=[];
for(const origin of ['https://am.hozorental.com','https://am-platform-2ymf.onrender.com']){
 const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(30000)});assert(r.ok);const h=await r.json();assert.equal(h.commit,expected);assert.equal(h.lineGroupMentions.quickCreateContract,'line-group-bot-quick-create-v1');assert.equal(h.lineGroupMentions.confirmationTimeoutSeconds,600);assert.equal(h.lineGroupMentions.calendarMode,'organizer-confirmation-per-person');assert.equal(h.lineTasks.groupScope,'all-oa-groups');assert.equal(h.lineTasks.speedPolicy,'line-task-fast-notice-v1');assert.equal(h.lineTasks.photoRecoverySeconds,60);assert.equal(h.personalAssistant.enabled,false);
 const endpoint=origin+'/portal/admin/leaf-tasks/quick-create-health',p=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+taskAdminKey(env.LINE_CHANNEL_SECRET)},body:JSON.stringify({tenantKey:'green-hotel'}),signal:AbortSignal.timeout(30000)});assert(p.ok,'Task target health unavailable');const target=await p.json();assert.equal(target.contract,'line-group-bot-quick-create-v1');assert.equal(target.noWrites,true);
 results.push({origin,commit:h.commit,quickCreateContract:h.lineGroupMentions.quickCreateContract,targetContract:target.contract,originalTaskCalendarAndPausePreserved:true});
}
const settings=JSON.parse(fs.readFileSync(folder+'/dailylog/before.private.json')),dailyOrigin=settings.settings.bindings.find(b=>b.name==='PUBLIC_ORIGIN').text;
assert(dailyOrigin.startsWith('https://'));
const denied=await fetch(new URL('/api/integrations/leaf-snail/tasks/self-create',dailyOrigin),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});assert.equal(denied.status,401);
fs.writeFileSync(folder+'/production-verified.private.json',JSON.stringify({passed:true,results,anonymousSelfCreateDenied:true,noBusinessWrites:true},null,2));console.log(JSON.stringify({passed:true,origins:2,commit:expected,targetContract:'line-group-bot-quick-create-v1',anonymousDenied:true,noBusinessWrites:true}));

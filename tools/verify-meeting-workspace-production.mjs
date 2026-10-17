// Read-only production checks. Private inventory never enters a shared report.
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {managementSignature} from '../modules/meetings/management-auth.js';
import {createOperationalMemory} from '../core/operational-memory.js';
import {loadTenants} from '../core/tenants.js';
import {createLeafTasks} from '../core/leaf-tasks.js';
const [phase,folder]=process.argv.slice(2),env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8'));
const origin=env.AMCORE_PUBLIC_BASE_URL,path='/integrations/meeting-management/conversations',actor='0',timestamp=String(Date.now());
const signature=managementSignature(env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY,{method:'GET',path,actor,timestamp});
const response=await fetch(origin+path,{headers:{'x-meeting-actor':actor,'x-meeting-time':timestamp,'x-meeting-signature':signature},signal:AbortSignal.timeout(45000)});assert(response.ok,'Management inventory unavailable');const inventory=await response.json();
const snapshot=inventory.conversations.map(r=>({key:r.key,enabled:r.enabled,todoMode:r.todoMode,tenantKey:r.tenantKey,version:r.version,notionUrl:r.notionUrl,driveUrl:r.driveUrl})).sort((a,b)=>a.key.localeCompare(b.key));
if(phase==='snapshot'){fs.writeFileSync(folder+'/settings-before.private.json',JSON.stringify(snapshot,null,2));console.log(JSON.stringify({snapshot:true,conversations:snapshot.length,enabled:snapshot.filter(r=>r.enabled).length}));}
else if(phase==='verify'){
 assert.deepEqual(snapshot,JSON.parse(fs.readFileSync(folder+'/settings-before.private.json')),'Conversation settings changed');
 const health=await(await fetch(origin+'/health')).json();assert.equal(health.conversationMeetings.workspace.contract,'meeting-collaboration-host-publish-v1');
 for(const base of [origin,'https://am-platform-2ymf.onrender.com']){
  const h=await(await fetch(base+'/health')).json();assert.equal(h.conversationMeetings.workspace.contract,'meeting-collaboration-host-publish-v1');
  assert.equal((await fetch(base+path)).status,401);assert.equal((await fetch(base+'/meetings/review/work/'+'0'.repeat(64))).status,404);
 }
 const admin=new URL(fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim());
 for(const [key,value]of Object.entries(env))if(key.endsWith('_DATABASE_URL')&&value){const u=new URL(value);if(!u.hostname.includes('.')&&u.pathname===admin.pathname){u.hostname=admin.hostname;env[key]=u.toString();env[key.replace('_DATABASE_URL','_DATABASE_SSL')]='true';}}
 const memory=createOperationalMemory({env,logger:{warn(){}}}),tenants=loadTenants(env,{warn(){}}),tasks=createLeafTasks({env,tenants,platform:{operationalMemory:memory},resolveIdentity:async()=>null,line:{},logger:{warn(){}}});
 let directory;try{assert((await tasks.groupServices()).length>0,'No configured work task service');directory=await tasks.meetingDirectory();}finally{await tasks.close();}
 const result={verified:true,workspaceContract:health.conversationMeetings.workspace.contract,conversations:snapshot.length,enabled:snapshot.filter(r=>r.enabled).length,settingsPreserved:true,workIdentityDirectoryRead:true,workIdentityCount:directory.length,anonymousDenied:true,at:new Date().toISOString(),realLineMessagesSent:false,realTasksCreated:false};
 fs.writeFileSync(folder+'/am-verified.private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else throw Error('Unknown phase');

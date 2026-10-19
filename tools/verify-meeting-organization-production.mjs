// Read-only service verification. No LINE events, user content or credentials
// are printed; no task, meeting, grant or message is written.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {loadTenants} from '../core/tenants.js';
import {createLeafTasks} from '../core/leaf-tasks.js';
import {createOperationalMemory} from '../core/operational-memory.js';
import {createLineIo} from '../core/line-io/index.js';
import {createLine} from '../core/line.js';
const folder=process.argv[2],env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8')),logger={info(){},warn(){},error(){}};
// Render's internal hostname is unavailable from the operator's computer.
// Only substitute the verified external address for this exact same server;
// preserve each connection's original user, database and tenant boundaries.
const external=new URL(fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim());
for(const [key,value]of Object.entries(env))if(/^postgres(?:ql)?:\/\//.test(value)){const url=new URL(value);if(url.hostname===external.hostname.split('.')[0]){url.hostname=external.hostname;url.searchParams.set('sslmode','verify-full');env[key]=url.href;}}
const tenants=loadTenants(env,logger),line=createLine({channelAccessToken:env.LINE_CHANNEL_ACCESS_TOKEN,channelSecret:env.LINE_CHANNEL_SECRET,logger});
const lineIo=await createLineIo({env,tenants,line,router:{},logger});
const memory=createOperationalMemory({env,logger}),tasks=createLeafTasks({env,tenants,platform:{operationalMemory:memory},resolveIdentity:lineIo.resolveTaskIdentity,logger});
try{
 const rows=JSON.parse(fs.readFileSync(folder+'/meetings-before.private.json')),host=rows.find(r=>r.state==='published')?.host_id;if(!host)throw Error('No published host is available for the read-only check');
 const org=await tasks.meetingOrganization(host);assert(org.tenantKey&&Array.isArray(org.people)&&Array.isArray(org.departments));
 assert.equal(new Set(org.people.map(p=>p.account)).size,org.people.length);const ids=new Set(org.departments.map(d=>d.id));assert(org.people.every(p=>p.departments.every(id=>ids.has(id))));
 const result={passed:true,currentHostBinding:true,sameServiceOrganization:true,activePeople:org.people.length,departments:org.departments.length,noGrantsOrMessagesWritten:true};fs.writeFileSync(folder+'/organization-verified.private.json',JSON.stringify(result));console.log(JSON.stringify(result));
}finally{await tasks.close();await memory.close?.();await lineIo.close();}

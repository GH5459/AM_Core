// The only live credential is in the original DailyLog private release folder.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const folder=path.resolve(process.argv[2]||''),action=process.argv[3];
if(!['queue','clarify','propose','claim','check','finish','fail'].includes(action))throw Error('Use queue, clarify, propose, claim, check, finish or fail');
const cfg=JSON.parse(fs.readFileSync(folder+'/wrangler.json')),credentials=JSON.parse(fs.readFileSync(folder+'/runner.private.json'));
const input=process.argv[4]?JSON.parse(fs.readFileSync(path.resolve(process.argv[4]),'utf8')):{};
if(['claim','clarify','propose','finish','fail'].includes(action)&&!input.operationId)throw Error('Persist one operationId in the request file before any write');
(async()=>{const url=new URL('/api/integrations/leaf-snail/tasks/secretary/runner/'+action,cfg.vars.PUBLIC_ORIGIN),r=await fetch(url,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+credentials.key,'Content-Type':'application/json'},body:JSON.stringify({tenantKey:cfg.vars.LEAF_TASK_TENANT,...input}),signal:AbortSignal.timeout(45000)}),v=await r.json();if(!r.ok)throw Error('Xiaoye HTTP '+r.status+': '+(v.error||'operation failed'));console.log(JSON.stringify(v,null,2));})().catch(e=>{console.error(e.message);process.exitCode=1;});

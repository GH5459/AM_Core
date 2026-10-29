const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {legacyMissingPublishCapability,hasMissingPublishEvidence,exactCommitToolAvailable,probeCli,createExactRenderPublishVerifier}=require('./xiaoye-render-publish-recovery.cjs');
const eventId='a'.repeat(64),taskId='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-render-')),run=path.join(dir,'event-runs',eventId);fs.mkdirSync(run,{recursive:true});
 const write=(name,value)=>fs.writeFileSync(path.join(run,name),JSON.stringify(value));
 write('progress.private.json',{capabilityChanged:false,deployed:false,merged:false,newCodeChanges:false,prState:'OPEN',originalIssueResolved:false,browserError:'unavailable',head:'b'.repeat(40)});
 write('publish-capability.private.json',{processRenderNames:[],projectRenderNames:[],userRenderNames:[],altConfigExists:false,configExists:false,renderCliFound:false});
 write('fail.input.private.json',{id:taskId});
 return {dir,write,active:{id:eventId,taskId,sourceVersion:4},inspected:{task:{id:taskId,primaryParentId:'meeting-project'},projects:[{id:'meeting-project',key:'meeting'}]}};
}
const schema=commit=>({data:[{name:'codex_apps',tools:{'render.trigger_deploy':{inputSchema:{properties:{serviceId:{type:'string'},workspaceId:{type:'string'},...commit?{commitId:{type:'string'}}:{}}}}}}]});
test('read-only connector cannot be mistaken for a tool that supports an exact commit',()=>{
 assert.equal(exactCommitToolAvailable(schema(false)),false);assert.equal(exactCommitToolAvailable(schema(true)),true);
});
test('historical evidence must be structured, complete, and for the same case',()=>{
 const f=fixture();assert(legacyMissingPublishCapability(f.dir,f.active));
 f.write('fail.input.private.json',{id:'work-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'});assert.equal(legacyMissingPublishCapability(f.dir,f.active),false);
});
test('new capability baseline binds the exact event, case and source version',()=>{
 const f=fixture();f.write('fail.input.private.json',{id:'different'});
 f.write('capability-blocked.private.json',{id:eventId,taskId,sourceVersion:4,capability:'render-deploy-commit-v1',state:'unavailable'});
 assert.equal(hasMissingPublishEvidence(f.dir,f.active),true);
 assert.equal(hasMissingPublishEvidence(f.dir,{...f.active,sourceVersion:5}),false);
});
test('verification is read-only and binds both the selected workspace and exact service',async()=>{
 const f=fixture(),calls=[];
 class Client{async connect(){return this} async request(method,args){calls.push({method,args});if(method==='mcpServerStatus/list')return schema(true);if(method==='thread/start')return {thread:{id:'fixture'}};if(method==='mcpServer/tool/call')return {content:[{type:'text',text:JSON.stringify({id:'srv-abc',ownerId:'tea-abc'})}]};}close(){}}
 const verify=createExactRenderPublishVerifier({operatorDirectory:f.dir,workRoot:f.dir,exactRenderDeployRecovery:{workspaceId:'tea-abc',serviceId:'srv-abc',projectKey:'meeting'}},{Client,resolveExecutable:()=>''});
 assert.equal(await verify(f.active,f.inspected),true);
 const call=calls.find(x=>x.method==='mcpServer/tool/call');assert.equal(call.args.tool,'render.get_service');assert.deepEqual(call.args.arguments,{workspaceId:'tea-abc',serviceId:'srv-abc'});
 assert.equal(calls.some(x=>x.args?.tool==='render.trigger_deploy'),false);
 assert.equal(await verify(f.active,{...f.inspected,task:{...f.inspected.task,primaryParentId:'wrong'}}),false);
});
test('missing commit argument, failed service lookup, or another workspace never verifies capability',async()=>{
 const f=fixture();let status=schema(false),owner='tea-abc',error=false;
 class Client{async connect(){return this}async request(method){if(method==='mcpServerStatus/list')return status;if(method==='thread/start')return {thread:{id:'fixture'}};return {isError:error,content:[{type:'text',text:JSON.stringify({id:'srv-abc',ownerId:owner})}]};}close(){}}
 const verify=createExactRenderPublishVerifier({operatorDirectory:f.dir,workRoot:f.dir,exactRenderDeployRecovery:{workspaceId:'tea-abc',serviceId:'srv-abc',projectKey:'meeting'}},{Client,resolveExecutable:()=>''});
 assert.equal(await verify(f.active,f.inspected),false);status=schema(true);owner='tea-wrong';assert.equal(await verify(f.active,f.inspected),false);owner='tea-abc';error=true;assert.equal(await verify(f.active,f.inspected),false);
});
test('CLI verification checks --commit, the authenticated identity, the active workspace, and the exact service',async()=>{
 const target={cliExecutable:process.execPath,workspaceId:'tea-abc',serviceId:'srv-abc',accountEmail:'a@example.invalid',repository:'https://github.com/fixture/repo'},seen=[];
 let values={help:'--commit <COMMIT_ID>',who:{email:'a@example.invalid'},workspace:{id:'tea-abc'},services:[{id:'srv-abc',ownerId:'tea-abc',repo:target.repository}]};
 const client={async request(method,params){assert.equal(method,'command/exec');const a=params.command.slice(1);seen.push(a.join(' '));const v=a[0]==='help'?values.help:a[0]==='whoami'?values.who:a[0]==='workspace'?values.workspace:values.services;return {exitCode:0,stdout:typeof v==='string'?v:JSON.stringify(v)};}};
 assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'available');
 assert.deepEqual(seen.map(s=>s.split(' ')[0]),['help','whoami','workspace','services']);assert(seen.every(s=>!s.startsWith('deploys create')));
 values.workspace={id:'tea-wrong'};assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'unknown');
 values.workspace={id:'tea-abc'};values.services=[{id:'srv-other'}];assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'unknown');
 values.help='no commit support';assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'unavailable');
});
test('CLI missing, missing spawn, expired token and unknown errors remain distinct',async()=>{
 const config={workRoot:process.cwd()},target={cliExecutable:path.join(os.tmpdir(),'nonexistent-render-fixture.exe')};
 assert.equal(await probeCli({request:async()=>{throw Error('must not run')}},target,config),'unavailable');
 target.cliExecutable=process.execPath;
 const missing={request:async()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});}};
 const unknown={request:async()=>{throw Object.assign(Error('timeout'),{code:'ETIMEDOUT'});}};
 assert.equal(await probeCli(missing,target,config),'unavailable');assert.equal(await probeCli(unknown,target,config),'unknown');
 const expired={request:async(method,p)=>p.command[1]==='help'?{exitCode:0,stdout:'--commit <COMMIT_ID>'}:{exitCode:1,stderr:'your token is expired; run render login to get a new one'}};
 assert.equal(await probeCli(expired,target,config),'unavailable');
 const recovered={request:async(method,p)=>{const a=p.command.slice(1);return {exitCode:0,stdout:a[0]==='help'?'--commit <COMMIT_ID>':JSON.stringify(a[0]==='whoami'?{email:'a@example.invalid'}:a[0]==='workspace'?{id:'tea-abc'}:[{id:'srv-abc',ownerId:'tea-abc'}])};}};
 Object.assign(target,{workspaceId:'tea-abc',serviceId:'srv-abc',accountEmail:'a@example.invalid'});assert.equal(await probeCli(recovered,target,config),'available');
});
test('deployment reconciliation requires the same workspace, service, full SHA and unique deploy ID',async()=>{
 const f=fixture(),calls=[],d={workspaceId:'tea-abc',serviceId:'srv-abc',deployId:'dep-abc',commitId:'b'.repeat(40)};let status='live',actual={...d},error=false;
 class Client{async connect(){return this}async request(method,p){calls.push({method,p});if(method==='thread/start')return {thread:{id:'fixture'}};if(p.tool==='render.get_service')return {content:[{type:'text',text:JSON.stringify({id:actual.serviceId,ownerId:actual.workspaceId,repo:'https://example.invalid/repo'})}]};return {isError:error,content:[{type:'text',text:JSON.stringify({id:actual.deployId,commit:{id:actual.commitId},status})}]};}close(){}}
 const v=createExactRenderPublishVerifier({operatorDirectory:f.dir,workRoot:f.dir,exactRenderDeployRecovery:{workspaceId:d.workspaceId,serviceId:d.serviceId,projectKey:'meeting',repository:'https://example.invalid/repo'}},{Client,resolveExecutable:()=>''});
 const input={...f.inspected,task:{...f.inspected.task,capabilityDependency:{eventId:eventId,sourceVersion:4,outcome:'unknown',deployment:d}}};
 assert.deepEqual(await v.probeDeployment(f.active,input),{state:'live',status:'live'});
 const actualCall=calls.find(x=>x.p?.tool==='render.get_deploy');assert.deepEqual(actualCall.p.arguments,{workspaceId:d.workspaceId,serviceId:d.serviceId,deployId:d.deployId});assert(!calls.some(x=>x.p?.tool==='render.trigger_deploy'));
 status='queued';assert.deepEqual(await v.probeDeployment(f.active,input),{state:'pending'});status='build_failed';assert.deepEqual(await v.probeDeployment(f.active,input),{state:'failed',status:'build_failed'});status='deactivated';assert.deepEqual(await v.probeDeployment(f.active,input),{state:'unknown'});
 status='live';error=true;assert.deepEqual(await v.probeDeployment(f.active,input),{state:'unknown'});error=false;
 for(const k of ['workspaceId','serviceId','deployId','commitId']){actual={...d,[k]:k==='commitId'?'c'.repeat(40):d[k]+'z'};assert.deepEqual(await v.probeDeployment(f.active,input),{state:'unknown'},k);}
 actual={...d};const before=calls.length;const missing=structuredClone(input);delete missing.task.capabilityDependency.deployment.deployId;assert.deepEqual(await v.probeDeployment(f.active,missing),{state:'unknown'});assert.equal(calls.length,before);
});

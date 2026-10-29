const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {legacyMissingPublishCapability,hasMissingPublishEvidence,exactCommitToolAvailable,probeCli,createExactRenderPublishVerifier}=require('./xiaoye-render-publish-recovery.cjs');
const eventId='a'.repeat(64),taskId='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-render-')),run=path.join(dir,'event-runs',eventId);fs.mkdirSync(run,{recursive:true});
 const write=(name,value)=>fs.writeFileSync(path.join(run,name),JSON.stringify(value));
 write('progress.private.json',{capabilityChanged:false,deployed:false,originalIssueResolved:false,browserError:'unavailable',head:'b'.repeat(40)});
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
 const target={cliExecutable:path.resolve('render-fixture.exe'),workspaceId:'tea-abc',serviceId:'srv-abc',accountEmail:'a@example.invalid',repository:'https://github.com/fixture/repo'},seen=[];
 let values={help:'--commit <COMMIT_ID>',who:{email:'a@example.invalid'},workspace:{id:'tea-abc'},services:[{id:'srv-abc',ownerId:'tea-abc',repo:target.repository}]};
 const client={async request(method,params){assert.equal(method,'command/exec');const a=params.command.slice(1);seen.push(a.join(' '));const v=a[0]==='help'?values.help:a[0]==='whoami'?values.who:a[0]==='workspace'?values.workspace:values.services;return {exitCode:0,stdout:typeof v==='string'?v:JSON.stringify(v)};}};
 assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'available');
 assert.deepEqual(seen.map(s=>s.split(' ')[0]),['help','whoami','workspace','services']);assert(seen.every(s=>!s.startsWith('deploys create')));
 values.workspace={id:'tea-wrong'};assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'unknown');
 values.workspace={id:'tea-abc'};values.services=[{id:'srv-other'}];assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'unknown');
 values.help='no commit support';assert.equal(await probeCli(client,target,{workRoot:process.cwd()}),'unavailable');
});

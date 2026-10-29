const fs=require('node:fs'),path=require('node:path');
const {CodexAppServerClient}=require('./xiaoye-app-server-client.cjs');
const {codexExecutable}=require('./xiaoye-runtime-paths.cjs');
const CAPABILITY='render-deploy-commit-v1';
function read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}

// Legacy evidence records missing CLI/config and a failed browser on the
// exact completed event. This does not establish that today's connector can
// deploy; the live schema and service are checked separately below.
function legacyMissingPublishCapability(folder,active){
 const run=path.join(folder,'event-runs',active.id);
 const p=read(path.join(run,'progress.private.json'));
 const c=read(path.join(run,'publish-capability.private.json'));
 const fail=read(path.join(run,'fail.input.private.json'));
 return !!(p&&c&&fail&&fail.id===active.taskId&&p.capabilityChanged===false&&p.deployed===false&&p.merged===false&&p.newCodeChanges===false&&p.prState==='OPEN'&&p.originalIssueResolved===false&&
  typeof p.browserError==='string'&&p.browserError.length>0&&/^[a-f0-9]{40}$/.test(p.head||'')&&
  Array.isArray(c.processRenderNames)&&c.processRenderNames.length===0&&Array.isArray(c.projectRenderNames)&&c.projectRenderNames.length===0&&
  Array.isArray(c.userRenderNames)&&c.userRenderNames.length===0&&c.altConfigExists===false&&c.configExists===false&&c.renderCliFound===false);
}
function hasMissingPublishEvidence(folder,active){
 const v=read(path.join(folder,'event-runs',active.id,'capability-blocked.private.json'));
 return v?.id===active.id&&v.taskId===active.taskId&&v.sourceVersion===active.sourceVersion&&v.capability===CAPABILITY&&v.state==='unavailable'||legacyMissingPublishCapability(folder,active);
}
function exactCommitToolAvailable(status){
 const tool=status?.data?.find(s=>s.name==='codex_apps')?.tools?.['render.trigger_deploy'];
 const p=tool?.inputSchema?.properties;
 return !!(p?.serviceId?.type==='string'&&p?.workspaceId?.type==='string'&&p?.commitId?.type==='string');
}
function serviceFromResult(result){
 if(result?.isError)return null;
 if(result?.structuredContent?.id)return result.structuredContent;
 try{return JSON.parse(result?.content?.find(c=>c.type==='text')?.text||'null');}catch{return null;}
}
function cliJson(result){if(result?.exitCode!==0||typeof result.stdout!=='string')return null;try{return JSON.parse(result.stdout);}catch{return null;}}
async function probeCli(client,target,config){
 if(typeof target.cliExecutable!=='string'||!path.isAbsolute(target.cliExecutable))return 'unknown';
 if(!fs.existsSync(target.cliExecutable))return 'unavailable';
 const root=target.workRoot||config.workRoot;
 const run=async args=>client.request('command/exec',{command:[target.cliExecutable,...args],cwd:root,permissionProfile:':danger-full-access',timeoutMs:15000,outputBytesCap:2*1024*1024},30000);
 let help;try{help=await run(['help','deploys','create']);}catch(e){return ['ENOENT','ERROR_FILE_NOT_FOUND'].includes(e?.code)?'unavailable':'unknown';}
 if(help.exitCode!==0)return 'unknown';
 if(!/--commit\s+<COMMIT_ID>/.test(help.stdout||''))return 'unavailable';
 const whoResult=await run(['whoami','--output','json']);
 if(whoResult.exitCode!==0&&(/run [`']?render login[`']? to authenticate/i.test(whoResult.stderr||'')||/token is expired;\s*run\b/i.test(whoResult.stderr||'')))return 'unavailable';
 const who=cliJson(whoResult);
 const ws=cliJson(await run(['workspace','current','--output','json']));
 if(!who||typeof who!=='object'||!ws||typeof ws!=='object')return 'unknown';
 if((ws.id||ws.workspace?.id)!==target.workspaceId)return 'unknown';
 if(target.accountEmail&&(who.email||who.user?.email)!==target.accountEmail)return 'unknown';
 const listed=cliJson(await run(['services','--output','json']));
 const items=Array.isArray(listed)?listed:Array.isArray(listed?.services)?listed.services:null;
 if(!items)return 'unknown';
 const service=items.map(v=>v.service||v).find(v=>v?.id===target.serviceId);
 if(!service||service.ownerId&&service.ownerId!==target.workspaceId||target.repository&&service.repo!==target.repository)return 'unknown';
 return 'available';
}
function createExactRenderPublishVerifier(config,{Client=CodexAppServerClient,resolveExecutable=codexExecutable}={}){
 async function probe(active,inspected){
  const target=config.exactRenderDeployRecovery;
  const projectKeys=target?.projectKeys||[target?.projectKey].filter(Boolean);
  if(!target||!/^tea-[a-z0-9]+$/.test(target.workspaceId||'')||!/^srv-[a-z0-9]+$/.test(target.serviceId||'')||!Array.isArray(projectKeys)||!projectKeys.length)return 'unknown';
  const project=inspected.projects?.find(p=>p.id===inspected.task?.primaryParentId);
  if(!projectKeys.includes(project?.key))return 'unknown';
  let client;
  try{
   client=await new Client({executable:resolveExecutable(config.codexExecutable)}).connect();
   const cli=await probeCli(client,target,config);
   if(cli==='available')return 'available';
   if(!exactCommitToolAvailable(await client.request('mcpServerStatus/list')))return cli==='unavailable'?'unavailable':target.cliExecutable?'unknown':'unavailable';
   const thread=await client.request('thread/start',{ephemeral:true,cwd:target.workRoot||config.workRoot,permissions:':danger-full-access',approvalPolicy:'never'});
   if(!thread.thread?.id)return 'unknown';
   const r=await client.request('mcpServer/tool/call',{server:'codex_apps',tool:'render.get_service',arguments:{workspaceId:target.workspaceId,serviceId:target.serviceId},threadId:thread.thread.id},45000);
   const service=serviceFromResult(r);
   return service?.id===target.serviceId&&service?.ownerId===target.workspaceId?'available':'unknown';
  }catch{return 'unknown';}finally{client?.close();}
 }
 const verify=async(active,inspected)=>hasMissingPublishEvidence(config.operatorDirectory,active)&&await probe(active,inspected)==='available';
 verify.probe=probe;
 return verify;
}
module.exports={CAPABILITY,legacyMissingPublishCapability,hasMissingPublishEvidence,exactCommitToolAvailable,serviceFromResult,probeCli,createExactRenderPublishVerifier};

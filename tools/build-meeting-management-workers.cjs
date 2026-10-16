const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),folder=process.argv[2];
if(!folder||!path.isAbsolute(folder))throw Error('Pass private snapshot directory');
const replace=(s,a,b)=>{assert.equal(s.split(a).length,2,'Expected exactly one patch anchor: '+a.slice(0,80));return s.replace(a,b);};
const proxy=fs.readFileSync(root+'/modules/meetings/management-proxy.mjs');
for(const name of ['uof-line-cloud','dailylog']){
 const dir=folder+'/'+name,baseline=JSON.parse(fs.readFileSync(dir+'/before.private.json'));
 let s=fs.readFileSync(dir+'/baseline/worker.mjs','utf8');
 if(name==='uof-line-cloud'){
  s='import {meetingManagementRoute} from "./meeting-management.mjs";\n'+s;
  const ui=fs.readFileSync(root+'/modules/meetings/management-ui.js','utf8');
  s=replace(s,'var MANAGEMENT_PATH = "/Management";','managementAssets.js += "\\n" + '+JSON.stringify(ui)+';\nvar MANAGEMENT_PATH = "/Management";');
  const anchor='  if (path === MANAGEMENT_PATH) {\n    if (request.method !== "GET")';
  s=replace(s,anchor,'  const meetings=await meetingManagementRoute(app,request,session);if(meetings)return meetings;\n'+anchor);
 }else{
  s='import {meetingManagementProxy} from "./meeting-management.mjs";\n'+s;
  s=replace(s,'var managementMethods = /* @__PURE__ */ new Map([','var managementMethods = /* @__PURE__ */ new Map([\n  ["/api/meeting-management/conversations",["GET","PUT"]],');
  const a='const user = await managementIdentity(env, identity, now), origin = env.PUBLIC_ORIGIN, headers = new Headers';
  s=replace(s,a,'if(path==="/api/meeting-management/conversations"){await managementIdentity(env,identity,now);return meetingManagementProxy(request,env,identity.account);}\n        '+a);
 }
 fs.writeFileSync(dir+'/candidate/worker.mjs',s);fs.writeFileSync(dir+'/candidate/meeting-management.mjs',proxy);
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const m of baseline.modules)if(m.name!=='worker.mjs')assert.equal(sha(fs.readFileSync(dir+'/candidate/'+m.name)),m.sha256,m.name+' preserved');
 fs.writeFileSync(dir+'/build.private.json',JSON.stringify({baseline:baseline.version,changed:['worker.mjs','meeting-management.mjs'],retained:baseline.modules.length-1,sourceHash:sha(s),proxyHash:sha(proxy)},null,2));
 console.log(JSON.stringify({name,built:true,baseVersion:baseline.version,otherModulesPreserved:baseline.modules.length-1}));
}

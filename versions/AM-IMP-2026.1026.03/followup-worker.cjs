const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function once(s,a,b){assert.equal(s.split(a).length,2,'Followup baseline differs: '+a.slice(0,100));return s.replace(a,b);}
function transformFollowup(s){
 s=once(s,'import {dailyEntryFetch,taskDeliveryJobs}', 'import {dailyEntryFetch,taskDeliveryJobs,taskRelations}');
 const start=s.indexOf('  function createUnifiedCloudTasks2(env, canUse, now, membersSnapshot, legacyCore, authority2 = {}) {'),end=s.indexOf('  __name(createUnifiedCloudTasks2,',start);assert(start>=0&&end>start);let part=s.slice(start,end);
 part=once(part,'async function present(user, task, visible = null) {','async function present(user, task, visible = null, relations = null) {');
 part=once(part,'const n = await read52(id);\n        if (n && (taskViewMembers(n)', 'const n = relations ? relations.get(id) || null : await read52(id);\n        if (n && (taskViewMembers(n)');
 part=once(part,'const result = await Promise.all(visible.map((t) => present(user, t, visible)));','const relations=await taskRelations(db,visible,hydrateTaskSharing);\n        const result = await Promise.all(visible.map((t) => present(user, t, visible,relations)));\n        await assertSharingVersions(db,[...relations.values()],true);');
 s=s.slice(0,start)+part+s.slice(end);
 const bootstrapStart=s.indexOf('        if (path === "/auth/bootstrap.js" && request.method === "GET") {'),bootstrapEnd=s.indexOf('        if (path === "/google-config.js"',bootstrapStart);assert(bootstrapStart>0&&bootstrapEnd>bootstrapStart);const old=s.slice(bootstrapStart,bootstrapEnd);
 const match=old.match(/return send\(js\(([\s\S]*?)\)\);/);assert(match,'Original bootstrap expression required');
 s=s.slice(0,bootstrapStart)+`        const entryBootstrap=async()=>{await register(session3.user);return ${match[1]};};
        if (path === "/auth/bootstrap.js" && request.method === "GET") return send(js(await entryBootstrap()));
        if(path==='/'&&request.method==='GET'&&session3?.user&&typeof env.ENTRY_SPEED_CAPTURE_BOOTSTRAP==='function')env.ENTRY_SPEED_CAPTURE_BOOTSTRAP(await entryBootstrap()+'\\nwindow.DAILYLOG_EXPERIENCE='+safe(await employeeExperience(env,session3.user.account))+';\\n');
`+s.slice(bootstrapEnd);
 return s;
}
module.exports={transformFollowup};
if(require.main===module){const [baseline,out]=process.argv.slice(2);assert(path.isAbsolute(baseline)&&path.isAbsolute(out));assert(!fs.existsSync(out));fs.cpSync(baseline,out,{recursive:true,errorOnExist:true});fs.writeFileSync(path.join(out,'worker.mjs'),transformFollowup(fs.readFileSync(path.join(baseline,'worker.mjs'),'utf8')));fs.copyFileSync(path.join(__dirname,'entry-speed.mjs'),path.join(out,'entry-speed.mjs'));}

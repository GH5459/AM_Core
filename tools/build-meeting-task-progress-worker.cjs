// Assemble a candidate from a freshly exported complete DailyLog. Never deploys.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));
const root=path.resolve(__dirname,'..'),base=path.join(folder,'dailylog/baseline'),candidate=path.join(folder,'dailylog/candidate');
assert(!fs.existsSync(candidate),'Use a new candidate directory');
assert(fs.readFileSync(path.join(base,'worker.mjs'),'utf8').includes('publishMeetingAssignments(value,env,{now,directory,permission:permission2,makeService,publish,core:'),'Existing meeting route must provide the original task model');
fs.cpSync(base,candidate,{recursive:true});
let worker=fs.readFileSync(path.join(base,'worker.mjs'),'utf8');
const replace=(a,b)=>{assert.equal(worker.split(a).length,2,'Patch anchor changed: '+a);worker=worker.replace(a,b);};
replace('import {publishMeetingAssignments} from "./meeting-workspace-assignment.mjs";','import {readMeetingProgress} from "./meeting-task-progress.mjs";\nimport {publishMeetingAssignments} from "./meeting-workspace-assignment.mjs";');
const scope=worker.slice(worker.indexOf('async function assignmentMachine'),worker.indexOf('async function assignmentMachine')+3500),response=scope.match(/return (response\w*)\(\{ ok: false, code: "UNAUTHORIZED"/)[1];
const anchor='if (value.tenantKey !== tenant) throw fail222("TENANT_MISMATCH", 403);';
replace(anchor,anchor+`\n    if(route.endsWith('/meeting-progress'))return ${response}(await readMeetingProgress(value,env,{now,directory,permission:permission2,core:dailylogExecutionRelease.core}));`);
fs.writeFileSync(path.join(candidate,'worker.mjs'),worker);
fs.copyFileSync(path.join(root,'modules/meetings/dailylog-progress.mjs'),path.join(candidate,'meeting-task-progress.mjs'));
for(const name of fs.readdirSync(base).filter(n=>/\.(?:mjs|js)$/.test(n)&&n!=='worker.mjs'))assert(fs.readFileSync(path.join(base,name)).equals(fs.readFileSync(path.join(candidate,name))),name+' must be preserved');
console.log('Candidate prepared: authenticated read-only route and one progress module; original assignment and all other modules preserved. No deployment or LINE push.');

const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));
const baseline=fs.readFileSync(folder+'/dailylog/baseline/worker.mjs','utf8');
const core=baseline.match(/memoryTaskService\((dailylogExecutionRelease\.core),/);assert(core,'Find the actual current task model');
const anchor='publishMeetingAssignments(value,env,{now,directory,permission:permission2,makeService,publish})';assert.equal(baseline.split(anchor).length,2,'Current meeting route must match once');
fs.writeFileSync(folder+'/dailylog/candidate/worker.mjs',baseline.replace(anchor,'publishMeetingAssignments(value,env,{now,directory,permission:permission2,makeService,publish,core:'+core[1]+'})'));
fs.copyFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-assignment.mjs'),folder+'/dailylog/candidate/meeting-workspace-assignment.mjs');
console.log('Extended the original meeting route with its existing task model; all other full modules retained.');

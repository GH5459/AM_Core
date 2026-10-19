const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));
const dir=path.join(folder,'dailylog'),name='meeting-workspace-assignment.mjs',baseline=path.join(dir,'baseline'),candidate=path.join(dir,'candidate');
assert(fs.readFileSync(path.join(baseline,'worker.mjs'),'utf8').includes('publishMeetingAssignments'),'Use the latest complete DailyLog with the existing meeting endpoint');
fs.copyFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-assignment.mjs'),path.join(candidate,name));
const before=JSON.parse(fs.readFileSync(path.join(dir,'before.private.json'))),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const changed=before.modules.filter(m=>hash(path.join(candidate,m.name))!==m.sha256).map(m=>m.name);assert.deepEqual(changed,[name]);
assert(before.modules.every(m=>fs.existsSync(path.join(candidate,m.name))));
console.log(JSON.stringify({changed,preserved:before.modules.length-1,noNewModules:true}));

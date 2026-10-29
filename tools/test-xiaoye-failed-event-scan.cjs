const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {failedEventCandidates}=require('./xiaoye-failed-event-scan.cjs');
const id1='a'.repeat(64),id2='b'.repeat(64),id3='c'.repeat(64),task='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function record(root,id,taskId,mtime,finished=true){const run=path.join(root,'event-runs',id);fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id,taskId,sourceVersion:2,lease:'fixture-lease'}}));if(finished)fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'failed'}));fs.utimesSync(run,new Date(mtime),new Date(mtime));return run;}
test('bounded local scan keeps only the latest failed event for each case',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-failed-scan-')),now=Date.now();
 record(dir,id1,task,now-2000);record(dir,id2,task,now-1000);record(dir,id3,'work-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now);
 assert.deepEqual(failedEventCandidates(dir,{limit:2}).map(x=>x.id),[id3,id2]);
 assert.deepEqual(failedEventCandidates(dir,{limit:1}).map(x=>x.id),[id3]);
});
test('already resumed, incomplete and invalid local records cannot dispatch work',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-failed-scan-')),now=Date.now();
 const a=record(dir,id1,task,now-2000);record(dir,id2,task,now-1000,false);
 fs.writeFileSync(path.join(a,'auto-resume.response.private.json'),'{}');
 assert.deepEqual(failedEventCandidates(dir),[]);
});
test('a historical tool failure without a completion file can be checked for safe recovery',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-failed-scan-')),now=Date.now();
 const run=record(dir,id1,task,now,false);
 fs.writeFileSync(path.join(run,'tools-failed.input.private.json'),JSON.stringify({id:id1,lease:'fixture-lease',operationId:'event-failure-fixture'}));
 assert.deepEqual(failedEventCandidates(dir).map(x=>x.id),[id1]);
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),'{}');
 assert.deepEqual(failedEventCandidates(dir),[]);
});

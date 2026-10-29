const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {failedEventCandidates}=require('./xiaoye-failed-event-scan.cjs');
const id1='a'.repeat(64),id2='b'.repeat(64),id3='c'.repeat(64),task='work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function record(root,id,taskId,mtime,finished=true){const run=path.join(root,'event-runs',id),acquired=path.join(run,'acquire.response.private.json');fs.mkdirSync(run,{recursive:true});fs.writeFileSync(acquired,JSON.stringify({job:{id,taskId,sourceVersion:2,lease:'fixture-lease'}}));if(finished)fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'failed'}));fs.utimesSync(acquired,new Date(mtime),new Date(mtime));fs.utimesSync(run,new Date(mtime),new Date(mtime));return run;}
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
test('completed execution events can be checked for blocked-case replanning',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-failed-scan-')),run=record(dir,id1,task,Date.now(),false);
 fs.writeFileSync(path.join(run,'acquire.response.private.json'),JSON.stringify({job:{id:id1,taskId:task,sourceVersion:2,lease:'fixture-lease',kind:'execute'}}));
 fs.writeFileSync(path.join(run,'completion.private.json'),JSON.stringify({state:'done'}));
 assert.deepEqual(failedEventCandidates(dir).map(x=>x.id),[id1]);
});
test('legacy skipped marker is rechecked; a verified stale marker remains terminal',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-legacy-scan-')),run=record(dir,id1,task,Date.now());
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),JSON.stringify({skipped:true,reason:'case-changed'}));
 assert.deepEqual(failedEventCandidates(dir).map(x=>x.id),[id1]);
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),JSON.stringify({skipped:true,reason:'confirmed-deploy-failed'}));
 assert.deepEqual(failedEventCandidates(dir).map(x=>x.id),[id1]);
 fs.writeFileSync(path.join(run,'auto-resume.response.private.json'),JSON.stringify({skipped:true,reason:'confirmed-case-changed'}));
 assert.deepEqual(failedEventCandidates(dir),[]);
});
test('bounded pages reach old events even when a newer run receives fresh status writes',()=>{
 const {failedEventCandidatePage}=require('./xiaoye-failed-event-scan.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-page-scan-')),now=Date.now();
 const runs=[];for(let i=0;i<40;i++){const id=i.toString(16).padStart(64,'0'),taskId='work-'+i.toString(16).padStart(8,'0')+'-aaaa-aaaa-aaaa-aaaaaaaaaaaa';runs.push(record(dir,id,taskId,now-i*1000));}
 let first=failedEventCandidatePage(dir,{limit:32});assert.equal(first.candidates.length,32);assert(first.more);assert.equal(first.nextOffset,32);
 fs.writeFileSync(path.join(runs[0],'new-status.json'),'{}');
 const second=failedEventCandidatePage(dir,{limit:32,offset:first.nextOffset});assert.equal(second.candidates.length,8);assert.equal(second.more,false);
 assert.equal(new Set([...first.candidates,...second.candidates].map(x=>x.id)).size,40);
});

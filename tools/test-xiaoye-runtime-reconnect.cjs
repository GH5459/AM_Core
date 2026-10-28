const test=require('node:test'),assert=require('node:assert/strict');
const {currentContext,validate}=require('./xiaoye-runtime-tools.cjs');

test('each connection uses the unique current desktop and keeps the configured owner',()=>{
 const original={pipePath:'stale',ownerThreadId:'owner'};
 const first=currentContext(original,{platform:'win32',pipeNames:()=>['codex-app-tools-a1b2']});
 const second=currentContext(original,{platform:'win32',pipeNames:()=>['codex-app-tools-c3d4']});
 assert.match(first.pipePath,/a1b2$/);assert.match(second.pipePath,/c3d4$/);
 assert.equal(second.ownerThreadId,'owner');assert.equal(original.pipePath,'stale');
});
test('a missing or ambiguous desktop never falls back to the old connection',()=>{
 for(const names of [[],['codex-app-tools-a1b2','codex-app-tools-c3d4']])
  assert.throws(()=>currentContext({pipePath:'stale'},{platform:'win32',pipeNames:()=>names}),/唯一確認/);
});
test('background PR attachment stays inside the case repository and CI reads configured repositories',()=>{
 assert.doesNotThrow(()=>validate('attach_artifact',{artifact_type:'pull_request',url:'https://github.com/GH5459/AM_Core/pull/503'},'am'));
 assert.doesNotThrow(()=>validate('attach_artifact',{artifact_type:'pull_request',url:'https://github.com/GH5459/DailyLog/pull/1'},'dailylog'));
 assert.throws(()=>validate('attach_artifact',{artifact_type:'pull_request',url:'https://github.com/GH5459/DailyLog/pull/1'},'am'));
 assert.doesNotThrow(()=>validate('pull_requests_checks',{pullRequest:{hostname:'github.com',owner:'GH5459',repository:'DailyLog'}}));
 assert.throws(()=>validate('pull_requests_checks',{pullRequest:{hostname:'github.com',owner:'GH5459',repository:'Other'}}));
});

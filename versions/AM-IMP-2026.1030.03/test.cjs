const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const patch=require('./build.cjs');
const pairs=vm.runInNewContext(fs.readFileSync(__dirname+'/build.cjs','utf8')+'\npairs;', {require,exports:{}});
const original='function fixture(){\n'+pairs.map(p=>p[0]).join('\n')+'\n}\n';
const updated=patch.patchClient(original);new vm.Script(updated);
assert(updated.includes("$('#chooseTaskParticipants').onclick=async"));assert(updated.includes("id:'account:'+p.account"));assert(updated.includes("$('#chooseTaskParticipants').hidden=!editable()||!data.host"));assert.throws(()=>patch.patchClient(updated));assert.throws(()=>patch.patchClient('unexpected client'));
const prefix="pre();if(url.pathname==='/dailylog-meetings-client.js'){if(!check)return new Response('請先登入。',{status:401});return new Response(",suffix=",{headers:{'Content-Type':'text/javascript; charset=utf-8'}});}post();";
const worker=prefix+JSON.stringify(original)+suffix;const result=patch.patchWorker(worker);assert.equal(result,prefix+JSON.stringify(updated)+suffix);
console.log('embedded participant client patch verified');

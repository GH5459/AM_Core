const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),folder=process.argv[2];
const dir=folder+'/dailylog',before=JSON.parse(fs.readFileSync(dir+'/before.private.json')),walk=(p,base='')=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name,base+e.name+'/'):[base+e.name]);
const source=Object.fromEntries(walk(dir+'/candidate').sort().map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(dir+'/candidate/'+f)).digest('hex')]));
const changed=before.modules.filter(m=>source[m.name]!==m.sha256).map(m=>m.name),added=Object.keys(source).filter(f=>!before.modules.some(m=>m.name===f));
assert.deepEqual(changed,['worker.mjs']);assert.deepEqual(added,['meeting-sharing.mjs']);
assert(JSON.parse(fs.readFileSync(folder+'/worker-tests.private.json')).passed);
fs.writeFileSync(dir+'/review.private.json',JSON.stringify({source}));
console.log(JSON.stringify({reviewed:true,changed,added,preserved:before.modules.length-1,otherSourceAndAssetsRetained:true}));

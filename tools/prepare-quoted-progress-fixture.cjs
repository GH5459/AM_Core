// Construct an isolated fixture from an explicitly supplied complete Worker snapshot.
// This script never uploads or changes the input snapshot.
const fs=require('node:fs'),path=require('node:path');
const [source,out]=process.argv.slice(2);if(!source||!out||path.resolve(source)===path.resolve(out))throw Error('expected distinct snapshot and output paths');
if(fs.existsSync(out))throw Error('output already exists');
fs.mkdirSync(path.join(out,'dry-run'),{recursive:true});
for(const name of fs.readdirSync(source))if(name.endsWith('.mjs')||name.endsWith('.js'))fs.copyFileSync(path.join(source,name),path.join(out,'dry-run',name));
fs.cpSync(path.join(source,'public'),path.join(out,'public'),{recursive:true});
fs.copyFileSync(path.resolve(__dirname,'../core/line-quoted-progress-worker.mjs'),path.join(out,'dry-run/line-quoted-progress-worker.mjs'));
let worker=require('../versions/AM-IMP-2026.1102.01/build.cjs').patchWorker(fs.readFileSync(path.join(source,'worker.mjs'),'utf8'));
fs.writeFileSync(path.join(out,'dry-run/worker.js'),worker);

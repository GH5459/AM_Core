const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));
let source=fs.readFileSync(folder+'/dailylog/baseline/worker.mjs','utf8');
assert(source.includes('async function syncPersonnel('),'Use the current central personnel authority');
const anchor="    if(route.endsWith('/meeting-person')){";assert.equal(source.split(anchor).length,2,'Latest complete Worker must match once');
source="import {meetingSharing} from './meeting-sharing.mjs';\n"+source.replace(anchor,"    if(route.endsWith('/meeting-sharing-person')||route.endsWith('/meeting-sharing-directory'))return response(await meetingSharing(value,env,{personnel:syncPersonnel,personOnly:route.endsWith('/meeting-sharing-person')}));\n"+anchor);
fs.writeFileSync(folder+'/dailylog/candidate/worker.mjs',source);
fs.copyFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-sharing.mjs'),folder+'/dailylog/candidate/meeting-sharing.mjs');
console.log('Added tenant-protected organization sharing routes to the latest complete Worker; all prior modules retained.');

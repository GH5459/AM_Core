const fs=require('fs'),path=require('path'),assert=require('assert/strict'),folder=process.argv[2];
assert(path.isAbsolute(folder||''));
let source=fs.readFileSync(folder+'/dailylog/baseline/worker.mjs','utf8');
const prior="if(route.endsWith('/meeting-sharing-person')||route.endsWith('/meeting-sharing-directory'))return response(await meetingSharing(value,env,{personnel:syncPersonnel,personOnly:route.endsWith('/meeting-sharing-person')}));";
assert.equal(source.split(prior).length,2,'Latest complete Worker must match once');
source=source.replace(prior,"if(route.endsWith('/meeting-sharing-person')||route.endsWith('/meeting-sharing-directory')||route.endsWith('/meeting-sharing-recipient'))return response(await meetingSharing(value,env,{personnel:syncPersonnel,personOnly:route.endsWith('/meeting-sharing-person'),recipientOnly:route.endsWith('/meeting-sharing-recipient')}));");
fs.writeFileSync(folder+'/dailylog/candidate/worker.mjs',source);
fs.copyFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-sharing.mjs'),folder+'/dailylog/candidate/meeting-sharing.mjs');
console.log('Extended only the existing sharing route and module in the latest complete Worker.');

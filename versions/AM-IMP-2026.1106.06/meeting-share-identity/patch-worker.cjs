const assert=require('node:assert/strict');
function patchWorker(source){
 const anchor='const operation_speed_worker={...form_open_worker,async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await form_open_worker.fetch(request,env,ctx),env,start);}};';
 assert.equal(source.split(anchor).length,2,'Expected current final operation wrapper exactly once');
 assert(!source.includes('meeting_share_identity_worker'),'Combined identity route is already installed');
 const wrapper="import {meetingShareIdentityRead} from './meeting-share-identity.mjs';\nconst meeting_share_identity_worker={...form_open_worker,async fetch(request,env,ctx){const response=await meetingShareIdentityRead(request,env,ctx,form_open_worker);return response||form_open_worker.fetch(request,env,ctx);}};\n";
 return source.replace(anchor,wrapper+anchor.replaceAll('form_open_worker','meeting_share_identity_worker'));
}
module.exports={patchWorker};

import assert from 'node:assert/strict';
import {createLeafTasks} from '../core/leaf-tasks.js';
let config,prior=null,work=null,currentAccount='222',active=true;
const bot='U'+'f'.repeat(32),user='U'+'2'.repeat(32),other='U'+'3'.repeat(32);
const service=createLeafTasks({env:{LINE_CHANNEL_SECRET:'synthetic-secret',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot},tenants:[{key:'fixture',tenantId:'synthetic-tenant',runtimeEnabled:true}],store:{service:async()=>config,provisionTasks:async()=>{},configureTask:async(t,v)=>config={encrypted_key:{taskService:{baseUrl:v.baseUrl,encryptedKey:v.encryptedKey}}}},resolveRecipient:async()=>prior,resolveIdentity:async()=>prior?{tenantKey:'fixture',account:currentAccount,bindingId:'oldbinding'}:null,fetchImpl:async(url,init)=>{
 const op=new URL(url).pathname.split('/').at(-1),v=init.body?JSON.parse(init.body):{};assert.equal(v.tenantKey||'fixture','fixture');
 if(op==='health')return Response.json({ok:true,contract:'line-mention-dailylog-immediate-v1',tenant:'fixture'});
 if(op==='meeting-sharing-recipient'){assert.equal(v.botUserId,bot);assert.equal(v.account,'222');return Response.json({ok:true,active,recipient:work?{userId:work}:null});}
 if(op==='identity')return Response.json({ok:true,identity:work?{userId:v.lineUserId,account:currentAccount,identityId:'work-bound'}:null});
 if(op==='meeting-sharing-person')return Response.json({ok:true,person:active?{name:'同名同仁'}:null});
 throw Error('Unexpected service call');
}});
await service.configureService({tenantKey:'fixture',baseUrl:'https://fixture.test',apiKey:'fixture-service-key-more-than-32-bytes'});
assert.equal(await service.meetingShareRecipient({tenantKey:'foreign',account:'222'}),null);
assert.equal(await service.meetingShareRecipient({tenantKey:'fixture',account:'222'}),null);
prior={userId:user};assert.equal((await service.meetingShareRecipient({tenantKey:'fixture',account:'222'})).userId,user,'Original personally verified UOF binding works without work enablement');
prior=null;work=user;assert.equal((await service.meetingShareRecipient({tenantKey:'fixture',account:'222'})).userId,user,'Authenticated work LINE binding works');
prior={userId:other};assert.equal(await service.meetingShareRecipient({tenantKey:'fixture',account:'222'}),null,'Conflicting old/work destinations never guessed');
prior={userId:user};currentAccount='333';assert.equal(await service.meetingShareRecipient({tenantKey:'fixture',account:'222'}),null,'Forward recheck rejects changed account');currentAccount='222';active=false;assert.equal(await service.meetingShareRecipient({tenantKey:'fixture',account:'222'}),null,'Inactive current colleague rejected');
console.log('Meeting share recipient: original UOF and work LINE bindings, exact tenant/OA/account, fresh forward identity, missing and conflicting destinations passed. No messages sent.');

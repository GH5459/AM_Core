import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createLeafTasks} from '../core/leaf-tasks.js';
import {taskEditNotice} from '../core/leaf-task-photos.js';
const sender='U'+'1'.repeat(32),recipient='U'+'2'.repeat(32),group='C'+'3'.repeat(32),mid='12345678901234567',tenant={key:'fixture',tenantId:'fixture-tenant',runtimeEnabled:true};
async function fixture({quote=true,missing=false,badChecksum=false,enabled=true,failPush=false,explanation=false,fast=false,blockDownload=false}={}){
 let config,job,judgmentInput,downloadCount=0,issueCount=0,revoked=false,photoLeased=false,releaseDownload,clock=Date.now();const gate=new Promise(r=>releaseDownload=r),sent=[],calls=[],saved=new Set(),bytes=Buffer.from('fixture PNG bytes');
 const options={now:()=>clock,env:{LINE_CHANNEL_SECRET:'fixture-secret'},tenants:[tenant],store:{service:async()=>config,provisionTasks:async()=>{},configureTask:async(t,v)=>config={encrypted_key:{taskService:{baseUrl:v.baseUrl,encryptedKey:v.encryptedKey}}}},
 router:{resolveGroupBinding:async()=>({tenant,resolution:'active'})},line:{lineGet:async p=>({userId:p.split('/').at(-1)})},resolveIdentity:async(u,t)=>revoked?null:{tenantKey:t,account:u===sender?'sender':'recipient',bindingId:'binding-'+u},
 llm:{completeJson:async()=>({assignments:explanation?[]:[{title:'隔離交辦',description:'隔離說明',recipientIndices:[0]}]})},logger:{warn(){}},
 platform:{centralArchive:{canRetrieveQuote:async()=>!revoked,taskPhoto:async(source,message)=>{assert.equal(source.groupId,group);assert.equal(message,mid);if(missing)throw Error('missing');return {file:{id:'fixture-drive-id',name:'引用圖.png',mimeType:'image/png',size:bytes.length,md5Checksum:crypto.createHash('md5').update(bytes).digest('hex')}};}},drive:{download:async()=>{downloadCount++;if(blockDownload)await gate;return {buffer:badChecksum?Buffer.from('bad'):bytes,contentType:'image/png'};}},pushLineMessage:async(g,m)=>{assert.equal(g,group);if(failPush){failPush=false;throw Error('push timed out');}sent.push(m);},replyLineMessages:async(_,m)=>sent.push(...m)},
 fetchImpl:async(url,init)=>{const path=new URL(url).pathname.split('/').at(-1),v=init.body instanceof FormData?JSON.parse(init.body.get('context')):init.body?JSON.parse(init.body):{};calls.push(path);let out={ok:true};
 if(path==='health')out={ok:true,contract:'line-mention-dailylog-immediate-v1',tenant:'fixture'};
 if(path==='intake')job??={id:v.id,input:v,state:'queued',leaseToken:'fixture-lease'};
 if(path==='next')out.job=job&&!['done','suppressed'].includes(job.state)?structuredClone(job):null;
 if(path==='judgment'){judgmentInput=structuredClone(v.assignments);job.state=v.assignments.length?'judged':'suppressed';}
 if(path==='issue'){assert(judgmentInput?.length,'suppressed judgment cannot issue work');issueCount++;job.state='issued';job.result={taskIds:['work-fixture'],notice:'已交辦。',...(fast?{speedPolicy:'line-task-fast-notice-v1',editEnabled:enabled,...(quote&&enabled?{photo:{state:'pending'}}:{})}:{})};}
 if(path==='notified')job.state='done';
 if(path==='enabled')out={ok:true,enabled,since:0,contract:'line-task-photo-selection-v1',editContract:'line-task-edit-card-v1'};
 if(path==='quoted-status')out={ok:true,imported:saved.has(v.taskId),removed:false};
 if(path==='quoted-upload'){assert.equal(v.messageId,mid);assert.equal(v.taskId,'work-fixture');assert.deepEqual(Buffer.from(await init.body.get('file').arrayBuffer()),bytes);saved.add(v.taskId);out={ok:true,imported:true};}
 if(path==='context')out={ok:true,source:job.input,result:job.result};
 if(path==='photo-next'){if(fast&&job?.state==='done'&&job.result.photo?.state==='pending'&&!photoLeased){photoLeased=true;out.job={...structuredClone(job),state:'issued'};}else out.job=null;}
 if(path==='photo-result'){job.result.photo.state=v.state;photoLeased=false;}
 if(path==='photo-defer'){job.result.photo.state='failed';photoLeased=false;}
 return Response.json(out);
 }};
 const service=createLeafTasks(options);await service.configureService({tenantKey:'fixture',baseUrl:'https://dailylog.example',apiKey:'synthetic-key-at-least-32-characters'});
 const event={type:'message',timestamp:Date.now(),webhookEventId:'fixture-event',source:{type:'group',groupId:group,userId:sender},message:{id:'12345678901234568',type:'text',text:explanation?'@同仁甲 請說明這張圖片的目的':'@同仁 請修正畫面',...(quote?{quotedMessageId:mid}:{}),mention:{mentionees:[{type:'user',userId:recipient}]}}};
 return {service,event,sent,calls,releaseDownload,advance:()=>clock+=61000,revoke:()=>revoked=true,stats:()=>({downloadCount,issueCount,saved:saved.size}),job:()=>job,judgment:()=>judgmentInput};
}
test('replied-image explanation survives second judgment and issues once with original-task edit button',async()=>{const f=await fixture({explanation:true,failPush:true});await f.service.capture([f.event]);await f.service.drain();assert.equal(f.stats().issueCount,1);assert.deepEqual(f.judgment(),[{title:'說明引用圖片的目的',description:'請說明這張圖片的目的',recipientAccounts:['recipient']}]);assert.equal(f.sent.at(-1).contents.footer.contents[0].action.label,'編輯這個任務');assert.equal(new URL(f.sent.at(-1).contents.footer.contents[0].action.uri).searchParams.get('task'),'work-fixture');assert.equal(f.job().state,'done');});
test('quoted image is attached once before edit-card notice; a failed notice retry reuses attachment and task',async()=>{const f=await fixture({failPush:true});await f.service.capture([f.event]);await f.service.drain();assert.deepEqual(f.stats(),{downloadCount:1,issueCount:1,saved:1});const m=f.sent.at(-1);assert.match(m.altText,/引用的照片已附入/);const a=m.contents.footer.contents[0].action;assert.equal(a.type,'uri');assert.equal(a.label,'編輯這個任務');assert.equal(new URL(a.uri).searchParams.get('task'),'work-fixture');assert.equal(new URL(a.uri).searchParams.get('openExternalBrowser'),'1');assert(!f.calls.some(p=>['open','select','confirm','upload','finish'].includes(p)));});
for(const setting of [{missing:true},{badChecksum:true}])test('missing or changed original does not block issued task or ask for a photo session: '+JSON.stringify(setting),async()=>{const f=await fixture(setting);await f.service.capture([f.event]);await f.service.drain();assert.equal(f.stats().issueCount,1);assert.equal(f.stats().saved,0);assert.match(f.sent.at(-1).altText,/未自動加入/);assert.equal(f.sent.at(-1).contents.footer.contents[0].action.type,'uri');assert.equal(f.job().state,'done');});
test('no quote performs no photo transfer; disabled group preserves normal notice',async()=>{for(const opts of [{quote:false},{enabled:false}]){const f=await fixture(opts);await f.service.capture([f.event]);await f.service.drain();assert.equal(f.stats().downloadCount,0);assert.equal(f.calls.includes('quoted-status'),false);assert.equal(f.sent.at(-1).type,opts.enabled===false?undefined:'flex');}});
test('old photo actions open original task editor without resurrecting cancelled selection',async()=>{const f=await fixture();await f.service.capture([f.event]);await f.service.drain();f.calls.length=0;await f.service.handlePhoto({type:'postback',source:f.event.source,replyToken:'fixture',postback:{data:'taskphoto:confirm:'+f.job().id+':0:8'}});assert.deepEqual(f.calls,['context']);assert.equal(f.sent.at(-1).contents.footer.contents[0].action.type,'uri');f.revoke();await f.service.handlePhoto({type:'postback',source:f.event.source,replyToken:'fixture',postback:{data:'taskphoto:open:'+f.job().id+':0'}});assert.equal(f.sent.at(-1).type,'text');});
test('edit links validate task and target origin without carrying identity or bearer',()=>{const m=taskEditNotice('https://dailylog.example',['work-a','work-b'],'已交辦');assert.equal(m.contents.footer.contents.length,2);assert(!JSON.stringify(m).includes('taskphoto:'));assert.throws(()=>taskEditNotice('http://example.test',['work-a'],'x'));assert.throws(()=>taskEditNotice('https://dailylog.example',['../private'],'x'));});
test('fast receipt replies and acknowledges before a blocked image download; background completes same task once',async()=>{
 const f=await fixture({fast:true,blockDownload:true});await f.service.capture([f.event]);await f.service.drain();
 assert.equal(f.job().state,'done');assert.equal(f.sent.length,1);assert.match(f.sent[0].altText,/背景附入/);assert.equal(new URL(f.sent[0].contents.footer.contents[0].action.uri).searchParams.get('task'),'work-fixture');assert(f.calls.indexOf('notified')<f.calls.indexOf('photo-next'));assert(!f.calls.includes('enabled'),'new receipt carries photo policy');
 f.releaseDownload();await f.service.drainPhotos();assert.equal(f.job().result.photo.state,'complete');assert.deepEqual(f.stats(),{downloadCount:1,issueCount:1,saved:1});assert.equal(f.sent.length,1,'no second notice');
});
test('background failure retains issued task and notice; authority change fences upload',async()=>{
 for(const change of ['missing','revoke']){const f=await fixture({fast:true,missing:change==='missing',blockDownload:change==='revoke'});await f.service.capture([f.event]);await f.service.drain();if(change==='revoke'){f.revoke();f.releaseDownload();}await f.service.drainPhotos();assert.equal(f.stats().issueCount,1);assert.equal(f.stats().saved,0);assert.equal(f.sent.length,1);assert.equal(f.job().result.photo.state,'failed');}
});
test('idle drain does not add photo queries every five seconds; new acknowledged work wakes immediately and minute recovery remains',async()=>{
 const f=await fixture({fast:true});await f.service.drain();await new Promise(setImmediate);const count=()=>f.calls.filter(p=>p==='photo-next').length,first=count();assert.equal(first,1,'startup recovers durable jobs');
 for(let i=0;i<3;i++){await f.service.drain();await new Promise(setImmediate);}assert.equal(count(),first,'no repeated idle queries');
 await f.service.capture([f.event]);await f.service.drain();await new Promise(setImmediate);assert(count()>first,'new notice wakes despite recent recovery');assert.equal(f.stats().saved,1);const complete=count();
 await f.service.drain();await new Promise(setImmediate);assert.equal(count(),complete);f.advance();await f.service.drain();await new Promise(setImmediate);assert.equal(count(),complete+1,'bounded recovery catches restart/deferred work');assert.equal(f.service.health().photoRecoverySeconds,60);
});

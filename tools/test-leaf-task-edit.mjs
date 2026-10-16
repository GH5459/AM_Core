import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createLeafTasks} from '../core/leaf-tasks.js';
import {taskEditNotice} from '../core/leaf-task-photos.js';
const sender='U'+'1'.repeat(32),recipient='U'+'2'.repeat(32),group='C'+'3'.repeat(32),mid='12345678901234567',tenant={key:'fixture',tenantId:'fixture-tenant',runtimeEnabled:true};
async function fixture({quote=true,missing=false,badChecksum=false,enabled=true,failPush=false}={}){
 let config,job,downloadCount=0,issueCount=0,revoked=false;const sent=[],calls=[],saved=new Set(),bytes=Buffer.from('fixture PNG bytes');
 const options={env:{LINE_CHANNEL_SECRET:'fixture-secret'},tenants:[tenant],store:{service:async()=>config,provisionTasks:async()=>{},configureTask:async(t,v)=>config={encrypted_key:{taskService:{baseUrl:v.baseUrl,encryptedKey:v.encryptedKey}}}},
 router:{resolveGroupBinding:async()=>({tenant,resolution:'active'})},line:{lineGet:async p=>({userId:p.split('/').at(-1)})},resolveIdentity:async(u,t)=>revoked?null:{tenantKey:t,account:u===sender?'sender':'recipient',bindingId:'binding-'+u},
 llm:{completeJson:async()=>({assignments:[{title:'隔離交辦',description:'隔離說明',recipientIndices:[0]}]})},logger:{warn(){}},
 platform:{centralArchive:{canRetrieveQuote:async()=>!revoked,taskPhoto:async(source,message)=>{assert.equal(source.groupId,group);assert.equal(message,mid);if(missing)throw Error('missing');return {file:{id:'fixture-drive-id',name:'引用圖.png',mimeType:'image/png',size:bytes.length,md5Checksum:crypto.createHash('md5').update(bytes).digest('hex')}};}},drive:{download:async()=>{downloadCount++;return {buffer:badChecksum?Buffer.from('bad'):bytes,contentType:'image/png'};}},pushLineMessage:async(g,m)=>{assert.equal(g,group);if(failPush){failPush=false;throw Error('push timed out');}sent.push(m);},replyLineMessages:async(_,m)=>sent.push(...m)},
 fetchImpl:async(url,init)=>{const path=new URL(url).pathname.split('/').at(-1),v=init.body instanceof FormData?JSON.parse(init.body.get('context')):init.body?JSON.parse(init.body):{};calls.push(path);let out={ok:true};
 if(path==='health')out={ok:true,contract:'line-mention-dailylog-immediate-v1',tenant:'fixture'};
 if(path==='intake')job??={id:v.id,input:v,state:'queued',leaseToken:'fixture-lease'};
 if(path==='next')out.job=job&&job.state!=='done'?structuredClone(job):null;
 if(path==='judgment')job.state='judged';
 if(path==='issue'){issueCount++;job.state='issued';job.result={taskIds:['work-fixture'],notice:'已交辦。'};}
 if(path==='notified')job.state='done';
 if(path==='enabled')out={ok:true,enabled,since:0,contract:'line-task-photo-selection-v1',editContract:'line-task-edit-card-v1'};
 if(path==='quoted-status')out={ok:true,imported:saved.has(v.taskId),removed:false};
 if(path==='quoted-upload'){assert.equal(v.messageId,mid);assert.equal(v.taskId,'work-fixture');assert.deepEqual(Buffer.from(await init.body.get('file').arrayBuffer()),bytes);saved.add(v.taskId);out={ok:true,imported:true};}
 if(path==='context')out={ok:true,source:job.input,result:job.result};
 return Response.json(out);
 }};
 const service=createLeafTasks(options);await service.configureService({tenantKey:'fixture',baseUrl:'https://dailylog.example',apiKey:'synthetic-key-at-least-32-characters'});
 const event={type:'message',timestamp:Date.now(),webhookEventId:'fixture-event',source:{type:'group',groupId:group,userId:sender},message:{id:'12345678901234568',type:'text',text:'@同仁 請修正畫面',...(quote?{quotedMessageId:mid}:{}),mention:{mentionees:[{type:'user',userId:recipient}]}}};
 return {service,event,sent,calls,revoke:()=>revoked=true,stats:()=>({downloadCount,issueCount,saved:saved.size}),job:()=>job};
}
test('quoted image is attached once before edit-card notice; a failed notice retry reuses attachment and task',async()=>{const f=await fixture({failPush:true});await f.service.capture([f.event]);await f.service.drain();assert.deepEqual(f.stats(),{downloadCount:1,issueCount:1,saved:1});const m=f.sent.at(-1);assert.match(m.altText,/引用的照片已附入/);const a=m.contents.footer.contents[0].action;assert.equal(a.type,'uri');assert.equal(a.label,'編輯這個任務');assert.equal(new URL(a.uri).searchParams.get('task'),'work-fixture');assert.equal(new URL(a.uri).searchParams.get('openExternalBrowser'),'1');assert(!f.calls.some(p=>['open','select','confirm','upload','finish'].includes(p)));});
for(const setting of [{missing:true},{badChecksum:true}])test('missing or changed original does not block issued task or ask for a photo session: '+JSON.stringify(setting),async()=>{const f=await fixture(setting);await f.service.capture([f.event]);await f.service.drain();assert.equal(f.stats().issueCount,1);assert.equal(f.stats().saved,0);assert.match(f.sent.at(-1).altText,/未自動加入/);assert.equal(f.sent.at(-1).contents.footer.contents[0].action.type,'uri');assert.equal(f.job().state,'done');});
test('no quote performs no photo transfer; disabled group preserves normal notice',async()=>{for(const opts of [{quote:false},{enabled:false}]){const f=await fixture(opts);await f.service.capture([f.event]);await f.service.drain();assert.equal(f.stats().downloadCount,0);assert.equal(f.calls.includes('quoted-status'),false);assert.equal(f.sent.at(-1).type,opts.enabled===false?undefined:'flex');}});
test('old photo actions open original task editor without resurrecting cancelled selection',async()=>{const f=await fixture();await f.service.capture([f.event]);await f.service.drain();f.calls.length=0;await f.service.handlePhoto({type:'postback',source:f.event.source,replyToken:'fixture',postback:{data:'taskphoto:confirm:'+f.job().id+':0:8'}});assert.deepEqual(f.calls,['context']);assert.equal(f.sent.at(-1).contents.footer.contents[0].action.type,'uri');f.revoke();await f.service.handlePhoto({type:'postback',source:f.event.source,replyToken:'fixture',postback:{data:'taskphoto:open:'+f.job().id+':0'}});assert.equal(f.sent.at(-1).type,'text');});
test('edit links validate task and target origin without carrying identity or bearer',()=>{const m=taskEditNotice('https://dailylog.example',['work-a','work-b'],'已交辦');assert.equal(m.contents.footer.contents.length,2);assert(!JSON.stringify(m).includes('taskphoto:'));assert.throws(()=>taskEditNotice('http://example.test',['work-a'],'x'));assert.throws(()=>taskEditNotice('https://dailylog.example',['../private'],'x'));});

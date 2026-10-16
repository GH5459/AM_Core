import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createArchiveTaskPhotos} from '../core/central-archive/task-photos.js';
import {createTaskPhotos,photoCard,photoNotice} from '../core/leaf-task-photos.js';
const mid='12345678901234567',id='a'.repeat(64),source={type:'group',groupId:'group-a',userId:'actor'},bytes=Buffer.from([137,80,78,71,1,2,3]);
test('actual PostgreSQL limits photos to same OA/group, excludes outgoing, unsent and missing originals; quote can recover an older candidate',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE SCHEMA central_archive;CREATE TABLE central_archive.conversations(key text,bot_id text,source_kind text,source_id text,drive_folder_id text);CREATE TABLE central_archive.jobs(key text,conversation_key text,has_binary boolean,payload jsonb,result jsonb,event_at timestamptz);INSERT INTO central_archive.conversations VALUES('a','bot-a','group','group-a','folder-a'),('b','bot-a','group','group-b','folder-b'),('c','bot-b','group','group-a','folder-c');`);
  const insert=async(k,c='a',type='image',direction='incoming',driveId='file',age=0)=>db.query("INSERT INTO central_archive.jobs VALUES($1,$2,true,$3,$4,now()-$5*interval '1 day')",[k,c,JSON.stringify({direction,event:{type:'message',message:{type,id:k}}}),JSON.stringify({name:k+'.png',driveId}),age]);
  await insert(mid,'a','image','incoming','file',30);for(const c of ['a','b','c'])await insert('image-'+c,c);await insert('text','a','text');await insert('out','a','image','outgoing');await insert('missing','a','image','incoming',null);await insert('unsent');
  await db.query("INSERT INTO central_archive.jobs VALUES('unsend','a',false,$1,'{}',now())",[JSON.stringify({event:{type:'unsend',unsend:{messageId:'unsent'}}})]);
  let enabled=true;const api=createArchiveTaskPhotos({pool:db,botId:'bot-a',canAccess:async()=>enabled,verifyRow:async r=>r.key});
  assert.deepEqual((await api.taskPhotos(source)).map(x=>x.messageId),['image-a']);assert.deepEqual((await api.taskPhotos(source,mid)).map(x=>x.messageId),[mid,'image-a']);assert.equal(await api.taskPhoto(source,mid),mid);await assert.rejects(api.taskPhoto(source,'image-b'));await assert.rejects(api.taskPhoto(source,'unsent'));
  enabled=false;await assert.rejects(api.taskPhotos(source),/access_denied/);
 }finally{await db.close();}
});
test('LINE carousel has bounded cards, explicit selection and no task text or identity in postback payload',()=>{
 const state={version:3,selected:[mid],candidates:Array.from({length:10},(_,i)=>({messageId:i?mid+i:mid,name:'照片.png',at:new Date().toISOString()}))};
 const card=photoCard(id,0,state);assert.equal(card.contents.contents.length,11);assert.match(card.contents.contents[0].footer.contents[0].action.data,/set:.*:3:0:0$/);assert.equal(photoNotice(id,['work-fixture'],'已交辦').contents.footer.contents[0].action.label,'選擇群組照片');
});
function fixture({badChecksum=false,deny=false}={}){
 const sent=[],calls=[];let state={phase:'selecting',version:1,candidates:[{messageId:mid,name:'截圖.png',at:new Date().toISOString()}],selected:[],imported:[]};
 const platform={centralArchive:{canRetrieveQuote:async()=>!deny,taskPhotos:async()=>state.candidates,taskPhoto:async()=>({file:{id:'original-file-id',name:'截圖.png',mimeType:'image/png',size:bytes.length,md5Checksum:crypto.createHash('md5').update(bytes).digest('hex')}})},drive:{download:async()=>({buffer:badChecksum?Buffer.from('changed'):bytes,contentType:'image/png'})},replyLineMessages:async(_,m)=>sent.push(...m)};
 const api=createTaskPhotos({platform,logger:{warn(){}},context:async()=>{if(deny)throw Error('denied');return {source:{quotedMessageId:mid}};},call:async(_ctx,action,input)=>{calls.push(action);if(action==='select'){state={...state,version:2,selected:[input.messageId]};}if(action==='confirm')state.phase='importing';if(action==='upload'){assert.deepEqual(Buffer.from(await input.file.arrayBuffer()),bytes);state.imported.push(input.messageId);}if(action==='finish')state.phase='done';return {ok:true,state:structuredClone(state)};}});
 const send=action=>api.handle({type:'postback',source,replyToken:'fixture',webhookEventId:crypto.randomUUID(),postback:{data:`taskphoto:${action}:${id}:0:1:0:1`}});
 return {sent,calls,send,api};
}
test('explicit selection imports verified original into the same task; success only after persisted finish',async()=>{
 const f=fixture();assert(await f.send('set'));assert.match(f.sent.at(-1).text,/已選 1 張/);assert(!f.calls.includes('upload'));await f.send('confirm');assert.deepEqual(f.calls,['status','select','status','confirm','upload','finish']);assert.match(f.sent.at(-1).text,/已將 1 張照片附到原任務/);
});
test('checksum changes and removed member do not upload or claim success',async()=>{
 const f=fixture({badChecksum:true});await f.send('set');await f.send('confirm');assert(!f.calls.includes('upload'));assert.match(f.sent.at(-1).text,/無法完成/);const denied=fixture({deny:true});await denied.send('open');assert.equal(denied.calls.length,0);assert.match(denied.sent.at(-1).text,/無法完成/);assert.equal(await denied.api.handle({type:'message',message:{type:'text',text:'hello'}}),false);
});

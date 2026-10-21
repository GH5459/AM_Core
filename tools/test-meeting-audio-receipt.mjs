import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createConversationMeetings} from '../modules/meetings/conversation-service.js';
import {keyFor} from '../modules/meetings/conversation-store.js';

const pg=new PGlite();
for(const f of ['core/central-archive/schema.sql','modules/meetings/conversations.sql','modules/meetings/workspace.sql'])
 await pg.exec(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
await pg.exec("CREATE FUNCTION pg_try_advisory_lock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true'; CREATE FUNCTION pg_advisory_unlock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true';");
const pool={query:(...a)=>pg.query(...a),connect:async()=>({...pool,release(){}})};
const bot='U'+'b'.repeat(32),host='U'+'1'.repeat(32),group='C'+'a'.repeat(32);
const event=(id,type='file')=>({type:'message',timestamp:Date.now(),webhookEventId:'event-'+id,
 source:{type:'group',groupId:group,userId:host},message:{id,type,fileName:'synthetic.m4a'},replyToken:'never-store'});
const key=keyFor(bot,event('one').source);
await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,bot,'group',group]);
await pg.query('INSERT INTO central_archive.meeting_workspace_release(contract,cutover_at) VALUES($1,$2)', ['collaborative-meeting-workspace-v1','2026-01-01']);
const pushes=[],warnings=[];let failPush=false,profileCalls=0;
const forbidden=async()=>{throw Error('external dependency must not precede receipt');};
const platform={publicBaseUrl:'https://example.test',resolveSenderName:async()=>{profileCalls++;return '合成主持人';},
 lineGet:async()=>({userId:host,displayName:'合成主持人'}),pushLineMessage:async(to,message,_mention,delivery)=>{
  assert.equal(to,group);
  const durable=await pg.query("SELECT * FROM central_archive.meeting_events WHERE payload->'message'->>'id'=$1",[current.message.id]);
  assert(durable.rows.length,'persist the recovery event before sending');
  assert(!JSON.stringify(durable.rows).includes('never-store'));
  if(failPush)throw Error('temporary push failure');pushes.push({message,retryKey:delivery.retryKey});
 }};
const service=createConversationMeetings({env:{AMCORE_CONVERSATION_MEETINGS_ENABLED:'1',AMCORE_MEETINGS_PARENT_PAGE_ID:'1'.repeat(32),AMCORE_MEETING_MANAGEMENT_SECRET:'x'.repeat(40)},
 archive:{pool,config:{botId:bot},notion:{request:forbidden},original:forbidden},platform,router:{resolveGroupBinding:forbidden},tenants:[],
 meetingModule:{isAudio:m=>m?.type==='audio'||m?.type==='file'&&m.fileName?.endsWith('.m4a')},logger:{warn:s=>warnings.push(s)}});
let current=event('one');
const started=Date.now();assert.equal((await service.capture([current])).length,1);
assert.equal(pushes.length,1);assert.equal(profileCalls,0);
const firstMs=Date.now()-started;
await service.capture([current]);assert.equal(pushes.length,1,'redelivery uses the original receipt');
let workspace=(await pg.query('SELECT * FROM central_archive.meeting_workspaces')).rows[0];
assert.equal(workspace.state,'offered');assert.equal(workspace.receipt.offerSent,true);
// Even an indefinitely blocked background recovery cannot delay a new receipt.
let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
service.workspace.drain=async()=>{entered();await gate;throw Error('synthetic background outage');};
const background=service.drain().catch(()=>{});await ready;
current=event('two','audio');await service.capture([current]);assert.equal(pushes.length,2);
release();await background;
// Failed sends remain recoverable, using the same workspace and retry identity.
current=event('three');failPush=true;await service.capture([current]);assert.equal(pushes.length,2);assert(warnings.length);
const failed=(await pg.query('SELECT * FROM central_archive.meeting_workspaces WHERE message_id=$1',['three'])).rows[0];
assert.equal(failed.state,'offered');assert(!failed.receipt.offerSent);
failPush=false;await service.capture([current]);assert.equal(pushes.length,3);
assert.equal(pushes.at(-1).retryKey,'workspace-offer:'+failed.id);
await service.workspace.offer(await service.store.get(key),current,'synthetic.m4a','合成主持人');
assert.equal(pushes.length,3);assert.equal((await service.workspace.store.get(failed.id)).host_name,'合成主持人');
// Disabled conversations, personal defaults, non-audio and legacy recordings stay unchanged.
await pg.query('UPDATE central_archive.meeting_settings SET enabled=false WHERE conversation_key=$1',[key]);
current=event('disabled');await service.capture([current]);assert.equal(pushes.length,3);
await pg.query('UPDATE central_archive.meeting_settings SET enabled=true WHERE conversation_key=$1',[key]);
current=event('text','text');await service.capture([current]);assert.equal(pushes.length,3);
current={...event('legacy'),timestamp:Date.parse('2025-01-01')};await service.capture([current]);assert.equal(pushes.length,3);
current=event('personal');current.source={type:'user',userId:host};const personalKey=keyFor(bot,current.source);
await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[personalKey,bot,'user',host]);
await service.capture([current]);assert.equal(pushes.length,3);assert.equal((await service.store.get(personalKey)).enabled,false);
assert.equal(service.health().audioReceipt,'persisted-intake-before-background-v1');
const query=pool.query;
pool.query=async(sql,...args)=>{if(sql.includes('INSERT INTO central_archive.meeting_events'))throw Error('synthetic database outage');return query(sql,...args);};
current=event('not-persisted');await assert.rejects(service.capture([current]),/database outage/);
assert.equal(pushes.length,3,'a failed durable write must never send a receipt');pool.query=query;
const first=workspace;
await service.workspace.choice({source:{...event('one').source,userId:'U'+'9'.repeat(32)},postback:{data:'meetingwork:yes:'+first.id}},key);
assert.equal((await service.workspace.store.get(first.id)).state,'offered','another member cannot consent for the uploader');
const originalPush=platform.pushLineMessage;platform.pushLineMessage=async(to,message)=>{assert.equal(to,group);assert.equal(typeof message,'string');};
await service.workspace.choice({source:event('one').source,postback:{data:'meetingwork:yes:'+first.id}},key);
const chosen=await service.workspace.store.get(first.id);assert.equal(chosen.state,'setup');assert.equal(chosen.host_name,'合成主持人');
platform.pushLineMessage=originalPush;
// Reproduce the production pool limit: archive lock + dispatch lock + query.
// Holding the outer conversation lock here would consume the last connection.
let leased=0;
const connect=pool.connect;
pool.connect=async()=>{assert(leased<3,'three-connection pool exhausted by nested recovery locks');leased++;
 return {query:(...a)=>pg.query(...a),release(){leased--;}};};
pool.query=async(...a)=>{const db=await pool.connect();try{return await db.query(...a);}finally{db.release();}};
const archiveLock=await pool.connect();let dispatchQueryFinished=false;
service.workspace.drain=async()=>{const dispatchLock=await pool.connect();try{await pool.query('SELECT 1');dispatchQueryFinished=true;}finally{dispatchLock.release();}throw Error('end-pool-probe');};
await assert.rejects(service.drain(),/end-pool-probe/);assert(dispatchQueryFinished);assert.equal(leased,1);
archiveLock.release();pool.query=query;pool.connect=connect;
await pg.close();console.log(JSON.stringify({passed:true,syntheticFirstReceiptMs:firstMs,blockedBackgroundIndependent:true,retryAndRedelivery:true,sourceAndConsentRetained:true}));

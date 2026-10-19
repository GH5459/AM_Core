import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {meetingTaskDispatch} from '../modules/meetings/task-dispatch.js';
const pg=new PGlite();for(const f of ['core/central-archive/schema.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
await pg.exec("CREATE FUNCTION pg_try_advisory_lock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true'; CREATE FUNCTION pg_advisory_unlock(integer) RETURNS boolean LANGUAGE SQL AS 'SELECT true';");
const pool={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
const id='a'.repeat(64),key='b'.repeat(64),bot='U'+'b'.repeat(32),host='U'+'1'.repeat(32),one='U'+'2'.repeat(32),two='U'+'3'.repeat(32),todo1='todo:11111111-1111-4111-8111-111111111111',todo2='todo:22222222-2222-4222-8222-222222222222';
const row={key,enabled:true,source_kind:'group',source_id:'C'+'c'.repeat(32),connection_state:'active'};
await pool.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,bot,'group',row.source_id]);
const fields={settings:{date:'2026-10-19',projectGoal:'可追蹤的會議任務'},[todo1]:{ownerId:one,content:'核對資料',due:'2026-10-25',evidence:'錄音 01:20 決議'},[todo2]:{ownerId:two,content:'確認交付',due:'2026-10-26',evidence:'錄音 02:30 決議'}};
await pool.query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,source,filename,state,fields,receipt,revision) VALUES($1,$2,'source-a',$3,'主持人',$4::jsonb,'fixture.m4a','published',$5::jsonb,$6::jsonb,5)`,[id,key,host,JSON.stringify({message:{id:'source-a'},timestamp:1}),JSON.stringify(fields),JSON.stringify({notionId:'same-notion-page'})]);
const store={get:async id=>(await pool.query('SELECT * FROM central_archive.meeting_workspaces WHERE id=$1',[id])).rows[0]};
const ids=new Map(),identity=u=>({userId:u,account:u===host?'111':u===one?'222':'333',bindingId:'original-'+u,tenantKey:'fixture',name:'合成同仁'});
ids.set(host,identity(host));ids.set(one,identity(one));
const calls=[],receipts=new Map(),tasks=new Map();let lose=false;
const platform={meetingTaskIdentity:async u=>ids.get(u)||null,publishMeetingTasks:async({preparedPayload:p})=>{
 calls.push(structuredClone(p));const operation=p.id+':delivery:'+p.deliverySequence,hash=JSON.stringify(p);
 if(receipts.has(operation)){assert.equal(receipts.get(operation).hash,hash,'Lost replies must reuse the exact frozen request');return receipts.get(operation).result;}
 for(const t of p.tasks)tasks.set(t.id,{id:'work-'+t.id.slice(5),content:t.content,due:t.due,owner:t.owner.account,evidence:t.evidence});
 for(const t of p.removed)tasks.get(t).withdrawn=true;
 const result={tasks:[...tasks.values()]};receipts.set(operation,{hash,result});if(lose){lose=false;throw Error('reply_lost_after_commit');}return result;
}};
const args={pool,store,botId:bot,platform,conversation:async()=>row,assertMember:async(_,u)=>assert([host,one,two].includes(u)),link:id=>'https://fixture.example.test/meetings/'+id,logger:{warn(){}}};
let dispatch=meetingTaskDispatch(args);await dispatch.enqueue(await store.get(id));
await dispatch.run(id);assert.equal(tasks.size,1);assert.deepEqual((await dispatch.status(await store.get(id))).items.map(x=>x.state),['delivered','pending']);
// Edit and cancel an unconnected person's item before connection. No stale task
// or discarded deadline may be sent later.
fields[todo2].content='最新確認交付';fields[todo2].due='2026-11-03';await pool.query('UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb,revision=6 WHERE id=$1',[id,JSON.stringify(fields)]);
await dispatch.run(id);assert.equal(calls.length,1);ids.set(two,identity(two));lose=true;await dispatch.run(id);assert.equal(tasks.size,2);assert.equal(tasks.get(todo2).content,'最新確認交付');assert.equal(tasks.get(todo2).due,'2026-11-03');
dispatch=meetingTaskDispatch(args);await dispatch.run(id);assert.equal(tasks.size,2);assert.equal(calls.length,3);assert.deepEqual(calls[1],calls[2]);
await dispatch.run(id);assert.equal(calls.length,3,'Unchanged deliveries do not rewrite original task progress');
// Removing an assigned source keeps the original task with a withdrawal note.
fields[todo2].ownerId='';await pool.query('UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb,revision=7 WHERE id=$1',[id,JSON.stringify(fields)]);await dispatch.run(id);assert(tasks.get(todo2).withdrawn);assert.equal(tasks.size,2);
// Same LINE identity must not silently transfer a task to a different account.
ids.set(one,{...identity(one),account:'other-account'});fields[todo1].content='變更內容';await pool.query('UPDATE central_archive.meeting_workspaces SET fields=$2::jsonb WHERE id=$1',[id,JSON.stringify(fields)]);const count=calls.length;await dispatch.run(id);assert.equal(calls.length,count);assert((await dispatch.status(await store.get(id))).message.includes('身分'));
ids.set(one,{...identity(one),tenantKey:'another-service'});await dispatch.run(id);assert.equal(calls.length,count,'Cross-service copies are refused');
ids.delete(host);await dispatch.run(id);assert((await dispatch.status(await store.get(id))).message.includes('主持人'));
assert.equal((await store.get(id)).state,'published');assert.equal((await store.get(id)).receipt.notionId,'same-notion-page');
await pg.close();console.log('Deferred meeting tasks: partial readiness, latest edits, original due/evidence, lost reply/restart idempotency, cancellation, identity/service refusal and published meeting preservation passed.');

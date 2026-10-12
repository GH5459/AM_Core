import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveFileLookup} from '../core/central-archive/file-lookup.js';
import {PGlite} from '@electric-sql/pglite';
const source={type:'group',groupId:'synthetic-current-group',userId:'synthetic-current-member'};
const row={key:'synthetic-original',source_kind:'group',source_id:source.groupId,result:{driveId:'synthetic-file'}};
test('query isolates bot, conversation, incoming binary and exact name before verifying Drive metadata',async()=>{
 let checked=0;const lookup=createArchiveFileLookup({botId:'synthetic-bot',canAccess:async s=>s===source,pool:{query:async(sql,params)=>{assert.match(sql,/c.bot_id=\$1 AND c.source_kind=\$2 AND c.source_id=\$3/);assert.match(sql,/j.has_binary=true/);assert.match(sql,/direction.*incoming/);assert.match(sql,/LIMIT 2/);assert.deepEqual(params,['synthetic-bot','group',source.groupId,'舊照片.png']);return {rows:[row]};}},verifyRow:async(r,scope)=>{checked++;assert.equal(r,row);assert.equal(scope.groupId,source.groupId);return {file:{id:'synthetic-file'}};}});
 assert((await lookup('舊照片.png',source)).file);assert.equal(checked,1);
});
test('membership removal cannot trigger archive enumeration',async()=>{
 const lookup=createArchiveFileLookup({canAccess:async()=>false,pool:{query:async()=>{throw Error('must not query');}}});await assert.rejects(lookup('example.pdf',source),/access_denied/);
});
test('same-name ambiguity and foreign-conversation rows never deliver a file',async()=>{
 for(const rows of [[row,row],[{...row,source_id:'different-group'}]]){
  const lookup=createArchiveFileLookup({canAccess:async()=>true,pool:{query:async()=>({rows})},verifyRow:async()=>{throw Error('must not verify');}});
  await assert.rejects(lookup('example.pdf',source),/ambiguous|source_mismatch/);
 }
});
test('missing originals return null and a blank name cannot search all archived files',async()=>{
 const lookup=createArchiveFileLookup({canAccess:async()=>true,pool:{query:async()=>({rows:[]})}});
 assert.equal(await lookup('example.pdf',source),null);await assert.rejects(lookup('',source),/specify/);
});
test('actual PostgreSQL filename query cannot mix bots, groups, text messages or outgoing copies',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE SCHEMA central_archive;
   CREATE TABLE central_archive.conversations(key text,bot_id text,source_kind text,source_id text,drive_folder_id text);
   CREATE TABLE central_archive.jobs(key text,conversation_key text,has_binary boolean,payload jsonb,result jsonb,event_at timestamptz);
   INSERT INTO central_archive.conversations VALUES ('a','bot-a','group','group-a','folder-a'),('b','bot-a','group','group-b','folder-b'),('c','bot-b','group','group-a','folder-c');`);
  for(const [key,conversation,binary,direction] of [['valid','a',true,'incoming'],['other-group','b',true,'incoming'],['other-bot','c',true,'incoming'],['outgoing','a',true,'outgoing'],['text','a',false,'incoming']])
   await db.query('INSERT INTO central_archive.jobs VALUES ($1,$2,$3,$4,$5,now())',[key,conversation,binary,JSON.stringify({direction,event:{message:{fileName:'照片.png'}}}),JSON.stringify({name:'照片.png'})]);
  const lookup=createArchiveFileLookup({pool:db,botId:'bot-a',canAccess:async()=>true,verifyRow:async r=>r.key});
  assert.equal(await lookup('照片.png',{type:'group',groupId:'group-a'}),'valid');
  assert.equal(await lookup('不存在.png',{type:'group',groupId:'group-a'}),null);
  await db.exec("INSERT INTO central_archive.jobs SELECT 'duplicate',conversation_key,has_binary,payload,result,event_at FROM central_archive.jobs WHERE key='valid'");
  await assert.rejects(lookup('照片.png',{type:'group',groupId:'group-a'}),/ambiguous/);
 }finally{await db.close();}
});

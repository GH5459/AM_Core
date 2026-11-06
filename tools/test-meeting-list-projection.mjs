import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {meetingHub} from '../modules/meetings/hub-service.js';
import {visibleMeetingRows} from '../modules/meetings/hub-list.js';
import {createMeetingConversationStore} from '../modules/meetings/conversation-store.js';
import {meetingPublication} from '../modules/meetings/publication-target.js';

const pg=new PGlite();
for(const f of ['core/central-archive/schema.sql','modules/meetings/conversations.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const bot='U'+'b'.repeat(32),viewer='U'+'1'.repeat(32),host='U'+'2'.repeat(32),operatorHost='U'+'3'.repeat(32),who={account:'111',tenantKey:'fixture'},actor={id:viewer},keys=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],ids=Array.from({length:46},(_,i)=>(i+1).toString(16).padStart(64,'0'));
for(const [i,key]of keys.entries()){
 await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,bot,i===2?'user':'group',i===2?viewer:'C'+String(i).repeat(32)]);
 await pg.query("INSERT INTO central_archive.meeting_settings(conversation_key,enabled,connection_state,tenant_key) VALUES($1,true,'active','fixture')",[key]);
}
const publicationTarget={key:keys[0],botId:bot,sourceId:'C'+'0'.repeat(32),kind:'group',tenantKey:'fixture'};
for(const [i,id]of ids.entries()){
 const state=i===45?'declined':i===44?'offered':['published','setup','review','failed'][i%4],owner=i%7===0?viewer:i%5===0?operatorHost:host;
 const fields={settings:{topic:i%2?'':'Fixture '+i,date:'2026-11-06',prompt:'Original prompt'},record:'Synthetic record '.repeat(500),transcript:'Synthetic transcript '.repeat(1500),'todo:valid':{content:'One task',ownerId:host},'todo:null':null,'todo:false':false,'todo:zero':0,'todo:empty':'','todo:legacy':'Legacy string','todo:array':[],'todo:true':true,'nontodo:ignored':{content:'Ignored'}};
 const receipt={publicationTarget,externalCalendarSource:{account:'111',calendarId:'original-calendar',eventId:'original-event-'+i},generationSnapshot:{large:'Unused generation '.repeat(1000)}};
 await pg.query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,filename,source,state,fields,receipt,result,record_blocks,shared_people,created_at) VALUES($1,$2,$3,$4,'Fixture host','unused.wav','{}'::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,[id,keys[i%3],String(i),owner,state,JSON.stringify(fields),JSON.stringify(receipt),JSON.stringify({transcript:'Unused generated result '.repeat(1000)}),JSON.stringify([{text:'Unused blocks '.repeat(1000)}]),JSON.stringify(i%2?[{tenantKey:'fixture',account:'111'}]:[]),new Date(Date.UTC(2026,10,6,0,i))]);
 await pg.query(`INSERT INTO central_archive.meeting_plans(workspace_id,tenant_key,topic,start_at,end_at,participants,cancelled) VALUES($1,'fixture',$2,$3,$4,$5::jsonb,$6)`,[id,'Plan '+i,new Date(Date.UTC(2026,10,6,0,i)),new Date(Date.UTC(2026,10,6,1,i)),JSON.stringify(i%11===0?[{account:'111'}]:[]),i%13===0]);
}
let projectedBytes=0,originalBytes=0;
function makeHub(original){const pool={query:async(sql,args)=>{
 const list=sql.startsWith('SELECT w.id,w.conversation_key,w.host_id,w.host_name,w.state,w.revision,');
 if(list&&original)sql=sql.replace(/^SELECT [\s\S]*?,a\.state AS attention_state,/, 'SELECT w.*,a.state AS attention_state,');
 const result=await pg.query(sql,args);if(list){if(original)originalBytes+=Buffer.byteLength(JSON.stringify(result.rows));else projectedBytes+=Buffer.byteLength(JSON.stringify(result.rows));}return result;
 }};
 const conversations=createMeetingConversationStore(pool,bot),assertMember=async row=>{if(!row||row.key===keys[1])throw Error('Not a source member');};
 const publication=meetingPublication({pool,store:{},botId:bot,getConversation:conversations.get,assertMember});
 return meetingHub({pool,botId:bot,platform:{meetingShareIdentity:async()=>who},env:{},store:{},base:()=> 'https://fixture.example',getConversation:conversations.get,assertMember,publicationReader:publication.reader,startAuthority:{granted:()=>true,allows:async(user,r,row)=>{assert(r.id&&r.host_id&&row?.bot_id===bot);return r.host_id===operatorHost;}}});
}
const old=makeHub(true),current=makeHub(false);let compared=0;
for(const scope of ['all','shared'])for(const offset of [0,40,80]){
 const a=await old.inventory(actor,{action:'list',scope,offset}),b=await current.inventory(actor,{action:'list',scope,offset});
 assert.equal(JSON.stringify(b),JSON.stringify(a),'Exact list bytes, order and next for '+scope+'/'+offset);compared++;
 for(const item of b.items){assert(!('transcript' in item));assert(!('record' in item));if(item.taskTotal!==null&&item.taskTotal!==undefined)assert.equal(item.taskTotal,4,'Original truthy todo semantics retained');if(item.calendarSource){const i=ids.indexOf(item.id);assert.equal(i%7,0,'Only actual host gets personal Calendar reference');}if(item.kind==='發布群組會議'){assert.equal(item.end,null);assert.equal(item.cancelled,false);}}
}
assert(projectedBytes<originalBytes/10,'The original list no longer transports transcript/generation payloads');

// Five unique sources must start even when the first ten rows share one source.
let release;const gate=new Promise(r=>release=r),started=[],counts=new Map();let active=0,maxActive=0;
const sourceRows=[...Array.from({length:10},(_,i)=>({id:'a'+i,conversation_key:'a',host_id:host})),...['b','c','d','e','f'].map(key=>({id:key,conversation_key:key,host_id:host}))];
const conversation=key=>({key,bot_id:bot,source_kind:'group',source_id:key,tenant_key:'fixture'});
const running=visibleMeetingRows({rows:sourceRows,actor,who,getConversation:async key=>conversation(key),assertMember:async row=>{started.push(row.key);counts.set(row.key,(counts.get(row.key)||0)+1);active++;maxActive=Math.max(maxActive,active);await gate;active--;},publicationReader:async()=>false});
for(let n=0;n<10;n++)await new Promise(r=>setImmediate(r));
assert.equal(new Set(started).size,5,'Duplicate rows cannot occupy all five source slots');assert.equal(started.length,5);release();
assert.deepEqual((await running).map(e=>e.r.id),sourceRows.map(r=>r.id));assert.equal(maxActive,5);assert.equal(counts.get('a'),2,'Reused source gets original final fresh check');for(const key of ['b','c','d','e','f'])assert.equal(counts.get(key),1);

// Source read failures reject the whole operation. Member failures retain
// independent operator/publication decisions for every meeting.
await assert.rejects(visibleMeetingRows({rows:sourceRows,actor,who,getConversation:async()=>{throw Error('database unavailable');},assertMember:async()=>{},publicationReader:async()=>true}),/database unavailable/);
let operatorChecks=0,publicationChecks=0;
const pair=sourceRows.slice(0,2),fallback=await visibleMeetingRows({rows:pair,actor,who,getConversation:async key=>conversation(key),assertMember:async()=>{throw Error('removed');},startAuthority:{granted:()=>true,allows:async()=>++operatorChecks===1},publicationReader:async()=>{publicationChecks++;return false;}});
assert.equal(operatorChecks,2);assert.equal(publicationChecks,1);assert.deepEqual(fallback.map(e=>e.r.id),[pair[0].id],'A grant on one meeting is not reused for another');
let memberReads=0;const revoked=await visibleMeetingRows({rows:pair,actor,who,getConversation:async key=>conversation(key),assertMember:async()=>{if(++memberReads>1)throw Error('revoked');},publicationReader:async()=>false});assert.equal(revoked.length,0);assert.equal(memberReads,2);
let sourceReads=0;const changed=await visibleMeetingRows({rows:pair,actor,who,getConversation:async key=>({...conversation(key),source_id:++sourceReads===1?'before':'after'}),assertMember:async()=>{},publicationReader:async()=>false});assert.equal(changed.length,0);
await pg.close();console.log(JSON.stringify({passed:true,exactPageComparisons:compared,originalBytes,projectedBytes,maxConcurrentSources:maxActive,checks:['all/shared pagination and ordering','truthy todo legacy values','Calendar host privacy','publication destination guard','five unique sources start','source failure closed','per-meeting alternate authority','final member revocation','changed source identity']}));

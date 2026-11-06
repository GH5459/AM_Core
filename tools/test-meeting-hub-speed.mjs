import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {meetingHub} from '../modules/meetings/hub-service.js';
import {createMeetingConversationStore} from '../modules/meetings/conversation-store.js';
import {visibleMeetingRows} from '../modules/meetings/hub-list.js';

const pg=new PGlite();
for(const f of ['core/central-archive/schema.sql','modules/meetings/conversations.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
let queries=0,memberCalls=0,publicationCalls=0,identityCalls=0,revoked=false,revokeAtEnd=false;
const pool={query:(...a)=>{queries++;return pg.query(...a);}},bot='U'+'b'.repeat(32),host='U'+'1'.repeat(32),viewer='U'+'2'.repeat(32),actor={id:viewer},who={account:'222',tenantKey:'fixture'},keys=['a'.repeat(64),'b'.repeat(64)];
for(const [i,key] of keys.entries()){
 await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,bot,'group','C'+String(i).repeat(32)]);
 await pg.query("INSERT INTO central_archive.meeting_settings(conversation_key,enabled,connection_state,tenant_key) VALUES($1,true,'active','fixture')",[key]);
}
const ids=Array.from({length:40},(_,i)=>(i+1).toString(16).padStart(64,'0'));
for(const [i,id] of ids.entries())await pg.query(`INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,filename,source,state,fields,created_at) VALUES($1,$2,$3,$4,'Fixture host','','{}'::jsonb,'published',$5::jsonb,$6)`,[id,keys[i%2],String(i),host,JSON.stringify({settings:{topic:'Fixture '+i,date:'2026-11-06'},todos:[]}),new Date(Date.UTC(2026,10,6,0,i))]);
const conversations=createMeetingConversationStore(pool,bot),membershipBySource=new Map();
const config={pool,botId:bot,platform:{meetingShareIdentity:async()=>{identityCalls++;return who;}},env:{},store:{},base:()=> 'https://fixture.example',getConversation:conversations.get,
 assertMember:async row=>{memberCalls++;membershipBySource.set(row.key,(membershipBySource.get(row.key)||0)+1);if(revoked||revokeAtEnd&&membershipBySource.get(row.key)>1)throw Error('revoked');},publicationReader:async()=>{publicationCalls++;return false;}};
const hub=meetingHub(config);
function reset(){queries=memberCalls=publicationCalls=identityCalls=0;membershipBySource.clear();}
reset();let result=await hub.inventory(actor,{action:'list'});
assert.equal(result.items.length,40);assert.deepEqual(result.items.map(x=>x.id),[...ids].reverse(),'Database order remains stable across concurrent permission checks');
assert.equal(queries,5,'One inventory read and two fresh conversation reads per distinct source');assert.equal(memberCalls,4);assert.equal(publicationCalls,0);assert.equal(identityCalls,1);assert.equal(result.next,40);
reset();revokeAtEnd=true;result=await hub.inventory(actor,{action:'list'});assert.equal(result.items.length,0,'Mid-request source revocation is applied to every matching meeting');assert.equal(memberCalls,4);assert.equal(publicationCalls,40);revokeAtEnd=false;
reset();revoked=true;result=await hub.inventory(actor,{action:'list'});assert.equal(result.items.length,0);assert.equal(memberCalls,2,'Denied results are shared only within this operation');revoked=false;
reset();assert.equal((await hub.inventory(actor,{action:'list'})).items.length,40,'Next operation freshly evaluates source membership');assert.equal(memberCalls,4);
await pg.query('UPDATE central_archive.meeting_workspaces SET host_id=$1',[viewer]);reset();result=await hub.inventory(actor,{action:'list'});assert.equal(result.items.length,40);assert.equal(queries,1,'Host access never needs an unused per-meeting conversation read');assert.equal(memberCalls,0);assert.equal(publicationCalls,0);
await pg.query('UPDATE central_archive.meeting_workspaces SET host_id=$1',[host]);
await pg.query(`INSERT INTO central_archive.meeting_plans(workspace_id,tenant_key,participants) SELECT id,'fixture','[{"account":"222"}]'::jsonb FROM central_archive.meeting_workspaces`);
reset();result=await hub.inventory(actor,{action:'list'});assert(result.items.every(x=>x.kind==='受邀會議'));assert.equal(queries,1);assert.equal(memberCalls,0);
await pg.query(`UPDATE central_archive.meeting_plans SET participants='[]'::jsonb`);reset();revoked=true;assert.equal((await hub.inventory(actor,{action:'list'})).items.length,0,'Removing invite never retains prior authority');revoked=false;
let active=0,maxActive=0;
const rows=Array.from({length:12},(_,i)=>({id:String(i),conversation_key:String(i),host_id:host,tenant_key:'fixture',participants:[]}));
const read=key=>({key,bot_id:bot,source_kind:'group',source_id:key,tenant_key:'fixture'});
const delayed=await visibleMeetingRows({rows,actor,who,getConversation:async key=>{active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setTimeout(r,key==='0'?15:1));active--;return read(key);},assertMember:async()=>{},publicationReader:async()=>false});
assert.deepEqual(delayed.map(x=>x.r.id),rows.map(x=>x.id));assert(maxActive<=5&&maxActive>1,'Distinct sources use bounded concurrency');
let reads=0;const changed=await visibleMeetingRows({rows:[rows[0],{...rows[0],id:'duplicate-source'}],actor,who,getConversation:async key=>({...read(key),source_id:++reads===1?'old':'new'}),assertMember:async()=>{},publicationReader:async()=>false});assert.equal(changed.length,0,'Changed source identity cannot reuse an earlier member result');
const fallback=await visibleMeetingRows({rows:[rows[0]],actor,who,getConversation:async()=>null,assertMember:async()=>{throw Error('not source member');},publicationReader:async(r,id)=>r.id==='0'&&id===viewer});assert.equal(fallback[0].kind,'發布群組會議');
let operatorChecks=0;const assistedConfig={rows:[rows[0],{...rows[0],id:'operator-second'}],actor,who,getConversation:async key=>read(key),assertMember:async()=>{throw Error('not source member');},publicationReader:async()=>false,startAuthority:{granted:identity=>identity===who,allows:async(id,r,row)=>{operatorChecks++;return id===viewer&&row.key===r.conversation_key&&r.id==='0';}}};
const assisted=await visibleMeetingRows(assistedConfig);assert.equal(operatorChecks,2,'Operator authority stays a fresh per-meeting check');assert.equal(assisted.length,1);assert.equal(assisted[0].kind,'整理協助會議');assistedConfig.startAuthority.granted=()=>false;assert.equal((await visibleMeetingRows(assistedConfig)).length,0,'Revoked operator grant is not reused');
assert.equal((await visibleMeetingRows({rows:[rows[0]],actor:{id:host},who,getConversation:async()=>{throw Error('unused');},assertMember:async()=>{throw Error('unused');},publicationReader:async()=>false}))[0].kind,'本人會議');
await assert.rejects(hub.inventory(actor,{action:'list',offset:-1}),e=>e.status===400);
await pg.close();console.log('Meeting hub speed: 40 rows/2 sources use 5 SQL reads and 4 fresh member checks; original order, host/invite/current membership, mid-read revocation, source identity change, alternate publication and bounded concurrency passed.');

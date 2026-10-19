import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createGlossaryStore,glossaryPrompt,checkTerm} from '../modules/meetings/glossary.js';
import meeting from '../modules/meetings/index.js';
const originalFetch=globalThis.fetch;
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
await f.pg.exec("CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT';");
const r=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0];
async function api(input,token='host',id=r.id,origin=f.platform.publicBaseUrl){
 let status=200,body='';const req=Readable.from([JSON.stringify(input)]);req.method='POST';req.headers={...(token?{authorization:'Bearer '+token}:{}),origin};
 await f.service.handle(req,{setHeader(){},get headersSent(){return false;},writeHead(s){status=s;},set statusCode(s){status=s;},end(v){body=v;}},new URL(f.platform.publicBaseUrl+'/meetings/review/work/'+id+'/api'));return {status,value:JSON.parse(body)};
}
const entry={term:'合成星河館',aliases:['合成新河管'],note:'測試用館名，僅用於該館討論。',enabled:true,version:0};
async function page(path){let status=200,html='';const req={method:'GET',headers:{host:new URL(f.platform.publicBaseUrl).host}};await f.service.handle(req,{setHeader(){},set statusCode(s){status=s;},end(v){html=v;}},new URL(path,f.platform.publicBaseUrl));return {status,html};}
for(const path of ['/meetings/review/work/'+r.id+'/glossary','/meetings/review?liff.state='+encodeURIComponent('/work/'+r.id+'/glossary')]){const p=await page(path);assert.equal(p.status,200);assert(p.html.includes('"glossaryOnly":true'));assert(p.html.includes('"publicAvailable":false'));assert(p.html.includes('"loginUrl":"'+f.platform.publicBaseUrl+'/meetings/review/work/'+r.id+'/glossary"'));}
assert.equal((await api({action:'glossary-list'},'')).status,401);
assert.equal((await api({action:'glossary-list'},'outside')).status,403);
assert.equal((await api({action:'glossary-save',entry},'member')).status,403);
assert.equal((await api({action:'glossary-save',entry},'host',r.id,'https://foreign.test')).status,403);
let result=await api({action:'glossary-save',entry});assert.equal(result.status,200,JSON.stringify(result.value));
let saved=result.value.entries[0];assert.equal(saved.term,entry.term);assert.equal(saved.version,1);
assert.equal((await api({action:'glossary-save',entry})).status,409,'Reject duplicate canonical terms');
assert.equal((await api({action:'glossary-save',entry:{...entry,term:'其他用詞'}})).status,409,'Reject conflicting alias');
assert.equal((await api({action:'glossary-save',entry:{...saved,version:0}})).status,409);
assert.equal((await api({action:'glossary-save',entry:{...entry,aliases:['x'.repeat(81)]}})).status,400);
const other=createGlossaryStore(f.pool,'other-bot');assert.deepEqual(await other.list(),[]);
await assert.rejects(()=>other.save({id:r.host_id},{...saved,version:1}),/更新/);
assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM central_archive.meeting_glossary_changes')).rows[0].n,1);
const full=createGlossaryStore(f.pool,'full-service');await f.pg.query("INSERT INTO central_archive.meeting_glossary(bot_id,id,term) SELECT 'full-service',md5(n::text)::uuid,'term-'||n FROM generate_series(1,100) n");await assert.rejects(()=>full.save({id:r.host_id},entry),/100/);
// Different conversations on the same service use exactly the same vocabulary.
const second=await f.service.store.create(f.row.key,{...f.event,message:{id:'glossary-second'}},'fixture2.m4a','主持人');
await f.pg.query("UPDATE central_archive.meeting_workspaces SET state='review' WHERE id=$1",[second.id]);
result=await api({action:'glossary-list'},'member',second.id);assert.deepEqual(result.value.entries[0].id,saved.id);
result=await api({action:'glossary-save',entry:{...saved,note:'修改背景',version:1}},'member',second.id);assert.equal(result.status,200);
saved=result.value.entries[0];assert.equal(saved.version,2);
result=await api({action:'glossary-save',entry:{...saved,enabled:false}},'member',second.id);assert.equal(result.status,200);assert.equal(result.value.entries[0].enabled,false);
result=await api({action:'glossary-save',entry:{...result.value.entries[0],enabled:true}},'member',second.id);saved=result.value.entries[0];assert.equal(result.status,200);
f.row.enabled=false;assert.equal((await api({action:'glossary-save',entry:saved})).status,403);f.row.enabled=true;
assert(!glossaryPrompt([{...saved,enabled:false}]).includes(entry.term));
assert.throws(()=>checkTerm({...entry,term:''}));
// Both audio recognition and text summary receive the same vocabulary snapshot.
let reads=0,submitted,summary,fallbackPrompt='';
const platform={assemblyKey:'fixture',geminiKey:'fixture',meetingGlossary:{snapshot:async()=>{reads++;return [saved];}},llm:{completeJson:async input=>{summary=input;return {title:'合成星河館會議',minutes:[{heading:'討論',points:['檢查合成星河館']}],todos:[]};}}};
meeting.init(platform);
globalThis.fetch=async(url,options)=>{
 if(String(url).endsWith('/v2/upload'))return Response.json({upload_url:'https://fixture/audio'});
 if(String(url).endsWith('/v2/transcript')){submitted=JSON.parse(options.body);return Response.json({id:'synthetic'});}
 if(String(url).includes('/v2/transcript/'))return Response.json({status:'completed',utterances:[{speaker:'A',start:0,end:1000,text:'檢查合成新河管'}]});
 if(String(url).includes('/upload/v1beta/files'))return Response.json({file:{state:'ACTIVE',uri:'https://fixture/file'}});
 if(String(url).includes(':generateContent')){fallbackPrompt=JSON.parse(options.body).contents[0].parts[1].text;return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({title:'合成星河館會議',minutes:[{heading:'討論',points:['檢查合成星河館']}]})}]}}]});}
 throw Error('Unexpected test URL');
};
const input={tenant:{key:'synthetic'},buffer:Buffer.from('synthetic'),filename:'synthetic.m4a',contentType:'audio/mp4',settings:{topic:'詞庫校正',date:'2026-10-19',type:'一般',prompt:'忠實整理',speakers:[{name:'測試者'}]}};
let generated=await meeting.generateWorkspace(input);assert.equal(reads,1);assert(submitted.keyterms_prompt.includes(entry.term));assert(summary.userContent.includes(entry.aliases[0]));assert(summary.userContent.includes('修改背景'));assert(generated.diarized.includes(entry.aliases[0]),'Keep original transcript evidence');
platform.assemblyKey='';reads=0;generated=await meeting.generateWorkspace(input);assert.equal(reads,1);assert(fallbackPrompt.includes(entry.term)&&fallbackPrompt.includes(entry.aliases[0]));assert(generated.warning);
platform.meetingGlossary.snapshot=async()=>{throw Error('dictionary unavailable');};await assert.rejects(()=>meeting.generateWorkspace(input),/dictionary unavailable/);
globalThis.fetch=originalFetch;await f.pg.close();
console.log('Meeting glossary: auth, service isolation, cross-meeting reuse, conflicts, audit, primary recognition/summary, audio fallback and visible dictionary failures passed.');

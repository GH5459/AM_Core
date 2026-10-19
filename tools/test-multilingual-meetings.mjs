import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
const r=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0],id=r.id,host=r.host_id,member='U'+'2'.repeat(32),outsider='U'+'3'.repeat(32);
const languages=new Map([[host,'zh-Hant'],[member,'en'],[outsider,'id']]);let revoked=false,revision=1;
f.platform.meetingExperienceRequired=true;
f.platform.meetingShareIdentity=async userId=>revoked&&userId===outsider?null:{userId,account:userId===host?'111':userId===member?'222':'333',tenantKey:'fixture',name:'合成測試同仁',experience:{locale:languages.get(userId),revision}};
f.platform.llm={completeJson:async v=>({translations:JSON.parse(v.userContent).texts.map(t=>'translated:'+t)})};
async function api(input,token='host',origin=f.platform.publicBaseUrl){let status=200,body='';const req=Readable.from([JSON.stringify(input)]);req.method='POST';req.headers={...(token?{authorization:'Bearer '+token}:{}),origin};await f.service.handle(req,{setHeader(){},get headersSent(){return false;},writeHead(s){status=s;},set statusCode(s){status=s;},end(v){body=v;}},new URL(f.platform.publicBaseUrl+'/meetings/review/work/'+id+'/api'));return {status,value:JSON.parse(body)};}
try{
 const before=await f.service.store.get(id);
 assert.equal((await api({action:'locale'},'member')).value.experience.locale,'en');
 assert.equal((await api({action:'read'},'member')).value.canEdit,false);
 assert.equal((await api({action:'read'},'host')).value.canEdit,true);
 for(const action of ['edit','save-part','sharing','publish','revise','start','save-type','glossary-save'])assert.equal((await api({action,field:'record',value:'forbidden',version:1},'member')).status,403,action);
 const reply={action:'reply-add',operationId:'synthetic-reply-operation-0001',text:'Please do not change room 301. Saya belum selesai.'};
 let result=await api(reply,'member');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.value.replies.at(-1).text,reply.text);
 result=await api(reply,'member');assert.equal(result.value.replies.length,1);assert.equal((await api({...reply,text:'different'},'member')).status,409);
 assert.equal((await api({...reply,operationId:'synthetic-reply-operation-0002',record:'smuggled'},'member')).status,400);
 assert.equal((await api(reply,'outside')).status,403);
 await f.pg.query('UPDATE central_archive.meeting_workspaces SET shared_people=$2::jsonb WHERE id=$1',[id,JSON.stringify([{account:'333',tenantKey:'fixture',name:'指定測試同仁'}])]);
 result=await api({action:'read'},'outside');assert.equal(result.status,200);assert.equal(result.value.access,'recipient');assert.equal(result.value.experience.locale,'id');
 assert.equal((await api({...reply,operationId:'synthetic-reply-operation-0003',text:'Balasan dari penerima'},'outside')).status,200);
 revoked=true;assert.equal((await api({action:'reply-list'},'outside')).status,403);revoked=false;
 const translation=await api({action:'translate',texts:['Belum selesai kamar 302.']},'member');assert.equal(translation.status,200);assert.equal(translation.value.translations[0],'translated:Belum selesai kamar 302.');
 let providerCalls=0;const provider=f.platform.llm.completeJson;f.platform.llm.completeJson=async()=>{providerCalls++;throw Error('synthetic unavailable');};const chinese=await api({action:'translate',texts:['Calendar sample']},'host');assert.deepEqual(chinese.value.translations,['Calendar sample']);assert.equal(providerCalls,0);for(let i=0;i<3;i++){const failed=await api({action:'translate',texts:['Unique failure sample']},'member');assert.deepEqual(failed.value.translations,['Unique failure sample']);assert.equal(failed.value.unavailable,true);}assert.equal(providerCalls,1);f.platform.llm.completeJson=provider;
 const cached=await api({action:'translate',texts:['Belum selesai kamar 302.']},'member');assert.deepEqual(cached.value.translations,translation.value.translations);
 assert.equal((await api({action:'translate',texts:['safe']},'member','https://foreign.test')).status,403);
 languages.set(host,'id');revision++;assert.equal((await api({action:'sharing',enabled:true,revision:before.revision},'host')).status,403);languages.set(host,'zh-Hant');
 await f.pg.query('UPDATE central_archive.meeting_workspaces SET sharing_enabled=true WHERE id=$1',[id]);
 const publicRead=await api({action:'read'},'');assert.equal(publicRead.status,200);assert.equal(publicRead.value.access,'public');assert.equal(publicRead.value.replies,undefined);assert.equal((await api(reply,'')).status,401);
 const after=await f.service.store.get(id);assert.deepEqual(after.fields,before.fields);assert.equal(after.revision,before.revision);assert.equal(f.taskIds.size,1);
 console.log('Multilingual meetings passed: independent internal original replies, idempotent replay/conflict, foreign content guards, Chinese editing capability, named sharing and revocation, public reply isolation, origin checks, source translation cache, live locale change, original record and task preserved.');
}finally{await f.pg.close();}

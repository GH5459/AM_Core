import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const {pg,service,platform,key,host,guest}=f;
const outside='U'+'3'.repeat(32),originalIdentity=platform.meetingShareIdentity;let active=true,pushes=0;
platform.pushLineMessage=async()=>{pushes++;throw Error('Sharing must never push');};
platform.meetingShareIdentity=async(id,tenant)=>{if(id===guest&&!active)return null;if(id===outside)return {userId:id,tenantKey:'other-service',account:'222',name:'同名夥伴'};return originalIdentity(id,tenant);};
async function api(path,input,token='host'){
 let status=200,body;const req=Readable.from([Buffer.from(JSON.stringify(input))]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:platform.publicBaseUrl};
 const res={headersSent:false,setHeader(){},writeHead(s){status=s;},set statusCode(s){status=s;},get statusCode(){return status;},end(s){body=JSON.parse(s);}};
 assert(await service.handle(req,res,new URL(platform.publicBaseUrl+path)));return {status,...body};
}
const list=(token='guest',offset=0)=>api('/meetings/review/hub/api',{action:'list',scope:'shared',offset},token);
const created=[];for(let i=0;i<66;i++){
 const r=await service.store.create(key,{source:{type:'group',groupId:'C'+'c'.repeat(32),userId:host},message:{id:'inbox-fixture-'+i},timestamp:Date.now()},'fixture.m4a','合成主持人');
 await pg.query("UPDATE central_archive.meeting_workspaces SET state=$2,fields=jsonb_set(fields,'{settings,topic}',to_jsonb($3::text)) WHERE id=$1",[r.id,i===65?'review':'published','合成會議 '+i]);created.push(r.id);
 if(i<41||i===65){const row=await service.store.get(r.id);const saved=await api('/meetings/review/work/'+r.id+'/api',{action:'sharing',accounts:['222'],enabled:false,version:Number(row.sharing_version),revision:Number(row.revision)});assert.equal(saved.status,200,JSON.stringify(saved));}
}
const foreignKey='f'.repeat(64);await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[foreignKey,'U'+'e'.repeat(32),'group','C'+'e'.repeat(32)]);
const foreign=await service.store.create(foreignKey,{source:{type:'group',userId:host,groupId:'C'+'e'.repeat(32)},message:{id:'foreign-inbox'},timestamp:Date.now()},'fixture.m4a','其他OA');await pg.query("UPDATE central_archive.meeting_workspaces SET state='published',shared_people=$2::jsonb WHERE id=$1",[foreign.id,JSON.stringify([{tenantKey:'fixture',account:'222',name:'同名夥伴'}])]);
const hostList=await list('host');assert.equal(hostList.status,200,JSON.stringify(hostList));assert.equal(hostList.items.length,0,'Own meetings are not fabricated as shares');
let page=await list();assert.equal(page.status,200);assert.equal(page.items.length,40,'Unrelated meetings do not consume shared pagination');assert.equal(page.next,40);
assert.equal((await api('/meetings/review/hub/api',{action:'list'},'guest')).items.length,0,'Reader-only shares live in their dedicated section rather than duplicate other meeting lists');
const next=await list('guest',page.next);assert.equal(next.items.length,1);assert.equal(next.next,null);const all=[...page.items,...next.items];assert.equal(new Set(all.map(x=>x.id)).size,41);assert(!all.some(x=>x.id===created[65]),'Shared drafts never appear');
assert(all.every(x=>x.kind==='分享給我的會議'&&x.host==='合成主持人'&&x.state==='published'));for(const x of all)for(const k of ['fields','shared_people','participants','preparation','receipt','conversation_key','tenant_key'])assert.equal(x[k],undefined,'Shared cards contain only authorized reader metadata');
assert.equal((await list('outsider')).items.length,0,'Same account/name from another service is not the recipient');active=false;assert.equal((await list()).status,403,'Inactive colleague cannot enumerate shares');active=true;
const id=created[0],path='/meetings/review/work/'+id+'/api';let read=await api(path,{action:'read'},'guest');assert.equal(read.access,'recipient');assert.equal((await api(path,{action:'save-part',field:'record',value:'forbidden'},'guest')).status,403);assert.equal((await api('/meetings/review/work/'+id+'/hub',{action:'plan-read'},'guest')).status,403,'Result share cannot read private preparation');
const r=await service.store.get(id);assert.equal((await api(path,{action:'sharing',accounts:[],enabled:false,version:Number(r.sharing_version),revision:Number(r.revision)})).status,200);assert(!(await list()).items.some(x=>x.id===id));assert.equal((await api(path,{action:'read'},'guest')).status,403,'Revocation removes listing and reader permission');
await service.drain();assert.equal(pushes,0);assert.equal(Number((await pg.query('SELECT count(*) AS n FROM central_archive.meeting_share_notices')).rows[0].n),0);await pg.close();console.log('Shared inbox: original Rich Menu hub, authenticated active exact-service recipients, published-only cards, filtered 40+1 pagination, minimal metadata, original read-only ACL, revoke and zero LINE push passed.');

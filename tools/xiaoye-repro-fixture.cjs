// Complete Worker/D1 integration fixture: schema only from a reviewed snapshot,
// all accounts, sessions, tasks, event payloads and LINE identities are fake.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('./fixtures/xiaoye-repro/node_modules/miniflare');
const schema=require('./fixtures/xiaoye-d1-schema.json');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function fixture({shared=false,extraBindings={},outboundService=null}={}){
 if(shared)throw Error('Shared-access mode is outside this fixture');
 const folder=path.resolve(process.env.DAILYLOG_ROUTINE_PACKAGE||process.env.DAILYLOG_XIAOYE_PACKAGE||''),script=fs.readFileSync(path.join(folder,'dry-run/worker.js'),'utf8');
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'xiaoye-isolated',...(outboundService?{outboundService}:{}),modules:true,script,compatibilityDate:'2026-10-06',d1Databases:{DB:'xiaoye-isolated'},durableObjects:{XIAOYE_EVENTS:{className:'XiaoyeEvents',useSQLite:true}},bindings:{SHARED_ACCESS_REQUIRED:'false',CENTRAL_DIRECTORY_REQUIRED:'false',OWNER_ACCOUNT:'140901',PUBLIC_ORIGIN:'http://example.test',HR_NOTION_READ_ENABLED:'false',HR_NOTION_SYNC_ENABLED:'false',...extraBindings},serviceBindings:{ASSETS:async()=>new Response('not found',{status:404})}}]}));
 const db=await mf.getD1Database('DB','xiaoye-isolated');
 try{
  for(const object of schema.objects)await db.prepare(object.sql).run();
  await db.prepare('INSERT OR IGNORE INTO directory_state(id) VALUES(1)').run();
  const staff=['140901','900001','900002','900003'].map(account=>({id:'fixture-'+account,account,name:'隔離測試同仁 '+account,team:'隔離部門'}));
  const access={revision:1,sharedAccessRevision:1,routineLibraries:[],accounts:Object.fromEntries(staff.map(p=>[p.account,{standardEnabled:p.account==='900003'||p.account==='140901',enabled:p.account==='900003'||p.account==='140901',hrEnabled:false,routineLibraryIds:[],routineGrantFlags:{},admin:p.account==='140901'}]))};
  await db.prepare("INSERT INTO documents(namespace,key,value) VALUES('settings','access',?)").bind(JSON.stringify(access)).run();
  for(const p of staff){await db.prepare('INSERT INTO employees(account,user_id,value) VALUES(?,?,?)').bind(p.account,p.id,JSON.stringify(p)).run();await db.prepare('INSERT INTO sessions(token_hash,csrf,user_json,expires_at) VALUES(?,?,?,?)').bind(sha(sha('fixture-session-'+p.account)),'fixture-csrf',JSON.stringify(p),Date.now()+3600000).run();}
  const send=async(account,route,body,origin='http://example.test')=>{const headers={Cookie:'dailylog_session='+sha('fixture-session-'+account),Origin:origin,'X-DailyLog-CSRF':'fixture-csrf'};let data;if(body instanceof FormData){const r=new Request('http://example.test',{method:'POST',body});headers['Content-Type']=r.headers.get('content-type');data=await r.arrayBuffer();}else if(body){headers['Content-Type']='application/json';data=JSON.stringify(body);}return mf.dispatchFetch('http://example.test'+route,{headers,redirect:'manual',...body?{method:'POST',body:data}:{}});};
  return {folder,staff,mf,db,send,access,close:async()=>mf.dispose()};
 }catch(e){await mf.dispose();throw e;}
}
module.exports={fixture};

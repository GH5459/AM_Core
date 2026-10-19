const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const {normalizeEvent}=require('../calendar-bot-core.cjs');
const input={requestId:'recurring-fixture',topic:'範例線上聊天',date:'2026-10-13',time:'20:00',endTime:'21:00',location:'線上',content:'隔離測試',recurrence:{frequency:'WEEKLY',weekdays:['TU']}};
test('Calendar source creates native RRULE and rejects incompatible/unsafe recurrence',()=>{
 assert.deepEqual(normalizeEvent(input).event.recurrence,['RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU']);
 assert.deepEqual(normalizeEvent({...input,recurrence:{frequency:'MONTHLY',count:4}}).event.recurrence,['RRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=4']);
 for(const recurrence of [{frequency:'WEEKLY',weekdays:['MO']},{frequency:'DAILY',count:0},{frequency:'DAILY',until:'2026-02-30'},{frequency:'WEEKLY',weekdays:['TU'],rrule:'DROP'}])assert.throws(()=>normalizeEvent({...input,recurrence}),e=>e.code==='INVALID_REQUEST');
});
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('cloudflare/schema.sql','utf8'));const statement=(sql,args)=>({async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},async all(){return {results:sqlite.prepare(sql).all(...args)};}});return {prepare(sql){return {...statement(sql,[]),bind(...args){return statement(sql,args)}};},close:()=>sqlite.close()};}
test('complete production Worker sends weekly/daily/monthly Google series, retries once and preserves account isolation',async()=>{
 const folder=path.resolve(process.env.LUNAR_CALENDAR_PACKAGE||'.dailylog-data/lunar-calendar-20261019/release/candidate'),events=new Map();let posts=0;const calls=[];
 const fetchApi=async(url,options={})=>{assert.equal(new URL(url).hostname,'www.googleapis.com','No real network allowed');calls.push({url,token:options.headers.Authorization});const id=new URL(url).pathname.split('/').at(-1);if(options.method==='POST'){posts++;const event=JSON.parse(options.body);if(events.has(event.id))return Response.json({error:{}},{status:409});events.set(event.id,{...event,htmlLink:'https://calendar.google.com/calendar/event?eid=fixture'});return Response.json(events.get(event.id));}return events.has(id)?Response.json(events.get(id)):Response.json({error:{}},{status:404});};
 const context=vm.createContext({console,URL,URLSearchParams,Request,Response,Headers,TextEncoder,TextDecoder,crypto:globalThis.crypto,fetch:fetchApi,AbortController,AbortSignal,atob,btoa,Uint8Array,setTimeout,clearTimeout,FormData,Blob,File});
 const modules=new Map();const create=file=>{file=path.resolve(file);if(!modules.has(file))modules.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file}));return modules.get(file);};
 const mod=create(folder+'/worker.mjs');await mod.link((specifier,ref)=>{if(specifier==='cloudflare:workers')return new vm.SyntheticModule(['WorkerEntrypoint'],function(){this.setExport('WorkerEntrypoint',class {});},{context});if(specifier==='node:async_hooks')return new vm.SyntheticModule(['AsyncLocalStorage'],function(){this.setExport('AsyncLocalStorage',require('node:async_hooks').AsyncLocalStorage);},{context});assert(specifier.startsWith('.'),'Unexpected runtime import '+specifier);return create(path.resolve(path.dirname(ref.identifier),specifier));});await mod.evaluate();
 const worker=mod.namespace.default,db=database(),serviceToken='dlservice.'+'a'.repeat(64),env={DB:db,PUBLIC_ORIGIN:'https://fixture.example',CALENDAR_BOT_SERVICE_TOKEN:serviceToken,TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),GOOGLE_CLIENT_SECRET:'fixture',CENTRAL_DIRECTORY_REQUIRED:'false',SHARED_ACCESS_REQUIRED:'false'};
 const {writeDocument,tokenStore}=await import('../cloudflare/storage.mjs');await writeDocument(db,'settings','access',{revision:1,accounts:{alice:{enabled:true,standardEnabled:true,admin:false},bob:{enabled:true,standardEnabled:true,admin:false},disabled:{enabled:false,admin:false}}});await writeDocument(db,'settings','google',{clientId:'fixture.apps.googleusercontent.com'});
 for(const account of ['alice','bob','disabled']){await db.prepare('INSERT INTO employees(account,user_id,value) VALUES(?,?,?)').bind(account,'uof:'+account,JSON.stringify({account})).run();if(account!=='disabled')await tokenStore(env).write('personal:uof:'+account,{clientId:'fixture.apps.googleusercontent.com',account:account+'@example.com',refreshToken:'fixture-refresh',accessToken:'fixture-access-'+account,expiresAt:Date.now()+3600000,generation:'fixture'});}
 const call=(account,change={},token=serviceToken)=>worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/integrations/leaf-snail/calendar/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...input,account,...change})}),env,{waitUntil(){}});
 try{
  const a=await call('alice');assert.equal(a.status,201,await a.clone().text());const first=await a.json();assert.deepEqual(first.event.recurrence,['RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU']);assert.equal(first.event.end.dateTime,'2026-10-13T21:00:00+08:00');
  assert.equal((await call('alice')).status,200);assert.equal(posts,1);assert.equal((await call('alice',{recurrence:{frequency:'DAILY'}})).status,409);assert.equal(posts,1);
  assert.equal((await call('bob')).status,201);assert.equal(posts,2);assert(calls.filter(c=>c.url.includes('bob%40example.com')).every(c=>c.token==='Bearer fixture-access-bob'));
  assert.equal((await call('alice',{requestId:'daily',recurrence:{frequency:'DAILY',interval:2,count:5}})).status,201);assert.equal((await call('alice',{requestId:'monthly',recurrence:{frequency:'MONTHLY',until:'2026-12-31'}})).status,201);
  assert.equal((await call('alice',{requestId:'invalid',recurrence:{frequency:'WEEKLY',weekdays:['MO']}})).status,400);assert.equal((await call('disabled')).status,403);assert.equal((await call('missing')).status,404);assert.equal((await call('alice',{},'dlservice.'+'b'.repeat(64))).status,401);
  const invalid=await call('alice',{recurrence:{frequency:'HOURLY'}});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/支援每日/);
  const changed=await call('alice',{requestId:'once',recurrence:undefined});assert.equal(changed.status,201);const once=await changed.json();assert.equal(once.event.recurrence,undefined);
  assert.equal((await worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/tasks'),env,{waitUntil(){}})).status,401);
  assert.equal(posts,5,'Only four series plus one single event in isolated Google stub');
  const lunarRule={frequency:'YEARLY',calendar:'chinese',month:10,day:17,leapMonth:false,throughYear:2100};
  const payload={requestId:'lunar-test',date:'2026-11-25',allDay:true,time:undefined,endTime:undefined,recurrence:lunarRule};
  const lunarResponse=await call('alice',payload);assert.equal(lunarResponse.status,201,await lunarResponse.clone().text());const lunarEvent=(await lunarResponse.json()).event;
  assert.equal(lunarEvent.allDay,true);assert.equal(lunarEvent.start.date,'2026-11-25');assert.equal(lunarEvent.end.date,'2026-11-26');assert.match(lunarEvent.recurrence[0],/^RDATE;VALUE=DATE:20261125,20271114,/);assert.equal(lunarEvent.recurrence[0].split(':')[1].split(',').length,75);
  assert.equal((await call('alice',payload)).status,200);assert.equal(posts,6);assert.equal((await call('alice',{...payload,recurrence:{...lunarRule,day:18}})).status,400);assert.equal(posts,6);
  assert.equal((await call('alice',{requestId:'all-day-once',date:'2026-11-25',allDay:true,time:undefined,endTime:undefined,recurrence:undefined})).status,201);
  const annual=await call('alice',{requestId:'annual',allDay:true,time:undefined,endTime:undefined,recurrence:{frequency:'YEARLY',count:4}});assert.equal(annual.status,201);assert.deepEqual((await annual.json()).event.recurrence,['RRULE:FREQ=YEARLY;INTERVAL=1;COUNT=4']);
  assert.equal((await call('alice',{...payload,requestId:'mixed',time:'10:00'})).status,400);
  assert.equal((await call('alice',{...payload,requestId:'all-day-range',endDate:'2026-11-27'})).status,400);
  assert.equal(posts,8);
  console.log('Complete Worker lunar/all-day routes, 75 annual dates, replay and account boundaries passed');
 }finally{db.close();}
});

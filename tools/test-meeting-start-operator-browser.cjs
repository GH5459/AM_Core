const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.argv[2]||'playwright');
(async()=>{
 const {workspaceHtml}=require('../modules/meetings/workspace-ui.js');
 let source=require('../versions/AM-IMP-2026.1028.04/build.cjs').clientSource();
 source=require('../versions/AM-IMP-2026.1028.06/build.cjs').patchClient(source);
 source=require('../versions/AM-IMP-2026.1028.07/build.cjs').patchClient(source);
 const oldSource=source;
 source=require('../versions/AM-IMP-2026.1106.01/build.cjs').patchClient(source);
 assert(source.includes('取消新增'));assert(source.includes('pendingCalendar'));assert(oldSource.includes('pendingCalendar'));
 const initializer=source.slice(0,source.indexOf('\n(()=>{'));
 const id='e'.repeat(64),origin='https://fixture.example.test',actions=[],errors=[];
 const state={ok:true,access:'member',actor:{id:'fixture-operator',name:'整理協助者'},host:false,canStart:true,canEdit:false,types:[{name:'工作會議',prompt:'保留來源'}],workspace:{id,state:'setup',revision:1,fields:{settings:{topic:'原記錄主題',type:'工作會議',prompt:'保留來源',date:'2026-11-06',speakers:[],cycle:{frequency:'daily'}},record:'',transcript:''},versions:{settings:0}},presence:[],sharing:{enabled:false,version:0},members:{people:[]}};
 let startRoute;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());
   if(u.origin!==origin)return route.fulfill({body:'',contentType:'application/javascript'});
   if(u.pathname.endsWith('/api')){const v=route.request().postDataJSON();actions.push(v);if(v.action==='edit'){state.workspace.fields.settings=v.value;state.workspace.versions.settings++;state.workspace.revision++;}if(v.action==='start'){startRoute=route;return;}return route.fulfill({json:state});}
   if(u.pathname.endsWith('/hub'))return route.fulfill({json:{ok:true,host:false,actorId:'fixture-operator',input:{source:'audio',text:'',version:0},audio:true,plan:{topic:'原排程',preparation:'',preparation_version:1,participants:[]},calendar:[]}});
   const html=workspaceHtml({id,liffId:'123-fixture'}).replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
   return route.fulfill({contentType:'text/html',body:html+`<script>window.loginContinuationSession=async()=>true;${initializer}initializeDailylogMeeting(window,document,location,fetch,setInterval,setTimeout,clearInterval,clearTimeout,{id:'${id}'},'work');</script>`});
  });
  await page.goto(origin+'/meetings/review/work/'+id);await page.waitForFunction(()=>document.querySelector('#start').textContent==='進行會議記錄整理');
  assert(await page.locator('#start').isVisible());assert(!await page.locator('#publish').isVisible());assert(!await page.locator('#recordFile').isVisible());
  await page.fill('#topic','修改後的會議主題');await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('#startStatus').textContent.includes('正在送出整理'));
  assert(await page.locator('#start').isDisabled());assert.equal(actions.filter(x=>x.action==='edit').length,1);assert.equal(actions.filter(x=>x.action==='start').length,1);assert.equal(state.workspace.fields.settings.topic,'修改後的會議主題');
  await startRoute.fulfill({status:409,json:{error:'內容已更新，請重新確認'}});await page.waitForFunction(()=>document.querySelector('#startStatus').textContent.includes('內容已更新'));
  assert(await page.locator('#start').isEnabled());
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  if(process.argv[3]){fs.mkdirSync(process.argv[3],{recursive:true});await page.screenshot({path:process.argv[3]+'/operator-synthetic.png',fullPage:true});}
  await page.click('#start');await page.waitForFunction(()=>document.querySelector('#start').disabled);state.workspace.state='processing';state.workspace.revision++;await startRoute.fulfill({json:state});await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('製作中'));
  assert.equal(actions.filter(x=>x.action==='start').length,2);assert.deepEqual(errors,[]);
  console.log('Native browser: operator start/title save, immediate progress, definite rejection/retry, processing, Calendar integration and four widths passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

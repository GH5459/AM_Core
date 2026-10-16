const fs=require('fs'),assert=require('assert/strict'),path=require('path'),crypto=require('crypto'),{chromium}=require('playwright');
process.env.DAILYLOG_ROUTINE_PACKAGE='.dailylog-data/line-task-edit-release-20261016';
const folder=path.resolve(process.env.DAILYLOG_ROUTINE_PACKAGE),{createPreview}=require('./preview-routine-tabs.cjs');
(async()=>{const app=await createPreview(),browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({extraHTTPHeaders:{Cookie:'dailylog_session='+crypto.createHash('sha256').update('fixture-session-900003').digest('hex')}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
 const result=await app.send('900003','/api/tasks',{id:'work-'+crypto.randomUUID(),title:'隔離照片交辦',description:'原交辦說明',sourceDate:'2026-10-16',leadAccount:'900001',collaboratorAccounts:[],level:1,workSchema:2,workSource:'assigned'});assert.equal(result.status,201,await result.clone().text());const task=(await result.json()).task;
 await page.goto(app.origin+'/?task='+task.id,{waitUntil:'networkidle'});await page.locator('#taskEditForm').waitFor();assert.equal(await page.locator('#taskEditForm textarea[name=description]').inputValue(),'原交辦說明');
 const widths=[];for(const width of [320,360,390,430,760,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);widths.push(width);}
 await page.setViewportSize({width:390,height:844});
 const attachmentDetails=page.locator('#taskCardDialog details').filter({has:page.locator('.task-attachments')});if(await attachmentDetails.count())await attachmentDetails.locator('summary').first().click();
 let fail=true;await page.route('**/api/attachments/normal/'+task.id,async route=>{if(route.request().method()==='POST'&&fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'隔離暫時失敗'})});}else await route.continue();});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 await page.locator('#taskCardDialog input[type=file]').setInputFiles([{name:'照片一.png',mimeType:'image/png',buffer:png},{name:'照片二.png',mimeType:'image/png',buffer:png}]);
 await page.locator('[data-upload]').waitFor();assert.match(await page.locator('.attachment-error').innerText(),/已保留/);await page.locator('[data-upload]').click();await page.waitForFunction(()=>document.querySelectorAll('#taskCardDialog .attachment-list a[download]').length===2&&!document.querySelector('[data-upload]'));
 await page.locator('[data-overview-description]').click();await page.locator('#taskEditForm textarea[name=description]').fill('原交辦說明；補上兩張照片與操作問題。');await page.locator('[data-card-save-top]').click();
 await page.waitForFunction(async id=>{const r=await fetch('/api/tasks/'+id);return (await r.json()).task.description.includes('補上兩張照片');},task.id);
 const saved=(await(await app.send('900003','/api/tasks/'+task.id)).json()).task;assert.equal(saved.id,task.id);assert.notEqual(saved.status,'done');assert.equal((await(await app.send('900001','/api/attachments/normal/'+task.id)).json()).attachments.length,2);
 await page.goto(app.origin+'/?task='+task.id,{waitUntil:'networkidle'});await page.locator('#taskEditForm').waitFor();assert.match(await page.locator('#taskEditForm textarea[name=description]').inputValue(),/補上兩張照片/);await page.waitForFunction(()=>document.querySelectorAll('#taskCardDialog .attachment-list a[download]').length===2);
 fs.mkdirSync(folder+'/screenshots',{recursive:true});const reloadedDetails=page.locator('#taskCardDialog details').filter({has:page.locator('.task-attachments')});if(await reloadedDetails.count())await reloadedDetails.locator('summary').first().click();await page.locator('.task-attachments').scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/screenshots/task-edit-390.png',fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/test-results.private.json',JSON.stringify({passed:true,widths,sameTask:true,multiUpload:true,failedUploadRetry:true,recipientReadsAttachments:true,reloadPreserved:true,workNotCompleted:true,errors},null,2));console.log(JSON.stringify({passed:true,widths,multiUpload:true,retryPreserved:true,sameTask:true}));
 }finally{await context.close();await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

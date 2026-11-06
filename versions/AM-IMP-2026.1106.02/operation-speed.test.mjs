import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const original=new URL('../AM-IMP-2026.1029.50/first-screen.mjs',import.meta.url).href;
const source=(await fs.readFile(new URL('./operation-speed.mjs',import.meta.url),'utf8')).replace("'./first-screen.mjs'",JSON.stringify(original));
const {operationSpeedResponse}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={DAILYLOG_RUNTIME_VERSION:{id:'current'}};
const response=(headers={},status=200)=>new Response('original transformed bytes',{status,headers:{'Content-Type':'text/javascript','Cache-Control':'private, no-store',...headers}});
test('the final fixed-program policy preserves bytes and version-scoped private cache',async()=>{
 const r=await operationSpeedResponse(new Request('https://example.test/tasks.js?assetVersion=current'),response(),env,performance.now());
 assert.equal(await r.text(),'original transformed bytes');assert.equal(r.headers.get('Cache-Control'),'private, max-age=31536000, immutable');
});
for(const [name,path,headers,status,method] of [
 ['unversioned','/tasks.js',{},200,'GET'],['stale','/tasks.js?assetVersion=old',{},200,'GET'],['extra query','/tasks.js?assetVersion=current&x=1',{},200,'GET'],
 ['cookie','/tasks.js?assetVersion=current',{'Set-Cookie':'session=example'},200,'GET'],['wrong MIME','/tasks.js?assetVersion=current',{'Content-Type':'text/html'},200,'GET'],
 ['denied','/tasks.js?assetVersion=current',{},401,'GET'],['write','/tasks.js?assetVersion=current',{},200,'POST'],['bootstrap','/auth/bootstrap.js?assetVersion=current',{},200,'GET'],
 ['configuration','/google-config.js?assetVersion=current',{},200,'GET'],['HTML','/?assetVersion=current',{'Content-Type':'text/html'},200,'GET'],['data','/api/tasks?assetVersion=current',{'Content-Type':'application/json'},200,'GET']
])test(name+' response stays noncacheable',async()=>{
 const r=await operationSpeedResponse(new Request('https://example.test'+path,{method}),response(headers,status),env,performance.now());
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(r.status,status);assert.equal(await r.text(),'original transformed bytes');
});
test('API measurements append to existing timing without content or identity',async()=>{
 const r=await operationSpeedResponse(new Request('https://example.test/api/tasks/example'),response({'Server-Timing':'original;dur=1'}),env,performance.now()-5);
 assert.match(r.headers.get('Server-Timing'),/^original;dur=1, operation_total;dur=\d+\.\d$/);assert.equal(r.headers.get('X-DailyLog-Operation-Policy'),'bounded-reads-confirmed-writes-v1');
});

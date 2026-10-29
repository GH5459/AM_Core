const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./xiaoye-repro-fixture.cjs');
test('self-contained D1 fixture creates only synthetic identities and exercises the isolated Worker binding',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoye-fixture-ci-'));let a;const previous=process.env.DAILYLOG_ROUTINE_PACKAGE;
 try{
  fs.mkdirSync(path.join(dir,'dry-run'));fs.writeFileSync(path.join(dir,'dry-run','worker.js'),`import {DurableObject} from 'cloudflare:workers';export class XiaoyeEvents extends DurableObject {async fetch(){return new Response('ok')}} export default {async fetch(_r,env){const employees=await env.DB.prepare('SELECT COUNT(*) n FROM employees').first(),sessions=await env.DB.prepare('SELECT COUNT(*) n FROM sessions').first();return Response.json({employees:employees.n,sessions:sessions.n});}}`);
  process.env.DAILYLOG_ROUTINE_PACKAGE=dir;a=await fixture();const result=await a.mf.dispatchFetch('http://example.test/fixture');assert.equal(result.status,200);assert.deepEqual(await result.json(),{employees:4,sessions:4});
  const people=await a.db.prepare('SELECT account,value FROM employees ORDER BY account').all();assert.equal(people.results.length,4);for(const p of people.results)assert.match(JSON.parse(p.value).id,/^fixture-/);
  assert.equal((await a.db.prepare('SELECT COUNT(*) n FROM work_items').first()).n,0);assert.equal((await a.db.prepare('SELECT COUNT(*) n FROM task_attachments').first()).n,0);
 }finally{await a?.close();if(previous===undefined)delete process.env.DAILYLOG_ROUTINE_PACKAGE;else process.env.DAILYLOG_ROUTINE_PACKAGE=previous;fs.rmSync(dir,{recursive:true,force:true});}
});

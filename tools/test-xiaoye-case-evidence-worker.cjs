const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
process.env.DAILYLOG_XIAOYE_FIXTURE=path.join(__dirname,'xiaoye-evidence-fixture.cjs');
const {setup,owner}=require('./test-xiaoye-worker.cjs');
const op=()=>crypto.randomUUID(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),meetingId='a'.repeat(64);
async function active(){const a=await setup();const t=await a.get((await a.ok(await a.intake({text:'原會議： https://am.hozorental.com/meetings/review/work/'+meetingId}))).taskId);const event=await a.db.prepare('SELECT id FROM xiaoye_event_outbox WHERE task_id=?').bind(t.id).first();await wait(5200);const job=(await a.ok(await a.machine('runner/event-acquire',{id:event.id,operationId:op()},true))).job;return {...a,t,job,context:{id:t.id,version:t.version,eventId:job.id,eventLease:job.lease}};}
test('full Worker-D1 obtains scoped meeting evidence and records a plain same-case finding without tasks, approvals or duplicates',async()=>{const a=await active();try{
 const count=await a.db.prepare('SELECT count(*) n FROM work_items').first();
 const data=await a.ok(await a.machine('runner/inspect',{...a.context,operationId:op()},true));assert.equal(data.evidence.available,true);assert.equal(data.evidence.items.length,1);assert(data.evidence.diagnosis);assert.equal(data.evidence.diagnosis.writes,0);assert.equal(a.evidenceState.checks,2);assert(!JSON.stringify(data.evidence).includes('fixture-identity'));assert(!JSON.stringify(data.evidence).includes(a.job.lease));
 const finding={certainty:'confirmed',cause:'已核對這場會議的待辦日期與派發結果。',impact:'目前尚未建立對應任務。',nextStep:'由葉小蝸整理修正方案，交由負責人核准。',progress:'本次只查核，尚未補派任務。'};
 const input={...a.context,operationId:op(),evidenceDigest:data.evidence.digest,finding};const result=await a.ok(await a.machine('runner/record-finding',input,true));assert.equal(result.task.secretary.findings.length,1);assert.equal(result.task.secretary.approval,null);assert.equal(result.task.secretary.stage,'clarifying');assert.equal(result.task.description,a.t.description);assert.equal((await a.ok(await a.machine('runner/record-finding',input,true))).replayed,true);assert.equal((await a.get(a.t.id)).secretary.findings.length,1);assert.equal((await a.db.prepare('SELECT count(*) n FROM work_items').first()).n,count.n);
 assert.equal((await a.machine('runner/record-finding',{...input,operationId:op(),version:result.task.version,evidenceDigest:'f'.repeat(64)},true)).status,403);
 const html=await(await a.send(owner,'/xiaoye?issue='+a.t.id)).text();assert(html.includes('目前進度'));assert(html.includes('已查明的原因'));
}finally{await a.close();}});
test('a stopped event, cross-case digest or revoked original meeting reader cannot grant evidence or findings',async()=>{const a=await active();try{
 a.evidenceState.denyReader=true;const denied=await a.machine('runner/inspect',{...a.context,operationId:op()},true);assert.equal(denied.status,403);a.evidenceState.denyReader=false;
 const data=await a.ok(await a.machine('runner/inspect',{...a.context,operationId:op()},true));const input={...a.context,operationId:op(),evidenceDigest:data.evidence.digest,finding:{certainty:'confirmed',cause:'日期已查核。',impact:'一項待辦仍待處理。',nextStep:'由維護人員整理修正方案。',progress:'尚未修改。'}};
 await a.ok(await a.machine('runner/event-complete',{id:a.job.id,lease:a.job.lease,operationId:op()},true));const stopped=await a.get(a.t.id);assert.equal((await a.machine('runner/record-finding',input,true)).status,403);assert.equal((await a.get(a.t.id)).version,stopped.version);
}finally{await a.close();}});
test('explicit owner handoff only allows one current case to inspect and record; expiry and approval remain separate',async()=>{const a=await setup();try{
 const t=await a.get((await a.ok(await a.intake({text:'https://am.hozorental.com/meetings/review/work/'+meetingId}))).taskId),grant=op();
 const context={id:t.id,version:t.version,ownerInspectionGrant:grant,operationId:op()};assert.equal((await a.machine('runner/inspect',context,true)).status,403);
 await a.db.prepare("INSERT INTO documents(namespace,key,value,revision) VALUES('xiaoye-owner-inspection-grants',?,?,1)").bind(grant,JSON.stringify({scope:'inspect-and-record',id:t.id,version:t.version,sourceVersion:t.secretary.sourceVersion,ownerAccount:owner,accountId:a.config.account.id,expiresAt:Date.now()+60000})).run();
 const data=await a.ok(await a.machine('runner/inspect',context,true));assert(data.evidence.available);assert.equal((await a.machine('runner/claim',{id:t.id,ownerInspectionGrant:grant,operationId:op()},true)).status,200);assert.equal((await a.get(t.id)).secretary.approval,null);
 assert.equal((await a.machine('runner/inspect',{...context,id:'work-'+op()},true)).status,403);
 await a.db.prepare("UPDATE documents SET value=json_set(value,'$.expiresAt',0) WHERE namespace='xiaoye-owner-inspection-grants' AND key=?").bind(grant).run();assert.equal((await a.machine('runner/inspect',{...context,operationId:op()},true)).status,403);
}finally{await a.close();}});

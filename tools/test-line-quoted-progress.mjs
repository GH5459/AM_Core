import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {recordQuotedProgress} from '../core/line-quoted-progress-worker.mjs';

const bot='U'+'0'.repeat(32),user='U'+'1'.repeat(32),group='C'+'2'.repeat(32),original='12345678901234567',message='12345678901234568',id='work-12345678-1234-1234-1234-123456789012';
async function fixture(){
 const db=new PGlite();await db.exec('CREATE TABLE documents(namespace TEXT,key TEXT,value TEXT); CREATE TABLE line_assignment_intake(tenant TEXT,state TEXT,input TEXT,result TEXT); CREATE TABLE work_items(id TEXT,value TEXT)');
 // This fixture uses SQLite syntax through a small adapter; data is synthetic.
 const documents=new Map(),tasks=new Map();let source={groupId:group,messageId:original},result={taskIds:[id]},saves=0,active=true;
 const identity={botUserId:bot,lineUserId:user,account:'employee',identityId:'binding'};documents.set('line:'+bot+':'+user,identity);documents.set('account:'+bot+':employee',identity);
 const task={id,lead:{account:'employee'},collaborators:[],status:'pending',version:1,history:[]};tasks.set(id,task);
 const d1={prepare(sql){let args;return {bind(...a){args=a;return this;},async first(){if(sql.includes('documents')){const v=documents.get(args[0]);return v?{value:JSON.stringify(v)}:null;}if(sql.includes('work_items')){const v=tasks.get(args[0]);return v?{value:JSON.stringify(v)}:null;}throw Error(sql);},async all(){if(sql.includes('line_assignment_intake'))return {results:source.groupId===args[1]&&source.messageId===args[2]?[{state:'issued',input:JSON.stringify(source),result:JSON.stringify(result)}]:[]};if(sql.includes('lineSelfSource'))return {results:[]};throw Error(sql);}};}};
 const service={get:async(_,key)=>structuredClone(tasks.get(key)),update:async(_,key,input)=>{const current=tasks.get(key);if(current.history.some(h=>h.id===input.operationId))return structuredClone(current);if(current.version!==input.version)throw Object.assign(Error('conflict'),{status:409});current.history.push({id:input.operationId,text:input.text,actor:{account:'employee'},kind:'comment'});current.version++;saves++;return structuredClone(current);}};
 const env={DB:d1,LEAF_TASK_TENANT:'fixture'},deps={now:()=>100000,directory:async()=>({people:[{account:'employee'}],assertCurrent:async()=>{}}),permission:()=>active,makeEditor:()=>service,publish:()=>{}};
 const value={botUserId:bot,actor:{userId:user,account:'employee',bindingId:'binding'},source:{groupId:group,messageId:message,quotedMessageId:original,text:'聯絡資料已提供',timestamp:90000}};
 return {db,documents,tasks,env,deps,value,get saves(){return saves;},setSource:v=>source=v,setResult:v=>result=v,disable:()=>active=false};
}
test('original reply is saved once as the executor, with the original text and without completion',async()=>{const f=await fixture();try{
 assert.equal((await recordQuotedProgress(f.value,f.env,f.deps)).recorded,true);assert.equal((await recordQuotedProgress(f.value,f.env,f.deps)).recorded,true);
 assert.equal(f.saves,1);const t=f.tasks.get(id);assert.equal(t.status,'pending');assert.equal(t.history[0].actor.account,'employee');assert.equal(t.history[0].text,'LINE 群組回覆：\n聯絡資料已提供');
}finally{await f.db.close();}});
test('ambiguous sources, another group and removed access cannot write',async()=>{const f=await fixture();try{
 f.setResult({taskIds:[id,'work-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']});assert.equal((await recordQuotedProgress(f.value,f.env,f.deps)).reason,'ambiguous');
 f.setResult({taskIds:[id]});f.value.source.groupId='C'+'3'.repeat(32);assert.equal((await recordQuotedProgress(f.value,f.env,f.deps)).reason,'not_found');f.value.source.groupId=group;
 f.disable();await assert.rejects(()=>recordQuotedProgress(f.value,f.env,f.deps),{code:'ACCESS_DISABLED'});assert.equal(f.saves,0);
}finally{await f.db.close();}});

// Deployment smoke test: a unique synthetic service namespace, never the live
// vocabulary. Remove only the rows created by this run, including its audits.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import assert from 'node:assert/strict';
import {createGlossaryStore,glossaryPrompt} from '../modules/meetings/glossary.js';
const folder=process.argv[2],env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8'));
const adminUrl=fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim(),runtimeUrl=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL);
if(!runtimeUrl.hostname.includes('.'))runtimeUrl.hostname=new URL(adminUrl).hostname;
const config={ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000};
const admin=new Pool({...config,connectionString:adminUrl}),runtime=new Pool({...config,connectionString:runtimeUrl.href});
const botId='glossary-deployment-verifier-'+crypto.randomUUID(),store=createGlossaryStore(runtime,botId);
const digest=async()=>crypto.createHash('sha256').update(JSON.stringify((await admin.query("SELECT * FROM central_archive.meeting_glossary WHERE bot_id<>$1 ORDER BY bot_id,id",[botId])).rows)).digest('hex');
let result,cleaned=false;
try{
 const before=await digest(),text=Array.from({length:200},(_,i)=>'部署合成驗證詞'+String(i+1).padStart(3,'0')).join('\n');
 const preview=await store.preview(text,'text');assert.equal(preview.added,200);assert.equal((await store.list()).length,0);
 const receipt=await store.importBatch({id:'deployment-verifier'},{text,format:'text',previewHash:preview.previewHash});assert.equal(receipt.added,200);
 const rows=await store.list();assert.equal(rows.length,200);assert(glossaryPrompt(rows).includes('部署合成驗證詞200'));
 const audits=Number((await admin.query('SELECT count(*) AS n FROM central_archive.meeting_glossary_changes WHERE bot_id=$1',[botId])).rows[0].n);assert.equal(audits,200);
 const duplicate=await store.preview(text,'text');assert.equal(duplicate.skipped,200);assert.equal(duplicate.added,0);
 assert.equal(await digest(),before,'A live vocabulary entry changed during the smoke test; preserve and inspect it');
 result={passed:true,imported:200,skippedOnRepeat:200,auditCount:audits,actualRuntimeDatabaseRole:true,realVocabularyUnchanged:true};
}finally{
 try{
  await admin.query('BEGIN');await admin.query('DELETE FROM central_archive.meeting_glossary_changes WHERE bot_id=$1',[botId]);await admin.query('DELETE FROM central_archive.meeting_glossary WHERE bot_id=$1',[botId]);await admin.query('COMMIT');
  cleaned=Number((await admin.query('SELECT count(*) AS n FROM central_archive.meeting_glossary WHERE bot_id=$1',[botId])).rows[0].n)===0;
 }catch(e){await admin.query('ROLLBACK');throw e;}finally{await Promise.all([runtime.end(),admin.end()]);}
}
assert(cleaned,'Synthetic namespace cleanup incomplete');
fs.writeFileSync(folder+'/glossary-database-verified.private.json',JSON.stringify({...result,cleanupComplete:cleaned,at:new Date().toISOString()},null,2));console.log(JSON.stringify({...result,cleanupComplete:cleaned}));

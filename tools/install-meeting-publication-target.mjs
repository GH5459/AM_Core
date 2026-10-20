// Project-local owner credentials stay in the existing private release folder.
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
const [phase,folder]=process.argv.slice(2);assert(['install','verify'].includes(phase)&&path.isAbsolute(folder||''),'Pass install|verify and an absolute private release folder');
const env=parseEnv(fs.readFileSync(path.join(folder,'am-production.env'),'utf8')),url=new URL(fs.readFileSync(path.join(folder,'database-migration.private.txt'),'utf8').trim());if(!url.hostname.includes('.'))url.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const pool=new Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,query_timeout:20000});
const sql=fs.readFileSync(new URL('../modules/meetings/publication-target.sql',import.meta.url),'utf8');
try{
 if(phase==='install'){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query(sql);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 const result=await pool.query(`SELECT t.tgenabled,pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS function FROM pg_trigger t WHERE tgrelid='central_archive.meeting_workspaces'::regclass AND tgname='meeting_publication_route_guard' AND NOT tgisinternal`);assert.equal(result.rows.length,1);const row=result.rows[0];assert(['O','A'].includes(row.tgenabled));assert(row.definition.includes('BEFORE INSERT OR UPDATE'));assert(row.definition.includes('guard_meeting_publication_route'));for(const term of ['publicationTarget','conversation_key',"'infinity'::timestamptz"])assert(row.function.includes(term));
 const report={phase,verified:true,guard:'meeting_publication_route_guard',sqlSha256:crypto.createHash('sha256').update(sql).digest('hex'),existingRowsRewritten:false,at:new Date().toISOString()};fs.writeFileSync(path.join(folder,'publication-guard-'+phase+'.private.json'),JSON.stringify({...report,...result.rows[0]},null,2));console.log(JSON.stringify(report));
}catch(e){console.error(JSON.stringify({failed:true,name:e.name,code:e.code||'verification_failed'}));process.exitCode=1;}finally{await pool.end();}

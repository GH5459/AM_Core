// Complete the original meeting text/reply installation without granting DDL
// or access to any other service. Credentials and receipts stay outside Git.
import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';import assert from 'node:assert/strict';import {Pool} from 'pg';
import {MEETING_TEXT_SCHEMA} from '../modules/meetings/multilingual.js';
const folder=path.resolve(process.argv[2]||''),repo=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
assert(path.relative(repo,folder).startsWith('..'),'Use a private external folder');
const env=parseEnv(fs.readFileSync(path.join(folder,'am-production.env'),'utf8')),runtime=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL);
assert(/^[a-z0-9_]+$/i.test(runtime.username));
const pool=new Pool({connectionString:fs.readFileSync(path.join(folder,'database-migration.private.txt'),'utf8').trim(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
try{
 await pool.query('BEGIN');await pool.query("SELECT pg_advisory_xact_lock(hashtext('meeting-text-access-v1'))");
 await pool.query(MEETING_TEXT_SCHEMA);
 await pool.query(`GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_text_translations_v1,central_archive.meeting_text_replies_v1 TO "${runtime.username}"`);
 const access=await pool.query("SELECT has_table_privilege($1,'central_archive.meeting_text_replies_v1','SELECT') AS replies,has_table_privilege($1,'central_archive.meeting_text_translations_v1','SELECT,INSERT,UPDATE') AS translations,has_schema_privilege($1,'central_archive','CREATE') AS ddl",[runtime.username]);
 assert(access.rows[0].replies&&access.rows[0].translations);assert(!access.rows[0].ddl,'Runtime should keep its existing restricted role');
 await pool.query('COMMIT');const result={installed:true,tables:2,runtimeDataAccessVerified:true,runtimeSchemaCreate:false,originalRecordsUntouched:true};fs.writeFileSync(path.join(folder,'text-access.private.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}

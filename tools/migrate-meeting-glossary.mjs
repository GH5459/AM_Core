import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import assert from 'node:assert/strict';
const folder=process.argv[2],env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8'));
const admin=fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim();
const runtime=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL);
assert(/^[a-z0-9_]+$/i.test(runtime.username),'Invalid runtime role');
const pool=new Pool({connectionString:admin,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
try{
 await pool.query('BEGIN');
 await pool.query("SELECT pg_advisory_xact_lock(hashtext('meeting-glossary-schema-v1'))");
 const sql=fs.readFileSync(new URL('../modules/meetings/workspace.sql',import.meta.url),'utf8');
 const start=sql.indexOf('-- Shared vocabulary');assert(start>=0,'Glossary schema missing');
 await pool.query(sql.slice(start));
 await pool.query(`GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_glossary,central_archive.meeting_glossary_changes TO "${runtime.username}"`);
 await pool.query('COMMIT');
 console.log(JSON.stringify({migrated:true,glossaryTables:2,runtimePermissionsGranted:true,existingMeetingTablesUntouched:true}));
}catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}

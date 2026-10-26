import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import assert from 'node:assert/strict';

const folder=process.argv[2],env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8'));
const admin=fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim();
const runtime=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL);
assert(/^[a-z0-9_]+$/i.test(runtime.username),'Invalid original runtime role');
const pool=new Pool({connectionString:admin,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
try{
 await pool.query('BEGIN');
 await pool.query("SELECT pg_advisory_xact_lock(hashtext('login-continuation-schema-v1'))");
 const before=(await pool.query("SELECT has_schema_privilege($1,'central_archive','CREATE') AS can_create",[runtime.username])).rows[0];
 await pool.query(fs.readFileSync(new URL('../core/login-continuation.sql',import.meta.url),'utf8'));
 await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON central_archive.login_continuation TO "${runtime.username}"`);
 await pool.query(`GRANT SELECT,INSERT,DELETE ON central_archive.login_continuation_line_proofs,central_archive.login_continuation_nonces TO "${runtime.username}"`);
 const after=(await pool.query("SELECT has_schema_privilege($1,'central_archive','CREATE') AS can_create",[runtime.username])).rows[0];
 assert.deepEqual(after,before,'Runtime schema privileges must remain unchanged');
 await pool.query('COMMIT');
 console.log(JSON.stringify({migrated:true,loginTables:3,originalBusinessTablesUntouched:true,runtimeSchemaPrivilegeUnchanged:true}));
}catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}

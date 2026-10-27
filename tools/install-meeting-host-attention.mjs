import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';import assert from 'node:assert/strict';import {Pool} from 'pg';
const folder=path.resolve(process.argv[2]||''),repo=path.resolve('.');assert(path.relative(repo,folder).startsWith('..'),'Use a private folder outside the repository');
const env=parseEnv(fs.readFileSync(path.join(folder,'am-production.env'),'utf8')),runtime=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL),migration=new URL(fs.readFileSync(path.join(folder,'database-migration.private.txt'),'utf8').trim());
if(!migration.hostname.includes('.'))migration.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
assert(/^[a-z0-9_]+$/i.test(runtime.username));
const sql=fs.readFileSync(new URL('../modules/meetings/workspace.sql',import.meta.url),'utf8').split('-- BEGIN meeting-host-attention-v1')[1]?.split('-- END meeting-host-attention-v1')[0];assert(sql?.includes('CREATE TABLE'));
const db=new Pool({connectionString:migration.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
try{await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('meeting-host-attention-v1'))");await db.query(sql);await db.query(`GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_host_attention TO "${runtime.username}"`);
 const access=(await db.query("SELECT has_table_privilege($1,'central_archive.meeting_host_attention','SELECT,INSERT,UPDATE') AS access,has_schema_privilege($1,'central_archive','CREATE') AS ddl",[runtime.username])).rows[0];assert(access.access&&!access.ddl);await db.query('COMMIT');console.log(JSON.stringify({installed:true,tables:1,runtimeDataAccess:true,runtimeSchemaCreate:false,noRequestsCreated:true}));
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}

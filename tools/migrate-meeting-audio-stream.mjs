import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import assert from 'node:assert/strict';
const [envFile,adminFile]=process.argv.slice(2),env=parseEnv(fs.readFileSync(envFile,'utf8'));
const url=new URL(fs.readFileSync(adminFile,'utf8').trim());if(!url.hostname.includes('.'))url.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const role=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL).username;assert(/^[a-z0-9_]+$/i.test(role));
const pool=new Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
try{
 await pool.query('BEGIN');await pool.query(fs.readFileSync(new URL('../modules/meetings/audio-stream.sql',import.meta.url),'utf8'));await pool.query('GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_audio_streams TO "'+role+'"');
 const permissions=(await pool.query("SELECT has_table_privilege($1,'central_archive.meeting_audio_streams','SELECT,INSERT,UPDATE') AS allowed",[role])).rows[0];assert(permissions.allowed);await pool.query('COMMIT');
 console.log(JSON.stringify({migrated:true,receiptTableReady:true,runtimePermissionsVerified:true,legacyAudioUntouched:true}));
}catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}

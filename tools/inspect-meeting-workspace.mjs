import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
const [phase,envFile,adminFile]=process.argv.slice(2),env=parseEnv(fs.readFileSync(envFile,'utf8'));
const raw=(adminFile?fs.readFileSync(adminFile,'utf8').trim():'')||env.AMCORE_MEETINGS_MIGRATION_DATABASE_URL||env.FOREST_AM_MEMORY_MIGRATION_DATABASE_URL||env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL;
const connection=new URL(raw);if(!connection.hostname.includes('.'))connection.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const pool=new Pool({connectionString:connection.toString(),ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:15000});
try{
 const state=(await pool.query("SELECT current_database() AS database,current_user AS role,has_schema_privilege(current_user,'central_archive','CREATE') AS can_migrate")).rows[0];
 const settings=(await pool.query('SELECT count(*) AS total,count(*) FILTER(WHERE enabled) AS enabled FROM central_archive.meeting_settings')).rows[0];
 console.log(JSON.stringify({phase,canMigrate:state.can_migrate,settings,liffConfigured:Boolean(env.AMCORE_MEETINGS_LIFF_ID),publicOrigin:env.AMCORE_PUBLIC_BASE_URL,hasArchiveConnection:Boolean(env.AMCORE_LINE_IO_DATABASE_URL||env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL)}));
 if(phase==='migrate'){
  if(!state.can_migrate)throw Error('Migration role lacks schema permission');
  await pool.query(fs.readFileSync(new URL('../modules/meetings/workspace.sql',import.meta.url),'utf8'));
  const role=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL).username;if(!/^[a-z0-9_]+$/i.test(role))throw Error('Invalid runtime role');
  await pool.query(`GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_workspaces,central_archive.meeting_workspace_edits,central_archive.meeting_workspace_presence,central_archive.meeting_workspace_templates,central_archive.meeting_workspace_revisions,central_archive.meeting_workspace_access_changes,central_archive.meeting_glossary,central_archive.meeting_glossary_changes TO "${role}"`);
  await pool.query(`GRANT SELECT ON central_archive.meeting_workspace_release TO "${role}"`);
  await pool.query('GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_plans,central_archive.meeting_calendar_links,central_archive.meeting_audio_uploads,central_archive.meeting_audio_chunks TO '+JSON.stringify(role));
  await pool.query('GRANT DELETE ON central_archive.meeting_audio_chunks TO '+JSON.stringify(role));
  console.log(JSON.stringify({migrated:true,workspaceSchemaReady:true,existingConversationsUnchanged:true}));
 }
}finally{await pool.end();}

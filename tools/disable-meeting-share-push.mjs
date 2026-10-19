// Operational policy change only. Never change grants, meeting contents or
// original group publication messages; cancel only this OA's pending shares.
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
const [envFile,adminFile]=process.argv.slice(2),env=parseEnv(fs.readFileSync(envFile,'utf8')),bot=env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID;
if(!/^U[a-f0-9]{32}$/i.test(bot||''))throw Error('Original OA required');
const url=new URL(fs.readFileSync(adminFile,'utf8').trim());if(!url.hostname.includes('.'))url.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const role=new URL(env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL).username;if(!/^[a-z0-9_]+$/i.test(role))throw Error('Invalid runtime role');
const pool=new Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
try{
 await pool.query('BEGIN');
 await pool.query(fs.readFileSync(new URL('../modules/meetings/share-inbox.sql',import.meta.url),'utf8'));
 await pool.query('GRANT SELECT ON central_archive.meeting_share_delivery_policy TO '+JSON.stringify(role));
 await pool.query('SELECT w.id FROM central_archive.meeting_workspaces w JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE c.bot_id=$1 ORDER BY w.id FOR UPDATE OF w',[bot]);
 await pool.query('INSERT INTO central_archive.meeting_share_delivery_policy(bot_id,push_enabled) VALUES($1,false) ON CONFLICT(bot_id) DO UPDATE SET push_enabled=false',[bot]);
 const cancelled=await pool.query("UPDATE central_archive.meeting_share_notices n SET state='cancelled',error_code='rich_menu_only',lease_until=NULL FROM central_archive.meeting_workspaces w JOIN central_archive.conversations c ON c.key=w.conversation_key WHERE n.workspace_id=w.id AND c.bot_id=$1 AND n.state='pending'",[bot]);
 await pool.query('COMMIT');console.log(JSON.stringify({sharingPushDisabled:true,pendingCancelled:cancelled.rowCount,otherOAsAndOriginalPublicationUnchanged:true}));
}catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}

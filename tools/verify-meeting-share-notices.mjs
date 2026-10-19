// Read-only business-data verification. Private snapshots never enter Git.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
const [phase,credentials,folder,commit]=process.argv.slice(2),env=parseEnv(fs.readFileSync(credentials+'/am-production.env','utf8'));
const url=new URL(fs.readFileSync(credentials+'/database-migration.private.txt','utf8').trim());if(!url.hostname.includes('.'))url.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const pool=new Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:15000});
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 const snapshot={};for(const table of ['meeting_workspaces','meeting_settings','meeting_workspace_edits','meeting_workspace_access_changes','meeting_workspace_revisions','meeting_plans','meeting_calendar_links']){
  const rows=(await pool.query('SELECT * FROM central_archive.'+table)).rows;snapshot[table]=rows.map(r=>({id:hash([r.id,r.workspace_id,r.conversation_key,r.revision,r.version,r.account]),hash:hash(r)})).sort((a,b)=>a.id.localeCompare(b.id));
 }
 if(phase==='snapshot'){fs.mkdirSync(folder,{recursive:true});assert(!fs.existsSync(folder+'/before.private.json'));fs.writeFileSync(folder+'/before.private.json',JSON.stringify(snapshot));console.log(JSON.stringify({snapshot:true,meetings:snapshot.meeting_workspaces.length,conversations:snapshot.meeting_settings.length}));}
 else if(phase==='verify'){
  const before=JSON.parse(fs.readFileSync(folder+'/before.private.json'));
  // A real host may edit while deployment is being prepared. Accept only an
  // explicitly audited private before/after hash pair, never reset the baseline
  // or silently ignore a changed row. This verifier never writes business data.
  const exceptions=fs.existsSync(folder+'/audited-concurrent-updates.private.json')?JSON.parse(fs.readFileSync(folder+'/audited-concurrent-updates.private.json')):[];
  for(const [table,rows]of Object.entries(before))for(const row of rows){const same=snapshot[table].some(r=>r.id===row.id&&r.hash===row.hash),known=exceptions.find(x=>x.table===table&&x.before.id===row.id&&x.before.hash===row.hash);assert(same||known&&snapshot[table].some(r=>r.id===known.after.id&&r.hash===known.after.hash),'Original row changed: '+table);}
  const notices=(await pool.query('SELECT count(*) AS n FROM central_archive.meeting_share_notices')).rows[0].n;assert.equal(Number(notices),0,'Deployment itself must not enqueue or send historical grants');
  for(const origin of [env.AMCORE_PUBLIC_BASE_URL,'https://am-platform-2ymf.onrender.com']){const h=await(await fetch(origin+'/health')).json();assert.equal(h.commit,commit);assert.equal(h.conversationMeetings.workspace.shareNotices,'new-named-grants-line-notice-v1');const html=await(await fetch(origin+'/meetings/review/work/'+'0'.repeat(64))).text();assert(!html.includes('共享同仁名單'));}
  const proof={verified:true,commit,originalMeetings:before.meeting_workspaces.length,originalConversations:before.meeting_settings.length,originalDataPreserved:true,auditedConcurrentUpdates:exceptions.length,noticeJobs:0,noRealRecipientsOrMessagesWritten:true,twoOrigins:true,at:new Date().toISOString()};fs.writeFileSync(folder+'/verified.private.json',JSON.stringify(proof));console.log(JSON.stringify(proof));
 }else throw Error('Use snapshot or verify');
}finally{await pool.end();}

// Private deployment evidence only. This verifier never starts, publishes,
// edits, shares or replays a real meeting and never writes a real work task.
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {managementSignature} from '../modules/meetings/management-auth.js';
const [phase,folder,expected]=process.argv.slice(2),env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8'));
const pool=new Pool({connectionString:fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000});
const write=(file,value)=>fs.writeFileSync(folder+'/'+file,JSON.stringify(value,null,2));
try{
 const meetings=(await pool.query('SELECT id,state,revision,fields,field_versions,receipt,source,host_id,filename,created_at,updated_at FROM central_archive.meeting_workspaces ORDER BY id')).rows;
 const path='/integrations/meeting-management/conversations',actor='0',timestamp=String(Date.now()),signature=managementSignature(env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY,{method:'GET',path,actor,timestamp});
 const response=await fetch(env.AMCORE_PUBLIC_BASE_URL+path,{headers:{'x-meeting-actor':actor,'x-meeting-time':timestamp,'x-meeting-signature':signature},signal:AbortSignal.timeout(45000)});assert(response.ok,'Inventory unavailable');
 const inventory=await response.json(),conversations=inventory.conversations.map(r=>({key:r.key,enabled:r.enabled,todoMode:r.todoMode,tenantKey:r.tenantKey,version:r.version,notionUrl:r.notionUrl,driveUrl:r.driveUrl})).sort((a,b)=>a.key.localeCompare(b.key));
 if(phase==='snapshot'){write('meetings-before.private.json',meetings);write('conversations-before.private.json',conversations);console.log(JSON.stringify({snapshot:true,meetings:meetings.length,conversations:conversations.length}));}
 else if(phase==='verify'){
  const before=JSON.parse(fs.readFileSync(folder+'/meetings-before.private.json')),settings=JSON.parse(fs.readFileSync(folder+'/conversations-before.private.json'));
  assert.deepEqual(JSON.parse(JSON.stringify(meetings)),before,'Original meeting content or state changed');assert.deepEqual(conversations,settings,'Conversation settings changed');
  const schema=(await pool.query("SELECT count(*) FILTER(WHERE sharing_enabled) AS shared,count(*) AS total FROM central_archive.meeting_workspaces")).rows[0];assert.equal(Number(schema.shared),0,'A real meeting was unexpectedly shared');
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM central_archive.meeting_workspace_revisions')).rows[0].n),0,'A real revision was unexpectedly submitted');
  for(const origin of [env.AMCORE_PUBLIC_BASE_URL,'https://am-platform-2ymf.onrender.com']){const health=await(await fetch(origin+'/health')).json();assert.equal(health.commit,expected,'Production commit mismatch');assert.equal(health.conversationMeetings.workspace.sharing,'host-opt-in-published-read-only');}
  const published=meetings.find(r=>r.state==='published');if(published){const page=await fetch(env.AMCORE_PUBLIC_BASE_URL+'/meetings/review/work/'+published.id),html=await page.text();assert(page.ok);for(const marker of ['id="readerPanel"','id="saveRevision"','id="shareEnabled"','preload="metadata"'])assert(html.includes(marker));assert(!html.includes('載入原始錄音'));const denied=await fetch(new URL(page.url).origin+'/meetings/review/work/'+published.id+'/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read'})});assert.equal(denied.status,401);}
  const result={verified:true,commit:expected,meetings:meetings.length,conversations:conversations.length,originalContentAndSettingsPreserved:true,noRealMeetingsSharedOrRevised:true,anonymousPrivateMeetingDenied:true,twoOrigins:true,at:new Date().toISOString()};write('production-verified.private.json',result);console.log(JSON.stringify(result));
 }else throw Error('Unknown phase');
}finally{await pool.end();}

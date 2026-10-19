import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
const [phase,folder,commit]=process.argv.slice(2),env=parseEnv(fs.readFileSync(folder+'/am-production.env','utf8'));
const raw=fs.readFileSync(folder+'/database-migration.private.txt','utf8').trim(),url=new URL(raw);
if(!url.hostname.includes('.'))url.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const pool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:15000}),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 const settings=(await pool.query('SELECT * FROM central_archive.meeting_settings ORDER BY conversation_key')).rows;
 const meetings=(await pool.query('SELECT * FROM central_archive.meeting_workspaces ORDER BY id')).rows;
 if(phase==='snapshot'){assert(!fs.existsSync(folder+'/hub-before.private.json'));fs.writeFileSync(folder+'/hub-before.private.json',JSON.stringify({settings,meetings},null,2));console.log(JSON.stringify({snapshot:true,conversations:settings.length,meetings:meetings.length}));}
 else if(phase==='verify'){
  const before=JSON.parse(fs.readFileSync(folder+'/hub-before.private.json'));assert.equal(hash(settings),hash(before.settings),'Original settings changed');assert.equal(hash(meetings.filter(r=>before.meetings.some(x=>x.id===r.id))),hash(before.meetings),'Existing meeting rows changed');
  for(const base of [env.AMCORE_PUBLIC_BASE_URL,'https://am-platform-2ymf.onrender.com']){const h=await(await fetch(base+'/health')).json();assert.equal(h.commit,commit);assert.equal(h.conversationMeetings.workspace.hub,'meeting-hub-plans-audio-calendar-v1');const page=await fetch(base+'/meetings/review/hub');assert.equal(page.status,200);assert((await page.text()).includes('預排會議'));const r=await fetch(base+'/meetings/review/hub/api',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"list"}'});assert.equal(r.status,401);}
  const plans=Number((await pool.query('SELECT count(*) AS n FROM central_archive.meeting_plans')).rows[0].n);assert.equal(plans,0,'No real plan should be created by deployment verification');
  const result={verified:true,commit,conversations:settings.length,existingMeetings:before.meetings.length,originalDataAndSettingsPreserved:true,noRealPlanOrRecordingCreated:true,twoOrigins:true,anonymousApiDenied:true,at:new Date().toISOString()};fs.writeFileSync(folder+'/hub-verified.private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }else throw Error('Use snapshot or verify');
}finally{await pool.end();}

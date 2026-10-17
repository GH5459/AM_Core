const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));const root=path.resolve(__dirname,'..');
const replace=(s,a,b)=>{assert.equal(s.split(a).length,2,'Patch anchor changed: '+a.slice(0,100));return s.replace(a,b);};
const dir=folder+'/dailylog';let source=fs.readFileSync(dir+'/baseline/worker.mjs','utf8');
const anchor='    if (value.tenantKey !== tenant) throw fail222("TENANT_MISMATCH", 403);';
source='import {publishMeetingAssignments} from "./meeting-workspace-assignment.mjs";\n'+replace(source,anchor,anchor+`
    if(route.endsWith('/meeting-publish'))return response4(await publishMeetingAssignments(value,env,{now,directory,permission:permission2,makeService,publish}));
    if(route.endsWith('/meeting-person')){
      const roster=await directory(),person=roster.people.find(p=>p.account===value.account&&permission2(p.account));
      return response4({ok:true,person:person?{name:person.name||person.displayName||person.account}:null});
    }
    if(route.endsWith('/meeting-directory')){
      const roster=await directory(),active=new Set(roster.people.filter(p=>permission2(p.account)).map(p=>p.account));
      const rows=await db.prepare("SELECT value FROM documents WHERE namespace='line-work-identities'").all();
      const people=(rows.results||[]).map(r=>JSON.parse(r.value)).filter(p=>p.lineUserId&&active.has(p.account)).map(p=>({userId:p.lineUserId,account:p.account}));
      return response4({ok:true,people});
    }`);
// Use the exact response helper in the current deployed machine scope.
const scope=source.slice(source.indexOf('async function assignmentMachine'),source.indexOf('async function assignmentMachine')+3500);
const helper=scope.match(/return (response\w*)\(\{ ok: false, code: "UNAUTHORIZED"/);assert(helper,'Find deployed response helper');source=source.replaceAll('return response4(await publishMeetingAssignments','return '+helper[1]+'(await publishMeetingAssignments').replaceAll('return response4({ok:true,person:','return '+helper[1]+'({ok:true,person:').replaceAll('return response4({ok:true,people})','return '+helper[1]+'({ok:true,people})');
fs.writeFileSync(dir+'/candidate/worker.mjs',source);fs.copyFileSync(root+'/modules/meetings/dailylog-assignment.mjs',dir+'/candidate/meeting-workspace-assignment.mjs');
const uof=folder+'/uof';let u=fs.readFileSync(uof+'/baseline/worker.mjs','utf8');const start=u.indexOf('managementAssets.js += "\\n" + '),end=u.indexOf('\nvar MANAGEMENT_PATH = "/Management";',start);assert(start>=0&&end>start);
u=u.slice(0,start)+'managementAssets.js += "\\n" + '+JSON.stringify(fs.readFileSync(root+'/modules/meetings/management-ui.js','utf8'))+';'+u.slice(end);fs.writeFileSync(uof+'/candidate/worker.mjs',u);
console.log('Built precise DailyLog meeting assignment endpoint and UOF meeting UI; all other module files retained.');

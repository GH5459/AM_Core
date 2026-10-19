const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));let s=fs.readFileSync(folder+'/dailylog/baseline/worker.mjs','utf8');
if(s.includes("import {syncMeetingCalendar} from './meeting-hub-calendar.mjs';")){
 // Later bundled calendar factories (including lunar recurrence) must retain
 // the meeting adapter. Repair the active factory without replacing its logic.
 if(!s.includes('meetingEvent:(auth,value)=>syncMeetingCalendar')){
  const signature='function createCalendarBot({ read, write, google, canUse, serviceToken, resolveAccount,';
  const result='return { key, authorize, createEvent };';
  assert.equal(s.split(signature).length,2,'Expected one active Calendar factory');
  assert.equal(s.split(result).length,2,'Expected one Calendar return');
  assert(s.includes('createCalendarBot({meetingDb:db,'),'Original database wiring required');
  s=s.replace(signature,signature.replace('{ read,','{ meetingDb, read,'));
  s=s.replace(result,'return { key, authorize, createEvent, meetingEvent:(auth,value)=>syncMeetingCalendar(auth,value,{db:meetingDb,resolveAccount,checkUser,connection,calendarFor,google}) };');
 }
 fs.writeFileSync(folder+'/dailylog/candidate/worker.mjs',s);fs.copyFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-meeting-calendar.mjs'),folder+'/dailylog/candidate/meeting-hub-calendar.mjs');console.log('Updated meeting Calendar adapter; current lunar factory and full Worker preserved.');return;
}
const patch=(a,b)=>{assert.equal(s.split(a).length,2,'Current full module anchor changed: '+a.slice(0,90));s=s.replace(a,b);};
patch('function createCalendarBot({ read: read52, write, google, canUse, serviceToken, resolveAccount,','function createCalendarBot({ meetingDb, read: read52, write, google, canUse, serviceToken, resolveAccount,');
patch('return { key, authorize, createEvent };','return { key, authorize, createEvent, meetingEvent:(auth,value)=>syncMeetingCalendar(auth,value,{db:meetingDb,resolveAccount,checkUser,connection,calendarFor,google}) };');
patch('const bot = import_calendar_bot_core.default.createCalendarBot({','const bot = import_calendar_bot_core.default.createCalendarBot({meetingDb:db,');
patch('async function rawGoogle(path, token, { method = "GET", body: body2 } = {}) {','async function rawGoogle(path, token, { method = "GET", body: body2, headers: meetingHeaders } = {}) {');
patch('headers: { Authorization: "Bearer " + token, ...body2 ? { "Content-Type": "application/json" } : {} }','headers: { Authorization: "Bearer " + token, ...(meetingHeaders?.["If-Match"]?{"If-Match":meetingHeaders["If-Match"]}:{}), ...body2 ? { "Content-Type": "application/json" } : {} }');
const route='        if (path === import_calendar_bot_core.default.EVENT_PATH) {';
patch(route,`        if(path===import_calendar_bot_core.default.EVENT_PATH+'/meetings'){
          try{if(request.method!=='POST')return send(json3({ok:false,code:'METHOD_NOT_ALLOWED'},405));const auth=await bot.authorize(request.headers.get('authorization'));const result=await bot.meetingEvent(auth,await bodyJson(request,64*1024));return send(json3(result,200));}
          catch(e){return send(json3({ok:false,code:e.code||'GOOGLE_UNAVAILABLE',error:e.status?e.message:'Calendar 暫時無法更新，請重試原排程。'},e.status||502));}
        }
`+route);
s="import {syncMeetingCalendar} from './meeting-hub-calendar.mjs';\n"+s;
fs.writeFileSync(folder+'/dailylog/candidate/worker.mjs',s);fs.copyFileSync(path.resolve(__dirname,'../modules/meetings/dailylog-meeting-calendar.mjs'),folder+'/dailylog/candidate/meeting-hub-calendar.mjs');
console.log('Extended current authenticated Calendar service; other full modules and assets retained.');

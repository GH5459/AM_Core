const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function once(s,from,to){assert.equal(s.split(from).length,2,'Production asset differs from the reviewed source');return s.replace(from,to);}
const upper=fs.readFileSync(path.join(__dirname,'upper-panel.js'),'utf8');
exports.patchJournal=function(s){
 return s+'\n'+upper;
};
exports.patchIndex=function(s){
 const start="$('#personalWorkspace').innerHTML=`<div class=\"personal-toolbar\">";
 const end="`;\n if($('#habitMonth'))";
 s=once(s,start,"window.dailylogApplyWorkspace(`<div class=\"personal-toolbar\">");
 return once(s,end,"`);\n if($('#habitMonth'))");
};
exports.patchCalendar=function(s){
 s=once(s,"async function loadCalendarEvents(force=false){await Promise.all([loadPersonalCalendarEvents(force),...unitCalendars().map(unit=>loadUnitCalendarEvents(force,unit.id))]);}","let dailylogInitialCalendarDate=null,dailylogAutoCalendarAttempted=false;\nasync function loadCalendarEvents(force=false){if(dailylogInitialCalendarDate===null)dailylogInitialCalendarDate=selectedDate;if(!force&&(selectedDate!==dailylogInitialCalendarDate||dailylogAutoCalendarAttempted))return;if(force||calendarConnected()||anyUnitCalendarConnected())dailylogAutoCalendarAttempted=true;await Promise.all([loadPersonalCalendarEvents(force),...unitCalendars().map(unit=>loadUnitCalendarEvents(force,unit.id))]);}");
 s=once(s,"connected?calendarEventsHtml(state.loadedKey===key?state.events:[]):", "connected?(state.loadedKey===key?calendarEventsHtml(state.events):'<p class=\"calendar-empty\">按「更新單位行程」讀取這一天的行程。</p>'):");
 s=once(s,"calendarState.error&&!prefs.demo?calendarErrorHtml():calendarEventsHtml(events,mobile,prefs.demo).replace", "calendarState.error&&!prefs.demo?calendarErrorHtml():!prefs.demo&&calendarState.loadedKey!==key?'<p class=\"calendar-empty\">按「更新行程」讀取這一天的行程。</p>':calendarEventsHtml(events,mobile,prefs.demo).replace");
 s=once(s,"$('#calendarEventDialog').close();calendarState.loadedKey='';const refresh=loadCalendarEvents(true);render();await refresh;toast(","$('#calendarEventDialog').close();if(!draft.demo&&calendarState.loadedKey===selectedDate+':'+draft.calendarId&&Array.from({length:7},(_,i)=>addDays(selectedDate,i)).some(date=>eventsForDate([payload],date).length))calendarState.events=[...calendarState.events.filter(e=>e.id!==payload.id),payload];render();paintCalendar();toast(");
 return s;
};
exports.patchWorker=function(source){
 source=once(source,"import {meetingProxy,meetingAssets} from './dailylog-meetings.mjs';","import {meetingProxy,meetingAssets} from './dailylog-meetings.mjs';\nimport {stableAssets} from './stable-upper-panel.mjs';");
 source=once(source,'return meetingAssets(request,await task_save_attachments_worker.fetch(request,env,ctx));','return stableAssets(request,await meetingAssets(request,await task_save_attachments_worker.fetch(request,env,ctx)));');
 return source;
};
exports.buildModule=function(){
 const runtimeOnce="function once(s,from,to){if(s.split(from).length!==2)throw Error('Unexpected upstream asset');return s.replace(from,to)}";
 return [runtimeOnce,'const upper='+JSON.stringify(upper)+';',
  'const patchJournal='+exports.patchJournal.toString()+';',
  'const patchIndex='+exports.patchIndex.toString()+';',
  'const patchCalendar='+exports.patchCalendar.toString()+';',
  `export async function stableAssets(request,response){
    if(request.method!=='GET'||response.status!==200)return response;
    const path=new URL(request.url).pathname;
    if(path!=='/journal.js'&&path!=='/calendar.js'&&path!=='/'&&path!=='/index.html')return response;
    const source=await response.text();
    const body=path==='/journal.js'?patchJournal(source):path==='/calendar.js'?patchCalendar(source):patchIndex(source);
    const h=new Headers(response.headers);for(const key of ['Content-Length','Content-Encoding','ETag'])h.delete(key);h.set('Cache-Control','private, no-store');
    return new Response(body,{status:response.status,headers:h});
  }`].join('\n');
};

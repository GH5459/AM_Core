const fs=require('fs'),assert=require('assert/strict');
const replaceOnce=(text,from,to)=>{assert.equal(text.split(from).length,2,'Unexpected live meeting client; inspect current source');return text.replace(from,to);};
exports.patchClient=function(client){
 client=replaceOnce(client,"const views=new Map();","const views=new Map(),pendingCalendar=new Map();");
 client=replaceOnce(client,"root.textContent='正在讀取會議…';",`const entry=pendingCalendar.get(path);if(entry){const section=document.createElement('section'),title=document.createElement('h2'),topic=document.createElement('p'),time=document.createElement('p'),status=document.createElement('p');section.style.cssText='padding:20px;font:16px/1.5 system-ui;color:#204c38';title.textContent='預排會議';topic.textContent=entry.topic;time.textContent=[entry.start,entry.end].filter(Boolean).join(' — ');status.setAttribute('role','status');status.textContent='正在開啟會議表單並核對原行程…';section.append(title,topic,time,status);root.append(section);}else root.textContent='正在讀取會議…';`);
 const init="initializeDailylogMeeting(scopedWindow,scopedDocument,scopedLocation,scopedFetch,setInterval,setTimeout,clearInterval,clearTimeout,boot,target.pathname==='/meetings/review/hub'?'hub':'work');";
 client=replaceOnce(client,init,init+"if(entry){if(typeof local.dailylogCalendarEntry!=='function')throw Error('會議建立功能尚未準備完成，請重新讀取。');local.dailylogCalendarEntry(entry);pendingCalendar.delete(path);}");
 const a=client.indexOf(' async function fileMeeting(button){'),b=client.indexOf('\n function init(){',a);assert(a>=0&&b>a);client=client.slice(0,a)+' '+fs.readFileSync(__dirname+'/calendar-entry.js','utf8').trimEnd()+client.slice(b);
 client=replaceOnce(client,'const org=o.organization;','const org=o.organization;window.dailylogMeetingSources=s.sources;');
 client=replaceOnce(client,' async function requestedCalendar(){', '\n '+fs.readFileSync(__dirname+'/hub-entry.js','utf8')+'\n async function requestedCalendar(){');
 return client;
};
exports.patchWorker=function(source){const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);const start=source.lastIndexOf('return new Response(',end);assert(start>route&&source.slice(route,start).includes('status:401'));const client=JSON.parse(source.slice(start+'return new Response('.length,end));return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);};

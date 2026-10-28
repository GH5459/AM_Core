const assert=require('node:assert/strict');
function replaceOnce(s,from,to){assert.equal(s.split(from).length,2,'Unexpected meeting client; inspect current production');return s.replace(from,to);}
exports.patchClient=function(client){
 const oldGuard="form.addEventListener('submit',event=>{if(!verified){event.preventDefault();event.stopImmediatePropagation();}},true);";
 const newGuard="const entryGuard=event=>{if(!verified){event.preventDefault();event.stopImmediatePropagation();}};form.addEventListener('submit',entryGuard,true);";
 client=replaceOnce(client,oldGuard,newGuard);
 const oldNew="const originalNew=newButton.onclick;newButton.onclick=function(event){notice.remove();retry.remove();verified=true;originalNew?.call(this,event);};";
 const newNew="const originalNew=newButton.onclick;const cancelEntry=()=>{attempt++;verified=true;form.removeEventListener('submit',entryGuard,true);notice.remove();retry.remove();source.disabled=false;button.disabled=false;newButton.disabled=false;calendarRef='';calendarMode(false);newButton.onclick=originalNew;delete window.cancelDailylogCalendarEntry;};window.cancelDailylogCalendarEntry=cancelEntry;newButton.onclick=function(event){cancelEntry();originalNew?.call(this,event);};";
 client=replaceOnce(client,oldNew,newNew);
 const init="initializeDailylogMeeting(scopedWindow,scopedDocument,scopedLocation,scopedFetch,setInterval,setTimeout,clearInterval,clearTimeout,boot,target.pathname==='/meetings/review/hub'?'hub':'work');";
 const cancel=`if(target.pathname==='/meetings/review/hub'){const panel=body.querySelector('#newPanel'),save=body.querySelector('#create'),newButton=body.querySelector('#new'),status=body.querySelector('#status');const button=document.createElement('button');button.type='button';button.textContent='取消新增';button.onclick=()=>{if(save.disabled&&!newButton.disabled){status.textContent='會議正在儲存，請先等待結果。';return;}local.cancelDailylogCalendarEntry?.();panel.hidden=true;newButton.focus();};panel.querySelector('h2').after(button);}`;
 return replaceOnce(client,init,init+cancel);
};
exports.patchWorker=function(source){const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);const start=source.lastIndexOf('return new Response(',end);assert(start>route&&source.slice(route,start).includes('status:401'));const client=JSON.parse(source.slice(start+'return new Response('.length,end));return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);};

export function workspaceFirstClient(){
 const url=new URL(location.href),active=!url.hash&&!['task','issue','workTab'].some(k=>url.searchParams.has(k));
 if(!active)return;
 let released=false,positioned=false,positionDone=false,cancelled=false,ready=false,anchorY=null,scheduled=false,timer;
 const queued=new Set(),tabs=()=>document.querySelector('.journal-tabs[aria-label="工作類型"]');
 const deferUpper=fn=>{if(released)return false;queued.add(fn);return true;};
 function release(){if(released)return;released=true;clearTimeout(timer);window.dispatchEvent(new Event('dailylog:upper-loading'));for(const fn of queued){try{Promise.resolve(fn()).catch(()=>{});}catch{}}queued.clear();}
 function userIntent(event){if(!positionDone&&(event.type!=='keydown'||['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)))cancelled=true;}
 for(const type of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(type,userIntent,{capture:true,passive:true});
 function upperVisible(){const t=tabs();return t&&t.getBoundingClientRect().top>48;}
 function check(){
  const tab=tabs(),add=document.getElementById('addTodayTask');if(!tab)return;
  if(!ready&&add&&!add.disabled){ready=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(!cancelled&&!positioned){positioned=true;tab.style.scrollMarginTop='12px';tab.scrollIntoView({block:'start',behavior:'instant'});}
   positionDone=true;anchorY=tabs()?.getBoundingClientRect().top+window.scrollY;
   document.documentElement.dataset.dailylogWorkspaceReady='true';window.dispatchEvent(new Event('dailylog:workspace-ready'));
   if(cancelled&&upperVisible())release();
  }));return;}
  if(!ready||anchorY===null)return;
  const next=tab.getBoundingClientRect().top+window.scrollY,delta=next-anchorY,below=anchorY<=window.scrollY+32;anchorY=next;
  // Compensate only for layout above the work tabs. User scrolling does not
  // change this document coordinate, so it never becomes a new positioning action.
  if(below&&Math.abs(delta)>.5)window.scrollBy({top:delta,behavior:'instant'});
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;check();});}
 window.dailylogWorkspaceFirst={deferUpper,release,get released(){return released;}};
 window.addEventListener('dailylog:initial-tasks-settled',()=>{if(ready)release();else window.addEventListener('dailylog:workspace-ready',release,{once:true});},{once:true});
 window.addEventListener('scroll',()=>{if(ready&&upperVisible())release();},{passive:true});
 document.addEventListener('click',event=>{if(event.target.closest('[data-web-private],.web-journal-top,#calendarPanel,.private-vault-slot'))release();},true);
 document.addEventListener('DOMContentLoaded',()=>{
  const workspace=document.getElementById('personalWorkspace');if(!workspace){release();return;}
  workspace.style.overflowAnchor='none';new MutationObserver(schedule).observe(workspace,{childList:true,subtree:true});new ResizeObserver(schedule).observe(workspace);
  timer=setTimeout(release,15000);check();
 },{once:true});
}

function replaceOnce(source,from,to){return source.split(from).length===2?source.replace(from,to):null;}
export async function workspaceFirstAssets(request,response){
 if(request.method!=='GET'||response.status!==200)return response;
 const path=new URL(request.url).pathname;
 if(!['/','/index.html','/line-entry','/calendar.js','/private-vault-shell.js','/tasks.js'].includes(path))return response;
 let source=await response.text(),next=null;
 if(['/','/index.html','/line-entry'].includes(path)){
  if(!response.headers.get('Content-Type')?.includes('text/html')||!source.includes('id="personalWorkspace"'))return new Response(source,response);
  next=source.replace(/<head(?:\s[^>]*)?>/i,m=>m+'<script>('+workspaceFirstClient.toString()+')();</script>');
 }else if(path==='/private-vault-shell.js')next=replaceOnce(source,'function mount(){','function mount(){\n  if(window.dailylogWorkspaceFirst?.deferUpper(mount))return;');
 else if(path==='/calendar.js'){
  next=replaceOnce(source,'async function loadCalendarEvents(force=false){','async function loadCalendarEvents(force=false){if(!force&&window.dailylogWorkspaceFirst?.deferUpper(loadCalendarEvents)){if(typeof dailylogInitialCalendarDate!=="undefined"&&dailylogInitialCalendarDate===null)dailylogInitialCalendarDate=selectedDate;return;}');
  if(next)next=replaceOnce(next,'function restorePersonalCalendarConnection(){','function restorePersonalCalendarConnection(){if(window.dailylogWorkspaceFirst?.deferUpper(restorePersonalCalendarConnection))return;');
 }else if(path==='/tasks.js')next=replaceOnce(source,"await reload();const id=new URL(location.href).searchParams.get('task');","await reload();window.dispatchEvent(new Event('dailylog:initial-tasks-settled'));const id=new URL(location.href).searchParams.get('task');");
 if(next===null)return new Response(source,response);
 const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag'])headers.delete(name);headers.set('Cache-Control','private, no-store');headers.set('X-DailyLog-Workspace-Policy','work-first-once-v1');
 return new Response(next,{status:response.status,headers});
}

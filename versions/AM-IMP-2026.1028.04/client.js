(()=>{
 let frame,requested='',current='';const views=new Map();
 const panel=()=>'<section id="dailylogMeetings" aria-label="會議"><div class="actions"><button class="btn" type="button" data-meeting-home>會議清單</button><span>會議與記錄沿用原資料，可隨時切換工作分頁。</span></div><div id="dailylogMeetingSlot"></div></section>';
 function position(){if(!frame)return;const slot=document.getElementById('dailylogMeetingSlot');frame.hidden=!slot;if(!slot)return;const r=slot.getBoundingClientRect();Object.assign(frame.style,{left:r.left+scrollX+'px',top:r.top+scrollY+'px',width:r.width+'px',height:r.height+'px'});}
 function mount(){const slot=document.getElementById('dailylogMeetingSlot');if(slot&&!frame){frame=document.createElement('section');frame.setAttribute('aria-label','會議與會議記錄');frame.style.cssText='position:absolute;z-index:1;border:0;border-radius:10px;background:white;overflow:auto';document.body.append(frame);void show(requested||'/meetings/review/hub');}position();}
 function open(path){requested=path;personalView='journals';journalWorkTab='meetings';render();if(frame)void show(path);document.getElementById('journal-tab-meetings')?.focus({preventScroll:true});}
 async function show(path){
  const target=new URL(path,location.origin);if(target.origin!==location.origin||!/^\/meetings\/review\/(?:hub|work\/[a-f0-9]{64}(?:\/glossary)?)$/.test(target.pathname))throw Error('無法開啟這個會議位置。');
  path=target.pathname+target.search;if(current===path)return;current=path;
  for(const [key,v]of views)v.host.hidden=key!==path;
  if(views.has(path))return;
  const host=document.createElement('div');frame.append(host);const root=host.attachShadow({mode:'open'});views.set(path,{host,root});root.textContent='正在讀取會議…';
  try{
   const response=await fetch(path,{cache:'no-store'});if(!response.ok){const value=await response.json().catch(()=>({}));throw Error(value.error||'會議暫時無法讀取，請稍後重試。');}
   const parsed=new DOMParser().parseFromString(await response.text(),'text/html'),bootNode=parsed.getElementById('dailylogMeetingBoot');if(!bootNode)throw Error('會議功能尚未更新完成，請稍後重試。');const boot=JSON.parse(bootNode.content.textContent);
   parsed.querySelectorAll('script').forEach(n=>n.remove());root.replaceChildren();const head=document.createElement('div'),body=document.createElement('div');body.dataset.meetingBody='';
   for(const s of parsed.querySelectorAll('style')){s.textContent=s.textContent.replace(/\bbody\b/g,'[data-meeting-body]').replace(/:root/g,':host');head.append(document.importNode(s,true));}body.append(...Array.from(parsed.body.childNodes,n=>document.importNode(n,true)));body.querySelectorAll('style').forEach(n=>n.remove());root.append(head,body);
   const realDocument=document,realWindow=window,local={dailylogMeetingEmbedded:true,loginContinuationSession:async()=>true,tryLoginContinuation:async()=>false};
   const scopedDocument=new Proxy(realDocument,{get(d,key){if(key==='body')return body;if(key==='head')return head;if(key==='activeElement')return root.activeElement;if(key==='hidden')return realDocument.hidden||host.hidden||frame.hidden;if(key==='querySelector')return s=>root.querySelector(s);if(key==='querySelectorAll')return s=>root.querySelectorAll(s);if(key==='getElementById')return id=>root.getElementById(id);const v=Reflect.get(d,key,d);return typeof v==='function'?v.bind(d):v;}});
   const navigate=url=>open(new URL(url,target).pathname+new URL(url,target).search),scopedLocation={origin:location.origin,search:target.search,assign:navigate,replace:navigate,get href(){return target.href;},set href(v){navigate(v);}};
   const scopedWindow=new Proxy(local,{get(o,key){if(key in o)return o[key];if(key==='document')return scopedDocument;if(key==='location')return scopedLocation;if(key==='close')return ()=>open('/meetings/review/hub');const v=realWindow[key];return typeof v==='function'&&!(v.prototype)?v.bind(realWindow):v;},set(o,key,v){o[key]=v;return true;}});
   const scopedFetch=(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,target);if(url.origin!==location.origin||!url.pathname.startsWith('/meetings/'))throw Error('會議連線位置不正確。');const headers=new Headers(options.headers||(input instanceof Request?input.headers:undefined));headers.set('X-DailyLog-CSRF',window.DAILYLOG_AUTH.csrfToken);return fetch(input,{...options,headers});};
   root.addEventListener('click',e=>{const link=e.composedPath().find(n=>n instanceof HTMLAnchorElement);if(!link)return;const url=new URL(link.href,target);if(url.origin===location.origin&&/^\/meetings\/review\/(?:hub|work\/[a-f0-9]{64}(?:\/glossary)?)$/.test(url.pathname)){e.preventDefault();open(url.pathname+url.search);}});
   initializeDailylogMeeting(scopedWindow,scopedDocument,scopedLocation,scopedFetch,setInterval,setTimeout,clearInterval,clearTimeout,boot,target.pathname==='/meetings/review/hub'?'hub':'work');
  }catch(e){root.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=e.message;const retry=document.createElement('button');retry.className='btn';retry.textContent='重新讀取會議';retry.onclick=()=>{host.remove();views.delete(path);if(current===path)current='';void show(path);};root.append(message,retry);}
 }
 async function fileMeeting(button){
  const date=button.dataset.meetingDate,id=button.dataset.meetingEvent;button.disabled=true;button.textContent='建檔中…';
  const api=async value=>{const r=await fetch('/meetings/review/hub/api',{method:'POST',headers:{'Content-Type':'application/json','X-DailyLog-CSRF':window.DAILYLOG_AUTH.csrfToken},body:JSON.stringify(value)}),data=await r.json();if(!r.ok)throw Error(data.error||'會議建檔未完成。');return data;};
  try{
   const calendar=await api({action:'calendar-week',start:date}),event=calendar.items.find(e=>e.id===id);if(!event)throw Error('行程或個人日曆已變更，請重新讀取行事曆。');
   const sources=await api({action:'sources'}),personal=sources.sources.filter(s=>s.kind==='user');
   if(personal.length!==1){open('/meetings/review/hub?'+new URLSearchParams({event:id,start:date}));return;}
   const result=await api({action:'create',calendarRef:event.calendarRef,conversationKey:personal[0].key});
   const target=new URL(result.url,location.href);if(target.origin!==location.origin||!/^\/meetings\/review\/work\/[a-f0-9]{64}$/.test(target.pathname))throw Error('會議已接收，請由會議清單確認。');open(target.pathname);
  }catch(e){if(typeof toast==='function')toast(e.message);else alert(e.message);}
  finally{button.disabled=false;button.textContent='會議建檔';}
 }
 function init(){
  if(typeof renderJournalWorkPanel!=='function')return;
  if(typeof getJournalWorkTabs==='function'){const tabs=getJournalWorkTabs;getJournalWorkTabs=()=>({...tabs(),meetings:'會議'});}else if(typeof journalWorkTabs!=='undefined')journalWorkTabs.meetings='會議';
  const work=renderJournalWorkPanel;renderJournalWorkPanel=function(content){return journalWorkTab==='meetings'?panel():work(content);};
  // Keep native meeting nodes attached. Tab changes retain editors and recording.
  const original=render;render=function(...args){const result=original(...args);mount();return result;};
  window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});new ResizeObserver(position).observe(document.querySelector('main')||document.body);
  document.addEventListener('click',event=>{const b=event.target.closest('[data-meeting-event]');if(b){event.preventDefault();if(!b.disabled)void fileMeeting(b);}if(event.target.closest('[data-meeting-home]'))open('/meetings/review/hub');});
  const style=document.createElement('style');style.textContent='#personalWorkspace .journal-tabs[aria-label="工作類型"]{display:flex;flex-wrap:wrap}#personalWorkspace .journal-tabs [data-work-tab]{width:auto;min-width:0;flex:1 1 60px;min-height:44px}#dailylogMeetings{min-width:0}#dailylogMeetings .actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px}#dailylogMeetingSlot{min-width:0;height:78vh;min-height:560px}#calendarPanel .calendar-event{flex-wrap:wrap}#calendarPanel [data-meeting-event]{min-height:44px}';document.head.append(style);
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

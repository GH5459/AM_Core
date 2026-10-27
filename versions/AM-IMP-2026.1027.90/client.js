(()=>{
 let frame,requested='';
 const panel=()=>'<section id="dailylogMeetings" aria-label="會議"><div class="actions"><button class="btn" type="button" data-meeting-home>會議清單</button><span>會議與記錄沿用原資料，可隨時切換工作分頁。</span></div><div id="dailylogMeetingSlot"></div></section>';
 function position(){if(!frame)return;const slot=document.getElementById('dailylogMeetingSlot');frame.hidden=!slot;if(!slot)return;const r=slot.getBoundingClientRect();Object.assign(frame.style,{left:r.left+scrollX+'px',top:r.top+scrollY+'px',width:r.width+'px',height:r.height+'px'});}
 function mount(){const slot=document.getElementById('dailylogMeetingSlot');if(slot&&!frame){frame=document.createElement('iframe');frame.title='會議與會議記錄';frame.allow='microphone';frame.style.cssText='position:absolute;z-index:1;border:0;border-radius:10px;background:white';frame.src=requested||'/meetings/review/hub';document.body.append(frame);}position();}
 function open(path){requested=path;personalView='journals';journalWorkTab='meetings';render();if(frame){let current;try{current=new URL(frame.contentWindow.location.href);}catch{}if(!current||current.pathname+current.search!==path)frame.src=path;}document.getElementById('journal-tab-meetings')?.focus({preventScroll:true});}
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
  // Keep the browsing context attached to one permanent node. Moving an iframe
  // between panels reloads it and would discard recordings or unsaved edits.
  const original=render;render=function(...args){const result=original(...args);mount();return result;};
  window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});new ResizeObserver(position).observe(document.querySelector('main')||document.body);
  document.addEventListener('click',event=>{const b=event.target.closest('[data-meeting-event]');if(b){event.preventDefault();if(!b.disabled)void fileMeeting(b);}if(event.target.closest('[data-meeting-home]'))open('/meetings/review/hub');});
  const style=document.createElement('style');style.textContent='#personalWorkspace .journal-tabs[aria-label="工作類型"]{display:flex;flex-wrap:wrap}#personalWorkspace .journal-tabs [data-work-tab]{width:auto;min-width:0;flex:1 1 60px;min-height:44px}#dailylogMeetings{min-width:0}#dailylogMeetings .actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px}#dailylogMeetingSlot{min-width:0;height:78vh;min-height:560px}#calendarPanel .calendar-event{flex-wrap:wrap}#calendarPanel [data-meeting-event]{min-height:44px}';document.head.append(style);
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

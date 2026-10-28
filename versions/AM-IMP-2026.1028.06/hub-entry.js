window.dailylogCalendarEntry=function(entry){
 const panel=$('#newPanel'),button=$('#create'),form=$('#form'),source=$('#source'),newButton=$('#new');let verified=false,attempt=0;calendarRef='';operationId=crypto.randomUUID();calendarMode(true);
 form.addEventListener('submit',event=>{if(!verified){event.preventDefault();event.stopImmediatePropagation();}},true);
 panel.hidden=false;button.disabled=true;button.textContent='建立會議工作頁（不新增日曆行程）';
 const notice=document.createElement('p');notice.setAttribute('role','status');const retry=document.createElement('button');retry.type='button';retry.textContent='重新核對行程';retry.hidden=true;panel.querySelector('h2').after(notice,retry);
 const originalNew=newButton.onclick;newButton.onclick=function(event){notice.remove();retry.remove();verified=true;originalNew?.call(this,event);};
 const local=value=>{const parsed=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value+'T00:00:00+08:00':value);return Number.isFinite(parsed)?new Date(parsed+8*3600000).toISOString().slice(0,16):'';};
 function fill(event){$('#topic').value=event.topic||'';$('#start').value=local(event.start);$('#end').value=local(event.end);$('#location').value=event.location||'';}
 fill(entry);$('#calendar').checked=false;
 const verify=async()=>{const current=++attempt;verified=false;source.disabled=true;button.disabled=true;newButton.disabled=true;retry.hidden=true;notice.textContent='正在核對原行程與會議來源，完成後即可建立。';try{
  const [calendar]=await Promise.all([api({action:'calendar-week',start:entry.date}),setup(()=>current===attempt)]);if(current!==attempt)return;const event=calendar.items.find(e=>e.id===entry.id);
  if(!event?.calendarRef)throw Error('行程已變更、取消或不在本人的日曆中，請重新讀取。');
  calendarRef=event.calendarRef;fill(event);const personal=(window.dailylogMeetingSources||[]).filter(s=>s.kind==='user');if(personal.length===1)$('#source').value=personal[0].key;
  if(!$('#source').value)throw Error('目前沒有可用的會議來源，請確認本人會議入口。');
  verified=true;source.disabled=false;button.disabled=false;newButton.disabled=false;notice.textContent='已帶入原行程。確認來源後，按下方按鈕建立或開啟會議。';
 }catch(error){if(current!==attempt)return;calendarRef='';notice.textContent=error.message||'行程暫時無法核對，請重試。';retry.hidden=false;}};
 retry.onclick=()=>void verify();void verify();
};

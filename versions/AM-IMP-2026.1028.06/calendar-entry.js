function fileMeeting(button){
 const id=button.dataset.meetingEvent,date=button.dataset.meetingDate;
 const event=typeof calendarState==='object'&&calendarState.events.find(e=>e.id===id);
 if(!event){if(typeof toast==='function')toast('行程已變更，請重新讀取行事曆。');return;}
 const value={id,date,topic:event.summary||'未命名行程',start:event.start?.dateTime||event.start?.date||'',end:event.end?.dateTime||event.end?.date||'',location:event.location||''};
 const path='/meetings/review/hub?quick='+crypto.randomUUID();
 pendingCalendar.set(path,value);open(path);document.getElementById('journal-tab-meetings')?.scrollIntoView({behavior:'smooth',block:'start'});
}

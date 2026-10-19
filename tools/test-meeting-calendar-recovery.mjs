import assert from 'node:assert/strict';
import {readMeetingCalendar} from '../modules/meetings/dailylog-meeting-calendar.mjs';
const originalNow=Date.now;Date.now=()=>Date.parse('2026-10-19T14:30:00Z');
try{
 const paths=[],event={id:'ended-today',summary:'合成今日會議',start:{dateTime:'2026-10-19T13:00:00+08:00'},end:{dateTime:'2026-10-19T14:00:00+08:00'}};
 const deps={resolveAccount:async account=>({id:'fixture',account}),checkUser:async()=>{},connection:async()=>({account:'fixture@example.test'}),calendarFor:async()=> 'primary',google:{request:async(user,q)=>{assert(!q.method,'Calendar browsing must never write');paths.push(q.path);return q.path.includes('?')?{items:[event,{...event,id:'cancelled',status:'cancelled'},{...event,id:'declined',attendees:[{self:true,responseStatus:'declined'}]}]}:event;}}};
 const listing=await readMeetingCalendar({action:'calendar-week',account:'111',start:'2026-10-18T16:00:00Z',end:'2026-10-25T16:00:00Z'},deps);
 assert.deepEqual(listing.items.map(e=>e.id),['ended-today']);
 assert.equal(new URL('https://fixture.test'+paths[0]).searchParams.get('timeMin'),'2026-10-18T16:00:00.000Z');
 const input={action:'calendar-read',account:'111',calendarId:'fixture@example.test',googleAccount:'fixture@example.test',eventId:event.id};
 assert.equal((await readMeetingCalendar(input,deps)).items[0].id,event.id);
 event.status='cancelled';await assert.rejects(()=>readMeetingCalendar(input,deps),e=>e.code==='EVENT_UNAVAILABLE');delete event.status;
 event.end.dateTime='2026-10-18T23:59:59+08:00';await assert.rejects(()=>readMeetingCalendar(input,deps),e=>e.code==='EVENT_UNAVAILABLE');
 await assert.rejects(()=>readMeetingCalendar({...input,googleAccount:'other@example.test'},deps),e=>e.code==='BINDING_CHANGED');
 console.log('Today-ended listing and read, Taiwan midnight, cancelled/declined filtering, original account binding and read-only calls passed.');
}finally{Date.now=originalNow;}

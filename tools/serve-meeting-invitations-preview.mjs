import http from 'node:http';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const port=Number(process.env.MEETING_INVITATIONS_PREVIEW_PORT||8873);f.platform.publicBaseUrl='http://127.0.0.1:'+port;
const id=(await f.pg.query("SELECT id FROM central_archive.meeting_workspaces WHERE receipt->>'externalCalendar'='true'")).rows[0].id;
await f.pg.query("UPDATE central_archive.meeting_plans SET end_at='2026-10-27T03:00:00Z' WHERE workspace_id=$1",[id]);
f.platform.syncMeetingCalendar=async(t,v)=>v.action?{ok:true,calendarId:'fixture-calendar',googleAccount:'fixture@example.test',items:[{id:'instance-one',iCalUID:'synthetic@fixture.test',topic:'Calendar合成會議',start:'2026-10-27T02:00:00Z',end:'2026-10-27T03:00:00Z',allDay:false,location:'合成'}]}:{ok:true,calendarId:'fixture',googleAccount:'guest@fixture.test',eventId:'original-guest',reused:true};
const server=http.createServer(async(req,res)=>{try{const end=res.end.bind(res);res.end=v=>{if(typeof v==='string'&&v.startsWith('<!doctype'))v=v.replace('<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',`<script>window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'host'};</script>`);return end(v);};if(!await f.service.handle(req,res,new URL(req.url,f.platform.publicBaseUrl))){res.statusCode=404;res.end();}}catch{res.statusCode=500;res.end('Synthetic preview unavailable');}});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic external invitation preview: '+f.platform.publicBaseUrl+'/meetings/review/work/'+id));setInterval(()=>f.service.drain().catch(()=>{}),1000).unref();

import http from 'node:http';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
const port=Number(process.env.MEETING_HUB_PREVIEW_PORT||8845);f.platform.publicBaseUrl='http://127.0.0.1:'+port;
const shared=await f.service.store.create(f.key,{source:{type:'group',groupId:'C'+'c'.repeat(32),userId:f.guest},message:{id:'shared-inbox-preview'},timestamp:Date.now()},'fixture.m4a','合成分享者');
await f.pg.query("UPDATE central_archive.meeting_workspaces SET state='published',shared_people=$2::jsonb,fields=jsonb_set(fields,'{settings,topic}',to_jsonb($3::text)) WHERE id=$1",[shared.id,JSON.stringify([{tenantKey:'fixture',account:'111',name:'合成收件人'}]),'合成示例｜分享給我的服務改善會議']);
const calendarSync=f.platform.syncMeetingCalendar;f.platform.syncMeetingCalendar=async(t,v)=>v.action==='calendar-week'?{ok:true,calendarId:'synthetic',googleAccount:'fixture@example.test',items:[]}:calendarSync(t,v);
const server=http.createServer(async(req,res)=>{try{const end=res.end.bind(res);res.end=v=>{if(typeof v==='string'&&v.startsWith('<!doctype'))v=v.replace('<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',`<script>window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'host'};</script>`);return end(v);};if(!await f.service.handle(req,res,new URL(req.url,f.platform.publicBaseUrl))){res.statusCode=404;res.end();}}catch(e){res.statusCode=500;res.end('Synthetic preview unavailable');}});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic hub ready at '+f.platform.publicBaseUrl+'/meetings/review/hub'));setInterval(()=>f.service.drain().catch(()=>{}),1000).unref();

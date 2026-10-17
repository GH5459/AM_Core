// Synthetic-only preview. Never loads production credentials or sends real LINE.
import http from 'node:http';
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');
f.env.AMCORE_PUBLIC_BASE_URL='http://127.0.0.1:8841';f.resetMembership();
const event={...f.event,message:{id:'preview-recording',type:'audio'}};
const r=await f.service.offer(f.row,event,'會議錄音範例.m4a','主持人');
await f.service.choice({source:event.source,postback:{data:'meetingwork:yes:'+r.id}},f.row.key);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8841');const end=res.end.bind(res);
  res.end=value=>{if(typeof value==='string'&&value.startsWith('<!doctype'))value=value.replace('<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',`<script>window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=>new URLSearchParams(location.search).get('as')==='member'?'member':'host'};</script>`);return end(value);};
  if(!await f.service.handle(req,res,url)){res.statusCode=404;res.end('Synthetic preview only');}
 }catch{res.statusCode=500;res.end('Preview unavailable');}
});server.listen(8841,'127.0.0.1',()=>console.log('Synthetic preview: http://127.0.0.1:8841/meetings/review/work/'+r.id));
setInterval(()=>f.service.drain().catch(()=>{}),1000).unref();

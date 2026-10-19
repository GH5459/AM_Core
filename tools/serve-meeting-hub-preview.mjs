import http from 'node:http';
process.env.MEETING_HUB_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-hub.mjs');
f.platform.publicBaseUrl='http://127.0.0.1:8845';
const server=http.createServer(async(req,res)=>{try{const end=res.end.bind(res);res.end=v=>{if(typeof v==='string'&&v.startsWith('<!doctype'))v=v.replace('<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>',`<script>window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'host'};</script>`);return end(v);};if(!await f.service.handle(req,res,new URL(req.url,f.platform.publicBaseUrl))){res.statusCode=404;res.end();}}catch(e){res.statusCode=500;res.end('Synthetic preview unavailable');}});
server.listen(8845,'127.0.0.1',()=>console.log('Synthetic hub ready at http://127.0.0.1:8845/meetings/review/hub'));setInterval(()=>f.service.drain().catch(()=>{}),1000).unref();

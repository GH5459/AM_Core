import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {channel} from 'node:diagnostics_channel';
import {createOutboundTraffic} from '../core/outbound-traffic.js';

test('real HTTP string, multipart and streamed uploads are observed without changing responses or logging secrets',async()=>{
  const received=[];
  const server=http.createServer(async(req,res)=>{let size=0;for await(const b of req)size+=b.length;received.push(size);res.writeHead(req.url.includes('limited')?429:200);res.end('original-response');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const logs=[],monitor=createOutboundTraffic({intervalMs:0,logger:{info:s=>logs.push(s)}});
  try{
    const base='http://127.0.0.1:'+server.address().port;
    assert.equal(await(await fetch(base+'/api/integrations/leaf-snail/tasks/next?secret=private-query',{method:'POST',headers:{Authorization:'Bearer private-key'},body:'private-body中文'})).text(),'original-response');
    const form=new FormData();form.set('file',new Blob(['private-multipart']), 'private-name.txt');
    await(await fetch(base+'/upload/file',{method:'POST',body:form})).text();
    await(await fetch(base+'/limited',{method:'POST',duplex:'half',body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('stream-body'));c.close();}})})).text();
    const report=monitor.snapshot();
    assert.equal(report.totals.requests,3);assert.equal(report.totals.rateLimited,1);
    assert.equal(report.totals.bodyBytes,received.reduce((a,b)=>a+b,0));assert(report.totals.headerBytes>0);
    assert(report.destinations.some(r=>r.feature==='tasks'));assert(report.destinations.some(r=>r.feature==='upload'));
    monitor.flush();assert.equal(monitor.snapshot().destinations.reduce((a,r)=>a+r.requests,0),0);
    assert.equal(monitor.snapshot().totals.requests,3);
    for(const secret of ['private-query','private-key','private-body','private-name','private-multipart'])assert(!logs.join('').includes(secret));
  }finally{monitor.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('failed sends, old-runtime length fallback and bounded destinations remain explicit',()=>{
  const m=createOutboundTraffic({intervalMs:0,maxBuckets:2});
  try{
    for(let i=0;i<10;i++){
      const request={origin:'https://host'+i+'.example',path:'/token?secret=hidden',contentLength:20,body:'hidden'};
      channel('undici:request:create').publish({request});
      if(i===0)channel('undici:request:error').publish({request,error:Error('hidden')});
      else channel('undici:request:bodySent').publish({request});
    }
    const report=m.snapshot();assert.equal(report.totals.bodyBytes,180);assert.equal(report.totals.errors,1);assert(report.destinations.length<=3);
    assert(!JSON.stringify(report).includes('hidden'));
  }finally{m.close();}
});

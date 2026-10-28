const assert=require('node:assert/strict');
exports.patchClient=function(client){
 const marker="panel.querySelector('h2').after(button);";assert.equal(client.split(marker).length,2,'Unexpected meeting client; inspect current source');
 return client.replace(marker,"panel.style.position='relative';panel.querySelector('h2').style.paddingRight='140px';button.style.cssText='position:absolute;top:10px;right:12px';"+marker);
};
exports.patchWorker=function(source){const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);const start=source.lastIndexOf('return new Response(',end);assert(start>route&&source.slice(route,start).includes('status:401'));const client=JSON.parse(source.slice(start+'return new Response('.length,end));return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);};

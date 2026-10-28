const assert=require('node:assert/strict');
const marker='root.append(head,body);';
const addition=`if(target.pathname==='/meetings/review/hub'){
 const header=body.querySelector('header');header?.querySelector('h1')?.remove();
 if(header)header.style.cssText='background:transparent;padding:10px 12px;justify-content:flex-start';
 const add=body.querySelector('#new');if(add)add.textContent='＋ 新增會議';
 const calendar=body.querySelector('#calendarPanel');if(calendar)calendar.hidden=true;
}`;
exports.patchClient=client=>{assert.equal(client.split(marker).length,2,'Unexpected meeting client; inspect latest source');return client.replace(marker,marker+addition);};
exports.patchWorker=source=>{
 const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);
 const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);
 const start=source.lastIndexOf('return new Response(',end);assert(start>route);assert(source.slice(route,start).includes('status:401'));
 const literal=source.slice(start+'return new Response('.length,end),client=JSON.parse(literal);
 return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);
};

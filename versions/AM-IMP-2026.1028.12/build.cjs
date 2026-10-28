const assert=require('node:assert/strict');
exports.patchClient=function(client){
 const row='<div class="actions"><button class="btn" type="button" data-meeting-home>會議清單</button><span>會議與記錄沿用原資料，可隨時切換工作分頁。</span></div>';
 const header="if(header)header.style.cssText='background:transparent;padding:10px 12px;justify-content:flex-start';";
 for(const marker of [row,header])assert.equal(client.split(marker).length,2,'Unexpected current meeting toolbar; inspect latest source');
 return client.replace(row,'').replace(header,`if(header){
  header.style.cssText='background:transparent;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px';
  const status=body.querySelector('#status');if(status){header.prepend(status);status.style.cssText='margin:0;min-width:0;flex:1;overflow-wrap:anywhere';}
  const actions=header.querySelector('.actions');if(actions)actions.style.cssText='display:flex;flex-wrap:nowrap;flex-shrink:0;gap:8px;margin-left:auto';
 }`);
};
exports.patchWorker=function(source){
 const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);
 const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);
 const start=source.lastIndexOf('return new Response(',end);assert(start>route&&source.slice(route,start).includes('status:401'));
 const client=JSON.parse(source.slice(start+'return new Response('.length,end));
 return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);
};

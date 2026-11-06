const assert=require('node:assert/strict');
const {workspaceClient}=require('../../modules/meetings/workspace-client.js');
const {hubWorkspaceClient}=require('../../modules/meetings/hub-ui.js');
const {meetingStartFeedback}=require('../../modules/meetings/workspace-start-feedback.js');
exports.patchClient=function(source){
 // Keep the complete live hub, Calendar entry and navigation integration.
 const helper='window.initializeMeetingHub=',a=source.indexOf(helper),b=source.indexOf(';\nconst meetingDueDate=',a);
 assert(a>=0&&b>a,'Unknown embedded meeting helper boundary');
 source=source.slice(0,a)+helper+hubWorkspaceClient.toString()+source.slice(b);
 const start=source.indexOf('else (function workspaceClient('),end=source.indexOf(')(BOOT);\n};',start);
 assert(start>=0&&end>start,'Unknown embedded workspace boundary');
 source=source.slice(0,start)+'else ('+workspaceClient.toString()+source.slice(end);
 if(!source.includes('const meetingRegenerationControls='))source=source.replace('const meetingDueDate=','const meetingRegenerationControls='+require('../../modules/meetings/workspace-regeneration.js').meetingRegenerationControls.toString()+';\nconst meetingDueDate=');
 if(!source.includes('const meetingStartFeedback='))source=source.replace('const meetingDueDate=','const meetingStartFeedback='+meetingStartFeedback.toString()+';\nconst meetingDueDate=');
 return source;
};
exports.patchWorker=function(source){
 const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')"),end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route),start=source.lastIndexOf('return new Response(',end);
 assert(route>0&&start>route&&end>start&&source.slice(route,start).includes('status:401'),'Unknown live meeting route');
 const client=JSON.parse(source.slice(start+'return new Response('.length,end));
 return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);
};

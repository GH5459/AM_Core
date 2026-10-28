const fs=require('fs'),assert=require('assert/strict');
exports.clientSource=function(){
 const {hubClient,hubWorkspaceClient}=require('../../modules/meetings/hub-ui.js');
 const {workspaceClient}=require('../../modules/meetings/workspace-client.js');
 const {preparationMarkdownScript,renderPreparationMarkdown}=require('../../modules/meetings/preparation-markdown.js');
 const helpers={chooseMeetingPeople:require('../../modules/meetings/organization-picker.js').chooseOrganizationPeople,renderPreparationMarkdown,initializeMeetingHub:hubWorkspaceClient};
 const functions={meetingDueDate:require('../../modules/meetings/workspace-schedule.js').meetingDueDate,parseDecisionRecord:require('../../modules/meetings/decision-record.js').parseDecisionRecord,decisionRecordHtml:require('../../modules/meetings/decision-record.js').decisionRecordHtml,meetingTextChanges:require('../../modules/meetings/workspace-collaboration.js').textChanges,meetingSpeakerTools:require('../../modules/meetings/workspace-speakers.js').meetingSpeakerTools};
 return `const initializeDailylogMeeting=(window,document,location,fetch,setInterval,setTimeout,clearInterval,clearTimeout,BOOT,kind)=>{\nconst globalThis=window;\n${preparationMarkdownScript}\n${Object.entries(helpers).map(([k,f])=>'window.'+k+'='+f.toString()+';').join('\n')}\n${Object.entries(functions).map(([k,f])=>'const '+k+'='+f.toString()+';').join('\n')}\nif(kind==='hub')(${hubClient.toString()})(BOOT);else (${workspaceClient.toString()})(BOOT);\n};\n`+fs.readFileSync(__dirname+'/client.js','utf8');
};
exports.patchWorker=function(source){
 assert(source.includes("from './dailylog-meetings.mjs'"),'Expected current meeting integration');
 const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);
 const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);
 const start=source.lastIndexOf('return new Response(',end);assert(start>route);assert(source.slice(route,start).includes('status:401'));
 return source.slice(0,start)+'return new Response('+JSON.stringify(exports.clientSource())+source.slice(end);
};


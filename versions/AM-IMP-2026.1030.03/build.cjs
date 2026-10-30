const assert=require('node:assert/strict');
const pairs=[
  [
    " function options(selected){return '<option value=\"\">不指定負責人</option>'+memberList.map(p=>'<option value=\"'+esc(p.id)+'\" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+(p.workReady?'':'（待連接工作日誌）')+'</option>').join('')+(selected&&!memberList.some(p=>p.id===selected)?'<option selected value=\"'+esc(selected)+'\">'+esc(data.workspace.ownerNames?.[selected]||'原負責人（待重新確認）')+'</option>':'');}",
    " function options(selected){const people=[...memberList,...(data.taskParticipants||[]).map(p=>({id:'account:'+p.account,name:p.name,workReady:true}))];return '<option value=\"\">不指定負責人</option>'+people.map(p=>'<option value=\"'+esc(p.id)+'\" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+(p.id.startsWith('account:')?'（會議參與者）':p.workReady?'':'（待連接工作日誌）')+'</option>').join('')+(selected&&!people.some(p=>p.id===selected)?'<option selected value=\"'+esc(selected)+'\">'+esc(data.workspace.ownerNames?.[selected]||'原負責人（待重新確認）')+'</option>':'');}\r"
  ],
  [
    "   $('#addTodo').hidden=!editable();$('#addRecordBlock').hidden=!editable();$('#refreshMembers').hidden=!editable();$('#speakerFix').hidden=!editable();$('#replaceSpeaker').hidden=!editable();",
    "   $('#addTodo').hidden=!editable();$('#addRecordBlock').hidden=!editable();$('#refreshMembers').hidden=!editable();$('#chooseTaskParticipants').hidden=!editable()||!data.host;$('#speakerFix').hidden=!editable();$('#replaceSpeaker').hidden=!editable();\r"
  ],
  [
    " $('#refreshMembers').onclick=()=>loadMembers().catch(error);",
    " $('#refreshMembers').onclick=()=>loadMembers().catch(error);\n $('#chooseTaskParticipants').onclick=async()=>{const button=$('#chooseTaskParticipants');button.disabled=true;try{if(!data.host)throw Error('只有主持人可以設定會議任務參與者。');if(dirty.size||settingsDirty||saving.size)throw Error('請先儲存目前修改，再設定參與者。');const j=await api({action:'organization'}),picked=await window.chooseMeetingPeople({organization:j.organization,selected:data.taskParticipants||[],title:'選擇這場會議的任務參與者'});if(!picked)return;const saved=await api({action:'task-participants',accounts:picked.map(p=>p.account),revision:data.workspace.revision});acceptData(saved);$('#membersStatus').textContent='已設定會議任務參與者；尚未連接工作日誌的同仁，任務會保留待派發。';render();}catch(e){error(e);}finally{button.disabled=false;}};\r"
  ]
];
exports.patchClient=function(client){for(const [before,after] of pairs){assert.equal(client.split(before).length,2,'Unexpected meeting client; inspect live source');client=client.replace(before,after);}return client;};
exports.patchWorker=function(source){const route=source.indexOf("if(url.pathname==='/dailylog-meetings-client.js')");assert(route>0);const end=source.indexOf(",{headers:{'Content-Type':'text/javascript; charset=utf-8'",route);assert(end>route);const start=source.lastIndexOf('return new Response(',end);assert(start>route&&source.slice(route,start).includes('status:401'));const client=JSON.parse(source.slice(start+'return new Response('.length,end));return source.slice(0,start)+'return new Response('+JSON.stringify(exports.patchClient(client))+source.slice(end);};

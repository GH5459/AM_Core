import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');
const {service,pg,platform,row,event}=f;f.resetMembership();
const id=(await service.store.create(row.key,event,'fixture.m4a','主持人')).id;
platform.meetingOrganization=async()=>({tenantKey:'fixture',people:[{account:'111',name:'主持人'},{account:'333',name:'參與者'}]});
async function api(input,token='host'){
 let status=200,body='';const req=Readable.from([JSON.stringify(input)]);req.method='POST';req.headers={authorization:'Bearer '+token,origin:platform.publicBaseUrl};
 const res={headersSent:false,setHeader(){},writeHead(s){status=s;},set statusCode(s){status=s;},get statusCode(){return status;},end(s){body=s;}};
 await service.handle(req,res,new URL(platform.publicBaseUrl+'/meetings/review/work/'+id+'/api'));return {status,value:JSON.parse(body)};
}
try{
 let r=await service.store.get(id);await pg.query("UPDATE central_archive.meeting_workspaces SET state='review' WHERE id=$1",[id]);r=await service.store.get(id);
 assert.equal((await api({action:'task-participants',accounts:['333'],revision:Number(r.revision)},'member')).status,403,'Only host manages roster');
 assert.equal((await api({action:'task-participants',accounts:['999'],revision:Number(r.revision)})).status,409,'Unknown organization account rejected');
 let result=await api({action:'task-participants',accounts:['333'],revision:Number(r.revision)});assert.equal(result.status,200);assert.equal(result.value.taskParticipants[0].name,'參與者');
 const todo=Object.keys(result.value.workspace.fields).find(k=>k.startsWith('todo:')),value=result.value.workspace.fields[todo];
 result=await api({action:'save-part',field:todo,version:result.value.editing.versions[todo],value:{...value,ownerId:'account:333',due:'2026-11-05'}});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.value.workspace.ownerNames['account:333'],'參與者');
 assert.equal((await api({action:'task-participants',accounts:[],revision:result.value.workspace.revision})).status,409,'Cannot remove an assigned participant');
 const other=await api({action:'save-part',field:todo,version:result.value.editing.versions[todo],value:{...value,ownerId:'account:999',due:'2026-11-05'}});assert.equal(other.status,409,'Unselected account cannot be assigned');
 console.log('Confirmed participant assignment: host-only roster, active organization, pending identity and safe removal checks passed.');
}finally{await pg.close();delete process.env.MEETING_WORKSPACE_PREVIEW;}

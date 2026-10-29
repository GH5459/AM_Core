import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createXiaoyeSecretary} from '../core/xiaoye-secretary.js';
const bot='U'+'a'.repeat(32),other='U'+'c'.repeat(32),user='U'+'b'.repeat(32);
async function run({configured=bot,actual=bot,expected=bot,account='employee',recipientAccount='employee',recipientUser=user,haveLookup=true}={}){
 const calls=[],sent=[],receipt=[];let count=0;
 const notification={id:'fixture',kind:'question',lease:'fixture',account,expectedUserId:user,context:{findingQuestion:true,botUserId:expected},lineMessage:{type:'flex'}};
 const tasks={secretaryCall:async(route,v)=>{calls.push(route);if(route==='sessions')return {sessions:[],ownerSessions:[]};if(route==='notifications/claim')return {notification:count++===0?notification:null};if(route==='notifications/validate')return {notification};if(route==='notifications/defer'){receipt.push(v);return {ok:true};}if(route==='notifications/receipt'){receipt.push(v);return {ok:true};}throw Error(route);},groupServices:async()=>[{key:'fixture'}],meetingShareRecipient:async()=>({account:recipientAccount,userId:recipientUser})};
 const line={pushLineMessage:async(...v)=>{sent.push(v);return {requestId:'fixture'};}};if(haveLookup)line.lineGet=async()=>({userId:actual});
 const secretary=createXiaoyeSecretary({tasks,line,env:{AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:configured},logger:{warn(){}}});await secretary.drain();return {sent,receipt,calls};
}
test('finding notification verifies the original bot against its actual LINE token and exact recipient',async()=>{
 const ok=await run();assert.equal(ok.sent.length,1);assert.equal(ok.receipt[0].state,'sent');assert.equal(ok.sent[0][0],user);
 for(const c of [{configured:null},{configured:other},{actual:other},{actual:null},{expected:other},{recipientAccount:'other-employee'},{recipientUser:'U'+'d'.repeat(32)},{haveLookup:false}]){const v=await run(c);assert.equal(v.sent.length,0,JSON.stringify(c));assert.notEqual(v.receipt[0].state,'sent');}
});

import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createArchiveStore} from '../../core/central-archive/store.js';
import {createGroupStore} from '../../core/leaf-groups-store.js';
import {createLeafGroups} from '../../core/leaf-groups.js';
export const U=n=>'U'+String(n).repeat(32),C=n=>'C'+String(n).repeat(32),bot=U(0),owner=U(1),a=U(2),b=U(3),group=C(4);
let serial=0;
export async function fixture(){
 const db=new PGlite();await db.exec(await fs.readFile(new URL('../../core/central-archive/schema.sql',import.meta.url),'utf8'));
 let clock=Date.parse('2026-10-13T04:00:00Z');const now=()=>clock;
 const query=(...args)=>db.query(...args),pool={query,connect:async()=>({query,release(){}})},env={LINE_CHANNEL_SECRET:'synthetic',AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:bot};
 const archive=createArchiveStore(pool,bot),store=createGroupStore({env,pool,now});
 const tenant={key:'fixture',tenantId:'fixture-id'},identities=new Map([[owner,{account:'owner',bindingId:'owner-binding'}],[a,{account:'a',bindingId:'a-binding'}],[b,{account:'b',bindingId:'b-binding'}]]);
 const names=new Map([[owner,'發起人'],[a,'同仁甲'],[b,'同仁乙']]),pushes=[],submissions=[],selfSubmissions=[],attempts=[],writes=new Map(),disconnected=new Set();let uncertain=false,failSummary=false;
 const line={lineGet:async path=>{const id=path.split('/').at(-1);if(!names.has(id))throw Error('not_member');return {userId:id,displayName:names.get(id)};}};
 const llm={available:true,completeJson:async input=>{const data=JSON.parse(input.userContent);if(input.schema.properties.executionDate&&!input.schema.properties.action)return {title:'整理清單',description:'整理清單',executionDate:data.text.includes('明天')?'2026-10-14':data.existing?.executionDate||'',missing:[]};if(input.schema.properties.kind)return {kind:data.text.includes('會議')?'meeting':data.text.includes('整理清單')?'task':'none'};
   return {events:[{topic:'專案會議',date:'2026-10-14',time:data.text.includes('時間未定')?'':'15:00',location:'漫漫回嘉附近的咖啡廳',content:'討論進度',...(data.existing||{}),...(data.existing?{time:'16:00',needsClarification:[]}:{} )}]};}};
 const updates=[],progress=[];const tasks={resolveTaskGroupIdentity:async id=>identities.get(id)||null,submitSelfTask:async(t,e,p,d,c,r)=>{selfSubmissions.push({t,e,p,d,c,r});return {taskIds:['work-fixture'],link:'https://fixture.test/?task=work-fixture',message:{type:'text',text:'已建立自己的任務'}};},groupServices:async()=>[tenant],resolveGroupIdentity:async id=>identities.get(id)||null,submitGroupTask:async(t,e,p,judgment)=>{submissions.push({t,e,p,judgment});return {ok:true};},submitDirectGroupTask:async(t,e,p,d,r)=>{submissions.push({t,e,p,d,r});return {taskIds:['work-fixture'],link:'https://fixture.test/?task=work-fixture'};},recordQuotedProgress:async(t,e)=>{progress.push({t,e});return {ok:true,recorded:true};},readDirectTask:async()=>({version:1,title:'盤點用品',description:'共同盤點三樓用品'}),updateDirectTask:async(t,e,id,change,expectedVersion)=>{updates.push({t,e,id,change,expectedVersion});return {title:'盤點用品',startDate:change.executionDate||'2026-10-14',dueDate:change.dueDate||'2026-10-16'};}};
 const calendar={writeGroupEvent:async(t,account,event)=>{attempts.push({t,account,event});if(disconnected.has(account))throw Object.assign(Error('connect'),{code:'GOOGLE_NOT_CONNECTED'});
   if(!writes.has(event.requestId))writes.set(event.requestId,{id:'saved-'+writes.size});if(uncertain){uncertain=false;throw Object.assign(Error('timeout'),{code:'NETWORK_UNCERTAIN'});}return writes.get(event.requestId);}};
 const platform={llmForTenant:()=>llm,pushLineMessage:async(to,message,_,options)=>{if(failSummary&&typeof message==='string'&&message.startsWith('活動：')){failSummary=false;throw Error('delivery');}pushes.push({to,message,options});return {messageIds:Array.from({length:1+(options.additionalMessages?.length||0)},(_,i)=>String(10000000000000000n+BigInt(pushes.length*10+i)))};}};
 const options={env,store,now,line,tasks,calendar,platform,llm,logger:{warn(){}}};let service=createLeafGroups(options);
 const message=(text='@甲 @乙 會議 明天15:00',mentions=[a,b],sender=owner,g=group)=>({type:'message',webhookEventId:'event-'+(++serial),timestamp:clock,source:{type:'group',groupId:g,userId:sender},message:{id:'message-'+serial,type:'text',text,mention:{mentionees:mentions.map((userId,i)=>{const m=[...text.matchAll(/@[^\s：:]+/gu)][i];return {type:'user',userId,...(m?{index:m.index,length:m[0].length}:{}),...(userId===bot?{isSelf:true}:{})};})}}});
 const button=(id,revision=1,sender=owner,g=group,action='confirm')=>({type:'postback',webhookEventId:'button-'+(++serial),timestamp:clock,source:{type:'group',groupId:g,userId:sender},postback:{data:`groupcal:${action}:${id}:${revision}`}});
 const capture=async e=>{await archive.capture([e]);return service.capture([e]);};
 // Seed an already archived pre-upgrade dispatch to verify compatibility, never new-input capture.
 const historical=async(e=message(),input={quickKind:'meeting'})=>{await archive.capture([e]);await store.insert(e,'message',input);return e;};
 const rows=async()=> (await db.query("SELECT payload->'groupDispatch' AS p FROM central_archive.jobs WHERE payload ? 'groupDispatch' ORDER BY event_at,key")).rows.map(r=>r.p);
 return {db,store,archive,options,identities,names,pushes,submissions,selfSubmissions,updates,progress,attempts,writes,disconnected,message,button,capture,historical,rows,drain:()=>service.drain(),advance:(ms=61000)=>clock+=ms,restart:()=>service=createLeafGroups(options),uncertain:()=>uncertain=true,failSummary:()=>failSummary=true,close:()=>db.close()};
}

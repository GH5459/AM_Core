import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {readTaskOrigins,TASK_ORIGINS_CONTRACT} from '../modules/meetings/task-origins.js';
import {createConversationMeetings} from '../modules/meetings/conversation-service.js';
import {managementSignature} from '../modules/meetings/management-auth.js';

const pg=new PGlite();
try {
  for(const file of ['core/central-archive/schema.sql','modules/meetings/conversations.sql','modules/meetings/workspace.sql'])
    await pg.exec(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const statements=[],pool={query:(...args)=>{statements.push(args[0]);return pg.query(...args);}};
  const botId='U'+'1'.repeat(32),foreign='U'+'2'.repeat(32),group='C'+'3'.repeat(32),otherGroup='C'+'4'.repeat(32);
  const meeting='a'.repeat(64),draft='b'.repeat(64),outside='c'.repeat(64);
  for(const [key,bot,sourceId,label] of [['own',botId,group,'營運群組'],['other',foreign,otherGroup,'另一個服務']])
    await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id,display_name) VALUES($1,$2,\'group\',$3,$4)',[key,bot,sourceId,label]);
  for(const [id,key,state,topic] of [[meeting,'own','published','十月工作週會'],[draft,'own','review','未發布主題'],[outside,'other','published','別人的會議']])
    await pg.query('INSERT INTO central_archive.meeting_workspaces(id,conversation_key,message_id,host_id,host_name,source,filename,state,fields) VALUES($1,$2,$1,\'host\',\'示例主持人\',\'{}\',\'audio.m4a\',$3,$4)',[id,key,state,JSON.stringify({settings:{topic,date:'2026-10-19'},record:'不得傳出的會議正文',transcript:'私人逐字稿'})]);
  const input={contract:TASK_ORIGINS_CONTRACT,meetingIds:[meeting,draft,outside],groupIds:[group,otherGroup]};
  const result=await readTaskOrigins(input,{pool,botId});
  assert.deepEqual(result,{contract:TASK_ORIGINS_CONTRACT,meetings:[{id:meeting,title:'十月工作週會',date:'2026-10-19',groupName:'營運群組'}],groups:[{id:group,name:'營運群組'}]});
  assert(statements.every(sql=>/^SELECT/.test(sql.trim())));
  assert(!JSON.stringify(result).includes('私人'));assert(!JSON.stringify(result).includes('未發布'));
  for(const change of [{meetingIds:[meeting,meeting]},{groupIds:['invalid']},{extra:true},{meetingIds:Array.from({length:81},(_,i)=>i.toString(16).padStart(64,'0'))}])
    await assert.rejects(()=>readTaskOrigins({...input,...change},{pool,botId}),{status:400});
  const secret='synthetic-source-integration-secret-for-tests';
  const service=createConversationMeetings({env:{AMCORE_CONVERSATION_MEETINGS_ENABLED:'1',AMCORE_MEETINGS_PARENT_PAGE_ID:'a'.repeat(32),AMCORE_MEETING_MANAGEMENT_SECRET:secret},
    archive:{pool,config:{botId},notion:{request(){throw Error('must not call Notion');}}},platform:{},router:{},tenants:[],meetingModule:{}});
  const path='/integrations/meeting-management/task-origins';
  const invoke=async({valid=true,method='POST',age=0,body=JSON.stringify(input)}={})=>{
    const timestamp=String(Date.now()+age),actor='140901';
    const req=Readable.from([body]);Object.assign(req,{method,url:path,headers:{'x-meeting-time':timestamp,'x-meeting-actor':actor,
      'x-meeting-signature':valid?managementSignature(secret,{method,path,timestamp,actor,body}):'0'.repeat(64)}});
    const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
    assert.equal(await service.handle(req,res,new URL('https://example.test'+path)),true);return res;
  };
  assert.equal((await invoke()).status,200);
  const count=statements.length;
  assert.equal((await invoke({valid:false})).status,401);
  assert.equal((await invoke({age:-120000})).status,401);
  assert.equal(statements.length,count,'invalid or stale signatures do not read source metadata');
  assert.equal((await invoke({body:JSON.stringify({...input,extra:true})})).status,400);
  assert.equal((await invoke({method:'GET',body:''})).status,404);
  console.log('PASS task origins: PostgreSQL bot isolation, published sources only, exact selected names, no content/write, bounded batches, signed route/replay window.');
} finally {await pg.close();}

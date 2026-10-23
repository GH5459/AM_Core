const path=require('node:path'),{Readable}=require('node:stream');
const base=require(path.join(process.env.DAILYLOG_XIAOYE_PACKAGE,'event-fixture.cjs'));
const secret='fixture-only-evidence-secret-at-least-32',key='fixture-xiaoye-existing-service-key-0001';
module.exports.fixture=async options=>{
 let mf,handler;
 const meetingId='a'.repeat(64),user='U'+'b'.repeat(32),todo='todo:11111111-1111-4111-8111-111111111111';
 const state={checks:0,reads:0,denyReader:false,revokeOnFinalCheck:false};
 const outboundService=async request=>{
  const url=new URL(request.url);if(url.hostname!=='am.hozorental.com'||url.pathname!=='/integrations/xiaoye-case-evidence')return new Response(null,{status:503});
  if(!handler){const {createMeetingCaseEvidence}=await import('../modules/meetings/case-evidence.js');
   const row={id:meetingId,state:'published',revision:1,host_id:user,fields:{settings:{date:'2026-10-13'},[todo]:{content:'隔離日期查核',ownerId:user,due:'2026-10-20'}},receipt:{}};
   handler=createMeetingCaseEvidence({env:{AMCORE_MEETING_MANAGEMENT_SECRET:secret},store:{get:async id=>{state.reads++;return id===meetingId?row:null;}},pool:{query:async(sql,args)=>{if(!sql.startsWith('SELECT')||args[0]!==meetingId)throw Error('Unexpected DB operation');return {rows:[{applied_fields:{},error_code:'',result:{},payload:{id:meetingId,revision:1,deliverySequence:1,date:'2026-10-13',url:'https://am.hozorental.com/meetings/review/work/'+meetingId,source:{filename:'isolated.mp3'},host:{account:'900003',userId:user,bindingId:'fixture-identity',tenantKey:'fixture',name:'隔離同仁'},tasks:[{id:todo,content:'隔離日期查核',due:'2026-10-20',evidence:'隔離資料',owner:{account:'900003',userId:user,bindingId:'fixture-identity',tenantKey:'fixture',name:'隔離同仁'}}],removed:[],knownTaskIds:[]}}]};}},platform:{secretaryEvidenceCheck:async input=>{state.checks++;if(state.revokeOnFinalCheck&&state.checks%2===0)throw Object.assign(Error('revoked'),{status:403});const response=await mf.dispatchFetch('http://example.test/api/integrations/leaf-snail/tasks/secretary/evidence-check',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw Object.assign(Error('Original case refused'),{status:response.status});return response.json();},meetingTaskIdentity:async()=>({name:'隔離同仁'})},conversation:async()=>({enabled:true,connection_state:'active'}),assertRead:async(r,c,id)=>{if(state.denyReader||id!==user)throw Error('Not a reader');}});
  }
  const text=await request.text(),req=Readable.from([Buffer.from(text)]);req.method=request.method;req.headers=Object.fromEntries(request.headers);
  let output,status=200;const res={setHeader(){},set statusCode(value){status=value;},get statusCode(){return status;},end(value){output=value;}};
  await handler(req,res,url);return new Response(output,{status,headers:{'Content-Type':'application/json'}});
 };
 const a=await base.fixture({...options,extraBindings:{...options.extraBindings,AMCORE_MEETING_MANAGEMENT_SECRET:secret,AMCORE_MEETING_MANAGEMENT_ORIGIN:'https://am.hozorental.com'},outboundService});mf=a.mf;return {...a,evidenceState:state};
};

const fs=require('node:fs'),path=require('node:path');
const EVENT_ID=/^[a-f0-9]{64}$/;
const TASK_ID=/^work-[a-f0-9-]{36}$/;
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};

// A bounded, local candidate list. The server still decides whether each
// exact failed event is current and eligible; no historical event is replayed.
function failedEventCandidatePage(folder,{limit=32,offset=0}={}){
  const root=path.join(folder,'event-runs');
  if(!fs.existsSync(root))return {candidates:[],nextOffset:0,more:false};
  const dirs=fs.readdirSync(root,{withFileTypes:true})
    .filter(x=>x.isDirectory()&&EVENT_ID.test(x.name))
    // Acquisition files do not change while a blocked case is polled. Sorting
    // by the run directory mtime made repeated scans permanently starve old
    // cases because writing a status refreshed that directory's timestamp.
    .map(x=>{const run=path.join(root,x.name),p=path.join(run,'acquire.response.private.json');return {id:x.name,mtime:fs.existsSync(p)?fs.statSync(p).mtimeMs:fs.statSync(run).mtimeMs};})
    .sort((a,b)=>b.mtime-a.mtime||a.id.localeCompare(b.id));
  const start=Number.isSafeInteger(offset)&&offset>=0&&offset<dirs.length?offset:0;
  const byTask=new Map();
  for(const dir of dirs.slice(start,start+limit)){
    const run=path.join(root,dir.id),acquired=read(path.join(run,'acquire.response.private.json'))?.job;
    const completed=read(path.join(run,'completion.private.json'));
    const failedPreflight=read(path.join(run,'tools-failed.input.private.json'));
    const failureIntent=read(path.join(run,'failure.input.private.json'));
    const finalizationIntent=read(path.join(run,'event-fail.input.private.json'))||read(path.join(run,'event-complete.input.private.json'));
    // Intent is only a candidate, never evidence of successful finalization.
    // The service must independently report the exact event as failed.
    const exceptionIntent=failureIntent?.id===acquired?.id&&failureIntent?.lease===acquired?.lease&&typeof failureIntent?.operationId==='string'&&failureIntent.operationId.length>=8;
    const uncertainFinalization=finalizationIntent?.id===acquired?.id&&finalizationIntent?.lease===acquired?.lease&&typeof finalizationIntent?.operationId==='string'&&finalizationIntent.operationId.length>=8;
    const completedExecution=completed?.state==='done'&&acquired?.kind==='execute';
    const responsePath=path.join(run,'auto-resume.response.private.json');
    const response=read(responsePath);
    // Older receivers incorrectly marked a current, blocked completed
    // execution as case-changed when its retry budget was exhausted. Recheck
    // that legacy marker against the server once; do not discard real replies.
    const legacySkip=response?.skipped===true&&['case-changed','confirmed-deploy-failed'].includes(response.reason);
    if((completed?.state!=='failed'&&!failedPreflight&&!completedExecution&&!exceptionIntent&&!uncertainFinalization)||acquired?.id!==dir.id||!TASK_ID.test(acquired.taskId||'')||
       !Number.isSafeInteger(acquired.sourceVersion)||!acquired.lease||
       fs.existsSync(responsePath)&&!legacySkip)continue;
    if(!byTask.has(acquired.taskId))byTask.set(acquired.taskId,{id:dir.id,taskId:acquired.taskId,
      sourceVersion:acquired.sourceVersion,lease:acquired.lease});
  }
  return {candidates:[...byTask.values()],nextOffset:start+limit<dirs.length?start+limit:0,more:start+limit<dirs.length};
}
function failedEventCandidates(folder,options){return failedEventCandidatePage(folder,options).candidates;}
module.exports={failedEventCandidates,failedEventCandidatePage};

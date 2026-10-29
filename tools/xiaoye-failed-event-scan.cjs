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
    const completedExecution=completed?.state==='done'&&acquired?.kind==='execute';
    const responsePath=path.join(run,'auto-resume.response.private.json');
    const response=read(responsePath);
    // Older receivers incorrectly marked a current, blocked completed
    // execution as case-changed when its retry budget was exhausted. Recheck
    // that legacy marker against the server once; do not discard real replies.
    const legacySkip=response?.skipped===true&&['case-changed','confirmed-deploy-failed'].includes(response.reason);
    if((completed?.state!=='failed'&&!failedPreflight&&!completedExecution)||acquired?.id!==dir.id||!TASK_ID.test(acquired.taskId||'')||
       !Number.isSafeInteger(acquired.sourceVersion)||!acquired.lease||
       fs.existsSync(responsePath)&&!legacySkip)continue;
    if(!byTask.has(acquired.taskId))byTask.set(acquired.taskId,{id:dir.id,taskId:acquired.taskId,
      sourceVersion:acquired.sourceVersion,lease:acquired.lease});
  }
  return {candidates:[...byTask.values()],nextOffset:start+limit<dirs.length?start+limit:0,more:start+limit<dirs.length};
}
function failedEventCandidates(folder,options){return failedEventCandidatePage(folder,options).candidates;}
module.exports={failedEventCandidates,failedEventCandidatePage};

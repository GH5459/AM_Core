const fs=require('node:fs'),path=require('node:path');
const EVENT_ID=/^[a-f0-9]{64}$/;
const TASK_ID=/^work-[a-f0-9-]{36}$/;
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};

// A bounded, local candidate list. The server still decides whether each
// exact failed event is current and eligible; no historical event is replayed.
function failedEventCandidates(folder,{limit=32}={}){
  const root=path.join(folder,'event-runs');
  if(!fs.existsSync(root))return [];
  const dirs=fs.readdirSync(root,{withFileTypes:true})
    .filter(x=>x.isDirectory()&&EVENT_ID.test(x.name))
    .map(x=>({id:x.name,mtime:fs.statSync(path.join(root,x.name)).mtimeMs}))
    .sort((a,b)=>b.mtime-a.mtime).slice(0,limit);
  const byTask=new Map();
  for(const dir of dirs){
    const run=path.join(root,dir.id),acquired=read(path.join(run,'acquire.response.private.json'))?.job;
    const completed=read(path.join(run,'completion.private.json'));
    const failedPreflight=read(path.join(run,'tools-failed.input.private.json'));
    if((completed?.state!=='failed'&&!failedPreflight)||acquired?.id!==dir.id||!TASK_ID.test(acquired.taskId||'')||
       !Number.isSafeInteger(acquired.sourceVersion)||!acquired.lease||
       fs.existsSync(path.join(run,'auto-resume.response.private.json')))continue;
    if(!byTask.has(acquired.taskId))byTask.set(acquired.taskId,{id:dir.id,taskId:acquired.taskId,
      sourceVersion:acquired.sourceVersion,lease:acquired.lease});
  }
  return [...byTask.values()];
}
module.exports={failedEventCandidates};

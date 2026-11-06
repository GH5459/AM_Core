import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('Source anchor changed: '+before.slice(0,100));return source.replace(before,after);};
export async function patch(input,output){
 let worker=await fs.readFile(path.join(input,'worker.mjs'),'utf8');
 worker="import {shouldMeasureUofRead,isMeasuredUofRead,measuredUofRead,readStage,UOF_READ_STAGES_POLICY} from './uof-read-timing.mjs';\n"+worker;
 worker=once(worker,'  async fetch(request) {\n    try {\n      const onboarding=','  async fetch(request) {\n    if(shouldMeasureUofRead(this,request))return measuredUofRead(this,request);\n    try {\n      const onboarding=');
 worker=once(worker,'const firstUse=await firstUseUofGate(this,request,firstUseStatus);','const firstUse=await readStage(this,"uof_first_use",()=>firstUseUofGate(this,request,firstUseStatus));');
 worker=once(worker,'    for (let offset = 0; offset < comments.length; offset += 40) {','    const parallel=isMeasuredUofRead(this);\n    const commentRead=(async()=>{\n    for (let offset = 0; offset < comments.length; offset += 40) {');
 worker=once(worker,'    const details = planned.filter((entry) => entry.fields.has("content") && typeof entry.snapshot.currentDoc !== "string");','    })();\n    if(!parallel)await commentRead;\n    const documentRead=(async()=>{\n    const details = planned.filter((entry) => entry.fields.has("content") && typeof entry.snapshot.currentDoc !== "string");');
 worker=once(worker,'    return displayItems(this,account,values);','    })();\n    // At most two independent read sequences. Keep each original batch limit,\n    // validation and failure; do not retry or return a partial successful list.\n    const reads=await Promise.allSettled([commentRead,documentRead]);\n    for(const result of reads)if(result.status==="rejected")throw result.reason;\n    return readStage(this,"uof_display",()=>displayItems(this,account,values));');
 worker=once(worker,'uofReadSpeedPolicy:UOF_READ_SPEED_POLICY,','uofReadStagesPolicy:UOF_READ_STAGES_POLICY,uofReadSpeedPolicy:UOF_READ_SPEED_POLICY,');
 await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'worker.mjs'),worker);await fs.copyFile(path.join(here,'uof-read-timing.mjs'),path.join(output,'uof-read-timing.mjs'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: patch.mjs INPUT_MODULES OUTPUT_MODULES');await patch(input,output);console.log('Patched request-scoped timings and independent read sequences');}

// Synthetic payload burst only: no credentials, live files or network calls.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {createLlm}=await import(pathToFileURL(path.resolve(process.argv[2]||'core/llm.js')));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'am-memory-'));const image=path.join(dir,'fixture.jpg');fs.writeFileSync(image,Buffer.alloc(8*1024*1024,42));
let active=0,peakActive=0,peakRss=process.memoryUsage().rss;
globalThis.fetch=async(url,opts)=>{active++;peakActive=Math.max(peakActive,active);peakRss=Math.max(peakRss,process.memoryUsage().rss);await new Promise(r=>setTimeout(r,50));if(!opts.body.includes('inline_data'))throw Error('missing image');active--;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'ok'}]}}]}));};
try {await Promise.all(Array.from({length:24},()=>createLlm({env:{GEMINI_API_KEY:'fixture'},logger:{log(){},warn(){}}}).completeText({userContent:'fixture',imagePaths:[image]})));console.log(JSON.stringify({peakConcurrent:peakActive,peakRssMiB:Math.round(peakRss/1024/1024),completed:24}));}finally{fs.rmSync(dir,{recursive:true});}


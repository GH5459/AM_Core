import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
function once(source,before,after){if(source.split(before).length!==2)throw Error('Source anchor changed: '+before.slice(0,120));return source.replace(before,after);}
export async function patchDailylog(input,output){
 await fs.mkdir(output,{recursive:true});
 let worker=await fs.readFile(path.join(input,'worker.mjs'),'utf8');
 worker="import {attachmentDownload} from './attachment-download.mjs';\n"+worker;
 const downloadAnchor='    const bytes2 = await store.bytes(id, file.size);';
 if(worker.split(downloadAnchor).length!==3)throw Error('Expected both original attachment handlers');
 for(let n=0;n<2;n++){const begin=worker.indexOf(downloadAnchor),end=worker.indexOf('\n  } catch (error)',begin);if(begin<0||end<0)throw Error('Download response anchor changed');worker=worker.slice(0,begin)+`    return attachmentDownload(request,env.DB,file,async()=>{
      await targetRead();
      const last=await env.DB.prepare("SELECT removed_at,digest,scope,target_id FROM task_attachments WHERE id=?").bind(file.id).first();
      if(!last||last.removed_at||last.digest!==file.digest||last.scope!==file.scope||last.target_id!==file.target_id)throw Object.assign(Error('附件已更新，請重新讀取。'),{status:409});
    });`+worker.slice(end);}
 // The optimized normal-task read route precedes the legacy attachment routes.
 const readStart=worker.indexOf('async function taskReadSpeedFetch('),readEnd=worker.indexOf('\n__name(taskReadSpeedFetch',readStart);if(readStart<0||readEnd<0)throw Error('Normal read handler missing');
 let read=worker.slice(readStart,readEnd),verifyStart=read.indexOf('    await auth2.verify();',read.indexOf('    const dataAt = performance.now();')),verifyEnd=read.indexOf('    const timing = ',verifyStart);
 const verification=read.slice(verifyStart,verifyEnd);if(!verification.includes('await assertSharingVersions')||!verification.includes('if (old)'))throw Error('Read authority anchor changed');
 const binaryStart=read.indexOf('    if (binary) {',verifyEnd),binaryEnd=read.indexOf('\n    return json5(result',binaryStart),binaryBlock=read.slice(binaryStart,binaryEnd);
 const lastStart=binaryBlock.indexOf('      const last = '),lastEnd=binaryBlock.indexOf('      return new Response(binary,',lastStart),lastCheck=binaryBlock.slice(lastStart,lastEnd);if(lastStart<0||lastEnd<0||!lastCheck.includes('last.digest'))throw Error('File verification anchor changed');
 read=once(read,'      binary = await createAttachmentStore(db).bytes(fileRecord.id, fileRecord.size);','      binary = await attachmentDownload(request,db,fileRecord,async()=>{\n'+verification+lastCheck+'      });');
 read=once(read,'    const dataAt = performance.now();\n'+verification,'    const dataAt = performance.now();\n    if(!binary){\n'+verification+'    }\n');
 read=once(read,binaryBlock,'    if(binary){binary.headers.set("Server-Timing",`auth;dur=${(authAt-started).toFixed(1)},attachment;dur=${(dataAt-authAt).toFixed(1)}`);binary.headers.set("X-DailyLog-Read-Path","normal-task-v1");return binary;}');
 worker=worker.slice(0,readStart)+read+worker.slice(readEnd);
 await fs.writeFile(path.join(output,'worker.mjs'),worker);
 await fs.copyFile(path.join(here,'attachment-download.mjs'),path.join(output,'attachment-download.mjs'));
 let preview="import {fixedBody} from './attachment-download.mjs';\n"+await fs.readFile(path.join(input,'task-image-preview.mjs'),'utf8');
 preview=once(preview,'const original=await base.fetch(new Request(url,request),env,ctx);',"const originalRequest=new Request(url,request);originalRequest.headers.delete('Range');originalRequest.headers.delete('If-Range');const original=await base.fetch(originalRequest,env,ctx);");
 preview=once(preview,' const bytes=new Uint8Array(await original.arrayBuffer()),mime=rasterType(bytes);',` const reader=original.body?.getReader();if(!reader)throw Error('Image response body missing');
 const prefix=[];let prefixLength=0;
 while(prefixLength<12){const part=await reader.read();if(part.done)break;prefix.push(part.value);prefixLength+=part.value.byteLength;}
 const sniff=new Uint8Array(Math.min(12,prefixLength));let copied=0;for(const bytes of prefix){const n=Math.min(bytes.length,sniff.length-copied);if(n>0){sniff.set(bytes.subarray(0,n),copied);copied+=n;}}
 const mime=rasterType(sniff);if(!mime)await reader.cancel();`);
 preview=once(preview,'return new Response(bytes,{status:200,headers});',`const stream=new ReadableStream({async pull(controller){if(prefix.length){controller.enqueue(prefix.shift());return;}try{const next=await reader.read();if(next.done)controller.close();else controller.enqueue(next.value);}catch(error){controller.error(error);}},cancel(reason){return reader.cancel(reason);}});const size=Number(headers.get('Content-Length'));return new Response(headers.has('Content-Length')&&Number.isSafeInteger(size)&&size>=0?fixedBody(stream,size):stream,{status:200,headers});`);
 await fs.writeFile(path.join(output,'task-image-preview.mjs'),preview);
}
export async function patchUof(input,output){
 await fs.mkdir(output,{recursive:true});let source=await fs.readFile(path.join(input,'worker.mjs'),'utf8');
 source="import {displayItems,displayApproval,UOF_READ_SPEED_POLICY} from './uof-read-speed.mjs';\n"+source;
 source=once(source,'const settings=await app.classification(account),snapshots=await app.snapshot(account),byId=', 'const [settings,snapshots]=await Promise.all([app.classification(account),app.snapshot(account)]),byId=');
 source=once(source,'  async item(snapshot, history = false, attachments = false) {','  async item(snapshot, history = false, attachments = false, displayContext = null) {');
 source=once(source,'item.approvalEnabled = await this.canApprove(snapshot.account, snapshot);','item.approvalEnabled = await displayApproval(this,snapshot,displayContext);');
 source=once(source,'    const items = [];\n    for (const snapshot of values) items.push(await this.item(snapshot));\n    return items;','    return displayItems(this,account,values);');
 source=once(source,'    await this.snapshot(identity.account, ticket.taskId);',`    const pending = await this.reviews.pendingSummary(identity.account, ticket.taskId);
    if(pending.length!==1||pending[0].account!==identity.account||pending[0].taskId!==ticket.taskId)throw new AppError('CASE_NO_LONGER_PENDING',409,'此案件已不在本人待簽清單，請重新整理。');`);
 source=once(source,'uofAuthSpeedPolicy:"parallel-login-local-logout-v1"','uofReadSpeedPolicy:UOF_READ_SPEED_POLICY,uofAuthSpeedPolicy:"parallel-login-local-logout-v1"');
 await fs.writeFile(path.join(output,'worker.mjs'),source);await fs.copyFile(path.join(here,'uof-read-speed.mjs'),path.join(output,'uof-read-speed.mjs'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [kind,input,output]=process.argv.slice(2);if(!input||!output||!['dailylog','uof'].includes(kind))throw Error('Usage: patch.mjs dailylog|uof INPUT_MODULES OUTPUT_MODULES');
 await (kind==='dailylog'?patchDailylog:patchUof)(input,output);console.log(JSON.stringify({kind,input,output,patched:true}));
}

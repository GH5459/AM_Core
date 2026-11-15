import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Gemini Files accepts 2 GB per file. Bound even transfers with missing or
// untrustworthy source length; no whole recording is buffered in Node.
const MAX_BYTES = 2_000_000_000;
const START_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

export async function providerResponse(response, label) {
  if (response.ok) return response;
  const retry = response.headers?.get('retry-after');
  const retryAfterMs = !retry ? 0 : /^\d+(\.\d+)?$/.test(retry) ? Number(retry)*1000 : Math.max(0,Date.parse(retry)-Date.now());
  await response.body?.cancel().catch(()=>{});
  throw Object.assign(Error(label+' HTTP '+response.status),{status:response.status,retryAfterMs});
}

function tooLarge() {
  return Object.assign(Error('錄音超過備援服務可接收的 2 GB 檔案上限，原始錄音已保留。'),{status:413});
}

export async function uploadGeminiAudio({apiKey,filename,buffer,audioStreamFactory,normalizeType}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal,AbortSignal.timeout(15*60_000)]);
  let source, stream, temporary;
  try {
    source = buffer ? {stream:buffer,size:buffer.byteLength} : await audioStreamFactory({signal});
    stream = source.stream;
    let size = source.size || source.contentLength;
    if (size>MAX_BYTES) throw tooLarge();
    if (!Number.isSafeInteger(size)||size<=0) {
      // The resumable protocol needs a length. Spool only sources whose
      // metadata lacks it, then stream from the restricted temporary file.
      temporary = await mkdtemp(join(tmpdir(),'meeting-audio-'));
      const path = join(temporary,'audio');
      size = 0;
      const count = new Transform({transform(chunk,encoding,callback) {
        size += chunk.length;
        if (size>MAX_BYTES) callback(tooLarge());
        else callback(null,chunk);
      }});
      await pipeline(stream,count,createWriteStream(path,{flags:'wx',mode:0o600}),{signal});
      if (!size) throw Object.assign(Error('錄音沒有可讀取的內容。'),{status:422});
      stream = createReadStream(path);
    }
    const contentType = normalizeType(source.contentType);
    const metadata = await providerResponse(await fetch(START_URL,{
      method:'POST',signal,redirect:'error',
      headers:{
        'x-goog-api-key':apiKey,'Content-Type':'application/json',
        'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start',
        'X-Goog-Upload-Header-Content-Length':String(size),'X-Goog-Upload-Header-Content-Type':contentType,
      },
      body:JSON.stringify({file:{display_name:filename}}),
    }),'Gemini upload session');
    const uploadUrl = new URL(metadata.headers.get('x-goog-upload-url')||'');
    await metadata.body?.cancel().catch(()=>{});
    if (uploadUrl.origin!==new URL(START_URL).origin||uploadUrl.username||uploadUrl.password) {
      throw Error('invalid_gemini_upload_endpoint');
    }
    const response = await providerResponse(await fetch(uploadUrl,{
      method:'POST',signal,duplex:'half',redirect:'error',
      headers:{'Content-Length':String(size),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},
      body:stream,
    }),'Gemini audio upload');
    const {file}=await response.json();
    if (!/^files\/[a-z0-9-]+$/i.test(file?.name||'')) throw Error('invalid_gemini_file');
    return {name:file.name,state:file.state,uri:file.uri,contentType,uploadedAt:Date.now()};
  } finally {
    controller.abort();
    if (stream?.destroy) stream.destroy();
    else if (stream?.cancel) await stream.cancel().catch(()=>{});
    if (temporary) await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
  }
}

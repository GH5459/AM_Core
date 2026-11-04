import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { createResourceGate } from '../core/resource-gate.js';
import { createLlm } from '../core/llm.js';
import { createDispatcher } from '../core/modules.js';
import media from '../modules/media/index.js';
import { createDrive } from '../core/drive.js';

test('bounded FIFO queue expires, rejects overflow and recovers capacity', async () => {
  const gate=createResourceGate(1,1),release=await gate.acquire();
  const expired=assert.rejects(gate.acquire(10),/queue unavailable/);
  await assert.rejects(gate.acquire(),/queue unavailable/);await expired;
  release();(await gate.acquire())();
});
test('cross-tenant AI admission covers retries and releases failures', async()=>{
  const original=globalThis.fetch;let active=0,peak=0,calls=0;
  globalThis.fetch=async()=>{active++;peak=Math.max(peak,active);await pause(5);active--;calls++;
    return new Response(JSON.stringify(calls<=3?{error:{message:'busy'}}:{candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}),{status:calls<=3?503:200});};
  try {
    const clients=Array.from({length:8},()=>createLlm({env:{GEMINI_API_KEY:'fixture'},logger:{warn(){},log(){}},sleep:async()=>{}}));
    const results=await Promise.allSettled(clients.map(c=>c.completeJson({userContent:'test'})));
    assert.equal(peak,2);assert(results.some(x=>x.status==='fulfilled'));assert(calls>8);
    globalThis.fetch=async()=>{throw Object.assign(Error('bad key'),{kind:'fatal'});};
    await assert.rejects(clients[0].completeText({userContent:'test'}));
    globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'ok'}]}}]}));
    assert.equal(await clients[0].completeText({userContent:'test'}),'ok');
  } finally { globalThis.fetch=original; }
});
test('patrol coalesces overlapping calls then runs again',async()=>{
  let finish,count=0;const wait=new Promise(r=>finish=r);
  const dispatcher=createDispatcher({tenants:[{key:'fixture',modules:['fixture']}],modules:new Map([['fixture',{tick:async()=>{count++;await wait;}}]]),platform:{}});
  const a=dispatcher.runTicks(),b=dispatcher.runTicks();assert.equal(a,b);await pause(0);assert.equal(count,1);
  finish();await a;await dispatcher.runTicks();assert.equal(count,2);
});
test('vision releases original buffer before AI waits and deletes temporary file',async()=>{
  let tmp;const ctx={media:{buffer:Buffer.from('fixture image'),contentType:'image/png'},message:{type:'image'},messagePageId:'fixture',tenant:{key:'fixture'},event:{timestamp:Date.now()}};
  media.init({llm:{available:true,completeJson:async opts=>{tmp=opts.imagePaths[0];assert.equal(ctx.media,undefined);assert.equal(fs.readFileSync(tmp,'utf8'),'fixture image');throw Error('fixture failure');}},notionRequest:async()=>({})});
  await media.onMessage(ctx);assert.equal(fs.existsSync(tmp),false);
});
test('Drive enforces byte limit during a chunked response and cancels the stream',async()=>{
  const original=globalThis.fetch;let cancelled=false,pulled=0;
  globalThis.fetch=async url=>String(url).includes('oauth2')?new Response(JSON.stringify({access_token:'fixture',expires_in:3600})):new Response(new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(16));},cancel(){cancelled=true;}}));
  try {const drive=createDrive({clientId:'fixture',clientSecret:'fixture',refreshToken:'fixture'});await assert.rejects(drive.download('fixture-file-123',20),/limit/);assert(cancelled);assert(pulled<10);}
  finally {globalThis.fetch=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createLlm} from '../core/llm.js';

test('429 honors Retry-After across calls and profiles, falls back once, then probes after cooldown',async()=>{
  const original=globalThis.fetch;let clock=1000,limited=true;const counts={gateway:0,gemini:0};
  globalThis.fetch=async url=>{
    if(String(url).includes('assemblyai')){counts.gateway++;return limited?Response.json({error:'limited'},{status:429,headers:{'retry-after':'120'}}):Response.json({choices:[{message:{content:'gateway recovered'}}]});}
    counts.gemini++;return Response.json({candidates:[{content:{parts:[{text:'fallback'}]}}]});
  };
  try{
    const llm=createLlm({env:{ASSEMBLYAI_API_KEY:'fixture',GEMINI_API_KEY:'fixture',AMCORE_LLM_CHAIN:'assemblyai,gemini'},now:()=>clock,sleep:async()=>assert.fail('429 must not immediately resend'),logger:{log(){},warn(){}}});
    const options={userContent:'unchanged full prompt',profile:'quality'};
    assert.equal((await llm.complete(options)).backend,'gemini');
    assert.equal((await llm.complete({...options,profile:null})).backend,'gemini');assert.equal(counts.gateway,1);
    clock+=119999;await llm.complete(options);assert.equal(counts.gateway,1);
    limited=false;clock++;assert.equal((await llm.complete(options)).backend,'assemblyai');assert.equal(counts.gateway,2);
  }finally{globalThis.fetch=original;}
});

test('all providers cooling down fail promptly without sending new requests',async()=>{
  const original=globalThis.fetch;let count=0;
  globalThis.fetch=async()=>{count++;return Response.json({}, {status:429});};
  try{
    const llm=createLlm({env:{ASSEMBLYAI_API_KEY:'fixture',AMCORE_LLM_CHAIN:'assemblyai'},now:()=>1,logger:{log(){},warn(){}}});
    await assert.rejects(llm.completeText({userContent:'fixture'}));await assert.rejects(llm.completeText({userContent:'fixture'}));assert.equal(count,1);
  }finally{globalThis.fetch=original;}
});

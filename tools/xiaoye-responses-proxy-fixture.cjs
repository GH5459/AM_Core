'use strict';
// In-process fixture only. No real HTTP upstream, credentials or provider SDK.
const {once}=require('node:events');
const {StringDecoder}=require('node:string_decoder');
const crypto=require('node:crypto');
const {FixtureGateway}=require('./xiaoye-model-gateway-fixture.cjs');
const FIXED_ENDPOINT='https://api.openai.com/v1/responses';
const TOOL={type:'function',name:'fixture_read',description:'Read a fictional fixture',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false},strict:true};
const object=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const boundedText=(v,max)=>typeof v==='string'&&Buffer.byteLength(v)<=max;
const callId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
function validItem(i){
 if(!i||typeof i!=='object'||Array.isArray(i))return false;
 if(i.type==='function_call')return object(i,['type','call_id','name','arguments','id','status'])&&callId(i.call_id)&&i.name==='fixture_read'&&boundedText(i.arguments,8192)&&(i.id===undefined||callId(i.id))&&(i.status===undefined||i.status==='completed');
 if(i.type==='function_call_output')return object(i,['type','call_id','output'])&&callId(i.call_id)&&boundedText(i.output,8192);
 if(i.type==='reasoning')return object(i,['type','id','summary','encrypted_content'])&&callId(i.id)&&Array.isArray(i.summary)&&i.summary.length===0&&boundedText(i.encrypted_content,8192);
 return object(i,['type','role','content'])&&(i.type===undefined||i.type==='message')&&['user','developer','assistant'].includes(i.role)&&Array.isArray(i.content)&&i.content.length>0&&i.content.length<=10&&i.content.every(p=>object(p,['type','text'])&&['input_text','output_text'].includes(p.type)&&boundedText(p.text,8192));
}
function validBody(v){
 return object(v,['model','input','instructions','tools','tool_choice','parallel_tool_calls','stream','store','max_output_tokens','include'])&&v.model==='fixture-codex'&&v.stream===true&&v.store===false&&Number.isSafeInteger(v.max_output_tokens)&&v.max_output_tokens>=1&&v.max_output_tokens<=2048&&Array.isArray(v.input)&&v.input.length>0&&v.input.length<=32&&v.input.every(validItem)&&(v.instructions===undefined||boundedText(v.instructions,8192))&&(v.tools===undefined||Array.isArray(v.tools)&&v.tools.length<=1&&v.tools.every(t=>same(t,TOOL)))&&(v.tool_choice===undefined||v.tool_choice==='auto')&&(v.parallel_tool_calls===undefined||v.parallel_tool_calls===false)&&(v.include===undefined||same(v.include,['reasoning.encrypted_content']));
}
async function timeout(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fixture upstream timeout')),ms);})]);}finally{clearTimeout(timer);}}
class TerminalEvents{
 constructor(){this.decoder=new StringDecoder('utf8');this.buffer='';this.terminal=false;}
 feed(bytes){this.buffer+=this.decoder.write(bytes);let m;while((m=/\r?\n\r?\n/.exec(this.buffer))){const frame=this.buffer.slice(0,m.index);this.buffer=this.buffer.slice(m.index+m[0].length);const lines=frame.split(/\r?\n/),data=lines.filter(x=>x.startsWith('data:')).map(x=>x.slice(5).replace(/^ /,''));if(!data.length)continue;const raw=data.join('\n');if(raw==='[DONE]')continue;const event=JSON.parse(raw),name=lines.find(x=>x.startsWith('event:'))?.slice(6).trim();if(name&&name!==event.type)throw Error('event type mismatch');if(event.type==='response.completed'){if(event.response?.status!=='completed')throw Error('completion not confirmed');this.terminal=true;}else if(['response.failed','response.incomplete','error'].includes(event.type))this.terminal=true;}if(Buffer.byteLength(this.buffer)>65536)throw Error('fixture event too large');}
 end(){this.buffer+=this.decoder.end();if(this.buffer.trim()||!this.terminal)throw Error('missing terminal response');}
}
class FixtureResponsesProxy extends FixtureGateway{
 constructor({upstream,clock=Date.now,timeoutMs=1000,maxResponseBytes=262144}={}){super({clock});if(upstream?.fixtureOnly!==true||typeof upstream.open!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<10||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1)throw Error('fixture upstream required');this.upstream=upstream;this.timeoutMs=timeoutMs;this.maxResponseBytes=maxResponseBytes;}
 async handle(req,res){
  const reject=status=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"request_rejected"}');};
  if(req.method!=='POST'||req.url!=='/v1/responses')return reject(404);
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];if(!token||!this.authorize(token))return reject(401);
  const id=req.headers['x-fixture-request-id'];if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return reject(400);
  let size=0,parts=[],large=false;for await(const chunk of req){size+=chunk.length;if(size>65536){large=true;parts=[];}else if(!large)parts.push(chunk);}if(large)return reject(413);
  let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return reject(400);}if(!validBody(body))return reject(400);
  const grant=this.authorize(token);if(!grant)return reject(401);if(grant.used>=grant.maxRequests||grant.inFlight)return reject(429);
  const key=crypto.createHash('sha256').update(JSON.stringify([grant.eventId,grant.sourceVersion,grant.generation,id])).digest('hex');if(this.requests.has(key))return reject(409);
  this.requests.add(key);grant.used++;grant.inFlight=true;const abort=new AbortController(),deadline=Date.now()+this.timeoutMs;res.on('close',()=>abort.abort());
  const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw Error('fixture total deadline');return ms;};
  try{
   // Only a fake injected adapter exists. No request-supplied URL, headers or
   // credential is ever handed to it; the endpoint constant is not fetched.
   const upstream=await timeout(Promise.resolve().then(()=>{if(!this.authorize(token))throw Error('authority expired');return this.upstream.open({endpoint:FIXED_ENDPOINT,payload:body,signal:abort.signal});}),remaining());
   if(!this.authorize(token)||upstream?.status!==200||upstream.contentType!=='text/event-stream'||!upstream.body?.[Symbol.asyncIterator])return reject(502);
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});const iterator=upstream.body[Symbol.asyncIterator](),events=new TerminalEvents();let bytes=0;
   for(;;){const next=await timeout(iterator.next(),remaining());if(next.done)break;if(!this.authorize(token)||abort.signal.aborted)throw Error('authority ended');const chunk=Buffer.from(next.value);bytes+=chunk.length;if(bytes>this.maxResponseBytes)throw Error('response too large');events.feed(chunk);if(!res.write(chunk))await timeout(once(res,'drain'),remaining());}
   if(!this.authorize(token))throw Error('authority ended');events.end();res.end();
  }catch{abort.abort();if(res.headersSent)res.destroy();else reject(502);}finally{grant.inFlight=false;}
 }
}
module.exports={FixtureResponsesProxy,FIXED_ENDPOINT,TOOL,validBody};

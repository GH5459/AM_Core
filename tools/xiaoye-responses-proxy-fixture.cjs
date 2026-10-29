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
const supportedEvents=new Set(['response.created','response.in_progress','response.output_item.added','response.output_item.done','response.content_part.added','response.content_part.done','response.output_text.delta','response.output_text.done','response.function_call_arguments.delta','response.function_call_arguments.done','response.reasoning_summary_part.added','response.reasoning_summary_part.done','response.reasoning_summary_text.delta','response.reasoning_summary_text.done','response.completed','response.failed','response.incomplete','error']);
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
 constructor(allowedTools=[]){this.decoder=new StringDecoder('utf8');this.buffer='';this.terminal=false;this.done=false;this.sawFunctionCall=false;this.allowedTools=new Set(Array.isArray(allowedTools)?allowedTools:Object.keys(allowedTools));this.validators=Array.isArray(allowedTools)?{}:allowedTools;this.calls=new Map();this.callIds=new Set();}
 checkItem(item,phase){
  if(!item||typeof item!=='object')throw Error('invalid output item');
  if(item.type!=='function_call'){if(!['message','reasoning'].includes(item.type))throw Error('unsupported output item');return;}
  if(typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)||typeof item.call_id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(item.call_id)||!this.allowedTools.has(item.name))throw Error('unauthorized function call');
  const old=this.calls.get(item.id);
  if(phase==='added'){if(old||this.callIds.has(item.call_id))throw Error('duplicate function call');this.sawFunctionCall=true;this.calls.set(item.id,{name:item.name,callId:item.call_id,done:false});this.callIds.add(item.call_id);return;}
  if(!old||old.name!==item.name||old.callId!==item.call_id||(phase==='done'&&old.done))throw Error('unmatched function call');
  if(typeof item.arguments!=='string'||Buffer.byteLength(item.arguments)>32768)throw Error('invalid arguments');const args=JSON.parse(item.arguments);if(!args||typeof args!=='object'||Array.isArray(args)||this.validators[item.name]&&!this.validators[item.name](args))throw Error('invalid arguments');
  if(item.status!=='completed')throw Error('function not complete');if(phase==='done'){if(old.argsDone!==undefined&&old.argsDone!==item.arguments)throw Error('function arguments changed');old.done=true;old.arguments=item.arguments;}if(phase==='terminal'&&(!old.done||old.arguments!==item.arguments))throw Error('function output changed');
 }
 feed(bytes){this.buffer+=this.decoder.write(bytes);let m;while((m=/\r?\n\r?\n/.exec(this.buffer))){const frame=this.buffer.slice(0,m.index);this.buffer=this.buffer.slice(m.index+m[0].length);const lines=frame.split(/\r?\n/),data=lines.filter(x=>x.startsWith('data:')).map(x=>x.slice(5).replace(/^ /,''));if(!data.length)continue;const raw=data.join('\n');if(raw==='[DONE]'){if(!this.terminal||this.done)throw Error('invalid done marker');this.done=true;continue;}if(this.terminal||this.done)throw Error('event after terminal');const event=JSON.parse(raw),name=lines.find(x=>x.startsWith('event:'))?.slice(6).trim();if(!supportedEvents.has(event.type)||name&&name!==event.type)throw Error('unsupported event');if(event.type==='response.output_item.added')this.checkItem(event.item,'added');if(event.type==='response.output_item.done')this.checkItem(event.item,'done');if(event.type==='response.function_call_arguments.delta'||event.type==='response.function_call_arguments.done'){const call=this.calls.get(event.item_id);if(!call||call.done)throw Error('unknown argument event');if(event.type.endsWith('.delta')){if(call.argsDone!==undefined||!boundedText(event.delta,32768))throw Error('invalid argument delta');call.argsDelta=(call.argsDelta||'')+event.delta;if(!boundedText(call.argsDelta,32768))throw Error('argument delta too large');}if(event.type.endsWith('.done')){if(call.argsDone!==undefined||!boundedText(event.arguments,32768)||call.argsDelta!==undefined&&call.argsDelta!==event.arguments)throw Error('invalid arguments');const args=JSON.parse(event.arguments);if(!args||typeof args!=='object'||Array.isArray(args))throw Error('invalid arguments');call.argsDone=event.arguments;}}if(event.type==='response.completed'){if(event.response?.status!=='completed')throw Error('completion not confirmed');const items=event.response.output;if(this.calls.size&&!Array.isArray(items))throw Error('missing terminal output');const seen=new Set();if(Array.isArray(items))for(const item of items){this.checkItem(item,'terminal');if(item.type==='function_call'){if(seen.has(item.id))throw Error('duplicate terminal call');seen.add(item.id);}}if(seen.size!==this.calls.size)throw Error('missing terminal call');this.terminal=true;}else if(['response.failed','response.incomplete','error'].includes(event.type)){if(this.calls.size)throw Error('failed response with pending tool');this.terminal=true;}}if(Buffer.byteLength(this.buffer)>65536)throw Error('fixture event too large');}
 end(){this.buffer+=this.decoder.end();if(this.buffer.trim()||!this.terminal)throw Error('missing terminal response');}
}
class FixtureResponsesProxy extends FixtureGateway{
 constructor({upstream,clock=Date.now,timeoutMs=1000,maxResponseBytes=262144}={}){super({clock});if(upstream?.fixtureOnly!==true||typeof upstream.open!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<10||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1)throw Error('fixture upstream required');this.upstream=upstream;this.timeoutMs=timeoutMs;this.maxResponseBytes=maxResponseBytes;}
 async handle(req,res){
  const reject=status=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"request_rejected"}');};
  if(req.method!=='POST'||req.url!=='/v1/responses')return reject(404);
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];if(!token||!this.authorize(token))return reject(401);
  const id=req.headers['x-fixture-request-id'];if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return reject(400);
  let raw;try{raw=await this.readBody(req,this.authorize(token),65536);}catch(e){if(!res.destroyed)return reject(e.status||408);return;}
  let body;try{body=JSON.parse(raw.toString('utf8'));}catch{return reject(400);}if(!validBody(body))return reject(400);
  const grant=this.authorize(token);if(!grant)return reject(401);if(grant.used>=grant.maxRequests||grant.inFlight)return reject(429);
  const key=crypto.createHash('sha256').update(JSON.stringify([grant.eventId,grant.sourceVersion,grant.generation,id])).digest('hex');if(this.requests.has(key))return reject(409);
  this.requests.add(key);grant.used++;grant.inFlight=true;const abort=new AbortController(),deadline=Date.now()+this.timeoutMs,untrack=this.trackStream(grant,abort);res.on('close',()=>abort.abort());abort.signal.addEventListener('abort',()=>{if(!res.writableEnded)res.destroy();},{once:true});
  const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw Error('fixture total deadline');return ms;};
  try{
   // Only a fake injected adapter exists. No request-supplied URL, headers or
   // credential is ever handed to it; the endpoint constant is not fetched.
   const upstream=await timeout(Promise.resolve().then(()=>{if(!this.authorize(token))throw Error('authority expired');return this.upstream.open({endpoint:FIXED_ENDPOINT,payload:body,signal:abort.signal});}),remaining());
   if(!this.authorize(token)||upstream?.status!==200||upstream.contentType!=='text/event-stream'||!upstream.body?.[Symbol.asyncIterator])return reject(502);
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});const iterator=upstream.body[Symbol.asyncIterator](),events=new TerminalEvents(body.tools?.length?{fixture_read:args=>object(args,['path'])&&typeof args.path==='string'&&/^[A-Za-z0-9._/-]{1,200}$/.test(args.path)&&!args.path.includes('..')}:[]),terminalChunks=[];let bytes=0;
   for(;;){const next=await timeout(iterator.next(),remaining());if(next.done)break;if(!this.authorize(token)||abort.signal.aborted)throw Error('authority ended');const chunk=Buffer.from(next.value);bytes+=chunk.length;if(bytes>this.maxResponseBytes)throw Error('response too large');events.feed(chunk);if(events.terminal||events.sawFunctionCall)terminalChunks.push(chunk);else if(!res.write(chunk))await timeout(once(res,'drain'),remaining());}
   if(!this.authorize(token))throw Error('authority ended');events.end();for(const chunk of terminalChunks){if(!this.authorize(token))throw Error('authority ended');if(!res.write(chunk))await timeout(once(res,'drain'),remaining());}res.end();
  }catch{if(!res.headersSent&&!abort.signal.aborted)reject(502);else res.destroy();abort.abort();}finally{untrack();grant.inFlight=false;}
 }
}
module.exports={FixtureResponsesProxy,FIXED_ENDPOINT,TOOL,validBody,TerminalEvents,timeout};

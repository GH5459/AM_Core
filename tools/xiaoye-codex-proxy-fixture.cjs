'use strict';
// Fictional protocol exercise only: never performs external HTTP or handles a real key.
const crypto=require('node:crypto'),{once}=require('node:events');
const {FixtureGateway}=require('./xiaoye-model-gateway-fixture.cjs');
const {TerminalEvents,timeout,FIXED_ENDPOINT}=require('./xiaoye-responses-proxy-fixture.cjs');
const toolHashes={exec_command:'41917f9a72158c43af3e8d8040882b10ad22c3f075e1c49a95ff9edfbd82e533',write_stdin:'9c3adbaa65e36ce23c7f1a8778e094a14b2086c993fc783727156276831c99dd',request_user_input:'d966b55e964da3155fb6956528a375b7cea02b3fc189086b7d9225f4d025fa6c',view_image:'5f77165b6665a58f62c7efa2df2d21dc8beac9c389270666e88768ace1a868df',get_goal:'460d7ce06591cae242849cc2a71b7ca991fe5aa56b89ecf686daced9ee843386',create_goal:'3d6fb9faa106db74bff252990c4f689bc3b00edf4768c661dd98dc82dbc84285',update_goal:'289891a532194d2638a15032544166dcf1510d0c3f22067518332db27413058e'};
const digest=s=>crypto.createHash('sha256').update(s).digest('hex'),canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const only=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(v=>k.includes(v));
const text=(x,n)=>typeof x==='string'&&Buffer.byteLength(x)<=n;
const id=x=>x===null||x===undefined||text(x,200);
// Strict fixture subset of JSON Schema. Unknown keywords and unknown object
// fields fail closed; schema validity does not authorize an external action.
function validToolArguments(schema,value,depth=0){
 if(depth>12||!only(schema,['type','description','enum','items','properties','required','additionalProperties']))return false;
 if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||!schema.enum.some(x=>Object.is(x,value))))return false;
 switch(schema.type){
  case 'object':{if(!value||typeof value!=='object'||Array.isArray(value)||!only(schema.properties||{},Object.keys(schema.properties||{}))||schema.additionalProperties!==undefined&&schema.additionalProperties!==false||schema.required!==undefined&&!Array.isArray(schema.required))return false;const props=schema.properties||{},required=schema.required||[];if(Object.keys(value).length>100||required.some(k=>typeof k!=='string'||!Object.hasOwn(value,k))||Object.keys(value).some(k=>!Object.hasOwn(props,k)))return false;return Object.keys(value).every(k=>validToolArguments(props[k],value[k],depth+1));}
  case 'array':return Array.isArray(value)&&value.length<=100&&!!schema.items&&value.every(v=>validToolArguments(schema.items,v,depth+1));
  case 'string':return text(value,8192);
  case 'integer':return Number.isSafeInteger(value)&&Math.abs(value)<=1000000000;
  case 'number':return typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1000000000;
  case 'boolean':return typeof value==='boolean';
  case 'null':return value===null;
  default:return false;
 }
}
function validInput(x){
 if(x?.type==='message')return only(x,['type','id','role','content'])&&id(x.id)&&['developer','user','assistant'].includes(x.role)&&Array.isArray(x.content)&&x.content.length>0&&x.content.length<=12&&x.content.every(p=>only(p,['type','text'])&&['input_text','output_text'].includes(p.type)&&text(p.text,65536));
 if(x?.type==='function_call')return only(x,['type','id','status','call_id','name','arguments'])&&id(x.id)&&id(x.call_id)&&typeof x.call_id==='string'&&typeof x.name==='string'&&Object.hasOwn(toolHashes,x.name)&&text(x.arguments,32768)&&(x.status===undefined||x.status===null||x.status==='completed');
 if(x?.type==='function_call_output')return only(x,['type','id','call_id','output'])&&id(x.id)&&typeof x.call_id==='string'&&id(x.call_id)&&text(x.output,32768);
 if(x?.type==='reasoning')return only(x,['type','id','summary','encrypted_content'])&&id(x.id)&&Array.isArray(x.summary)&&x.summary.length===0&&text(x.encrypted_content,32768);
 return false;
}
function validCodex(v){
 const metadata=['root_turn_id','session_id','thread_id','turn_id','x-codex-installation-id','x-codex-turn-metadata','x-codex-window-id'];
 if(!only(v,['client_metadata','include','input','model','parallel_tool_calls','prompt_cache_key','reasoning','store','stream','tool_choice','tools'])||v.model!=='fixture-codex'||v.stream!==true||v.store!==false||v.tool_choice!=='auto'||typeof v.parallel_tool_calls!=='boolean'||!text(v.prompt_cache_key,256)||!only(v.reasoning,['summary','effort'])||!['auto','concise','detailed'].includes(v.reasoning.summary)||v.reasoning.effort!==undefined&&!['low','medium','high','xhigh'].includes(v.reasoning.effort)||!Array.isArray(v.include)||v.include.length!==1||v.include[0]!=='reasoning.encrypted_content'||!only(v.client_metadata,metadata)||!Object.values(v.client_metadata).every(s=>text(s,1024))||!Array.isArray(v.input)||v.input.length<1||v.input.length>64||!v.input.every(validInput)||!Array.isArray(v.tools)||v.tools.length!==Object.keys(toolHashes).length)return false;
 const names=new Set();for(const t of v.tools){if(!only(t,['type','name','description','parameters','strict'])||t.type!=='function'||!Object.hasOwn(toolHashes,t.name)||names.has(t.name)||digest(JSON.stringify(canonical(t)))!==toolHashes[t.name])return false;names.add(t.name);}return true;
}
class FixtureCodexProxy extends FixtureGateway{
 constructor({upstream,clock=Date.now,timeoutMs=5000,maxResponseBytes=262144}={}){super({clock});if(upstream?.fixtureOnly!==true||typeof upstream.open!=='function')throw Error('fake upstream required');this.upstream=upstream;this.timeoutMs=timeoutMs;this.maxResponseBytes=maxResponseBytes;this.inference=new Map();}
 async handle(req,res){
  const reject=status=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"fixture_rejected"}');};
  if(req.method!=='POST'||req.url!=='/v1/responses')return reject(404);
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1],requestId=req.headers['x-client-request-id'];if(!token||!this.authorize(token))return reject(401);if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))return reject(400);
  let raw;try{raw=await this.readBody(req,this.authorize(token),262144);}catch(e){if(!res.destroyed)return reject(e.status||408);return;}
  let body;try{body=JSON.parse(raw.toString('utf8'));}catch{return reject(400);}if(!validCodex(body))return reject(400);
  const grant=this.authorize(token);if(!grant)return reject(401);if(grant.inFlight||grant.used>=grant.maxRequests)return reject(429);
  const bodyHash=digest(JSON.stringify(canonical(body))),key=digest(JSON.stringify([grant.eventId,grant.sourceVersion,grant.generation,requestId,bodyHash])),entry=this.inference.get(key);
  if(entry&&!(entry.state==='prestream-503'&&entry.attempts<2))return reject(409);
  const attempt={state:'unknown',attempts:(entry?.attempts||0)+1};this.inference.set(key,attempt);grant.used++;grant.inFlight=true;
  const abort=new AbortController(),deadline=Date.now()+this.timeoutMs,untrack=this.trackStream(grant,abort);res.on('close',()=>abort.abort());abort.signal.addEventListener('abort',()=>{if(!res.writableEnded)res.destroy();},{once:true});const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw Error('deadline');return ms;};
  try{
   // Inference is separate from external actions. Original metadata is not
   // forwarded; the fake adapter receives a scoped cache identifier instead.
   const {client_metadata,prompt_cache_key,...safe}=body;const payload={...safe,max_output_tokens:1024,prompt_cache_key:'fixture-'+digest(JSON.stringify([grant.eventId,grant.sourceVersion,grant.generation])).slice(0,32)};
   const upstream=await timeout(Promise.resolve().then(()=>{if(!this.authorize(token))throw Error('revoked');return this.upstream.open({endpoint:FIXED_ENDPOINT,payload,signal:abort.signal});}),remaining());
   if(!this.authorize(token))throw Error('revoked');
   if(upstream?.status===503){attempt.state='prestream-503';return reject(503);}
   if(upstream?.status!==200||upstream.contentType!=='text/event-stream'||!upstream.body?.[Symbol.asyncIterator])return reject(502);
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});let bytes=0;const iterator=upstream.body[Symbol.asyncIterator](),events=new TerminalEvents(Object.fromEntries(body.tools.map(t=>[t.name,args=>validToolArguments(t.parameters,args)]))),terminalChunks=[];
   for(;;){const n=await timeout(iterator.next(),remaining());if(n.done)break;if(!this.authorize(token)||abort.signal.aborted)throw Error('revoked');const chunk=Buffer.from(n.value);bytes+=chunk.length;if(bytes>this.maxResponseBytes)throw Error('limit');events.feed(chunk);if(events.terminal||events.sawFunctionCall)terminalChunks.push(chunk);else if(!res.write(chunk))await timeout(once(res,'drain'),remaining());}
   if(!this.authorize(token))throw Error('revoked');events.end();for(const chunk of terminalChunks){if(!this.authorize(token))throw Error('revoked');if(!res.write(chunk))await timeout(once(res,'drain'),remaining());}attempt.state='terminal';res.end();
  }catch{if(!res.headersSent&&!abort.signal.aborted)reject(502);else res.destroy();abort.abort();}finally{untrack();grant.inFlight=false;}
 }
}
module.exports={FixtureCodexProxy,validCodex,validToolArguments,toolHashes};

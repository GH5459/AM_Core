import {channel} from 'node:diagnostics_channel';

export const OUTBOUND_TRAFFIC_CONTRACT='outbound-http-counters-v1';
const size=value=>typeof value==='string'?Buffer.byteLength(value):Number(value?.byteLength)||0;
function feature(request) {
  // Fixed labels only. Never retain paths, queries, headers, credentials or body.
  const path=String(request.path||'').split('?')[0];
  if(path.startsWith('/api/integrations/leaf-snail/tasks/photos/'))return 'task-photos';
  if(path.startsWith('/api/integrations/leaf-snail/tasks/'))return 'tasks';
  if(path.startsWith('/api/integrations/leaf-snail/calendar/'))return 'calendar';
  if(/chat\/completions|generateContent|\/v1\/messages$/.test(path))return 'llm';
  if(path.startsWith('/upload/'))return 'upload';
  return 'other';
}

export function createOutboundTraffic({logger=console,now=Date.now,intervalMs=60000,maxBuckets=64}={}) {
  const requests=new WeakMap(),buckets=new Map(),subscriptions=[];
  const startedAt=now();let windowStart=startedAt,closed=false;
  const totals={requests:0,bodyBytes:0,headerBytes:0,errors:0,rateLimited:0,unknownBodies:0};
  function rowFor(request) {
    let host;try{host=new URL(String(request.origin)).hostname;}catch{host='unknown';}
    const label=feature(request);let key=host+'|'+label;
    if(!buckets.has(key)&&buckets.size>=maxBuckets)key='overflow|other';
    if(!buckets.has(key)){const [destination,operation]=key.split('|');buckets.set(key,{host:destination,feature:operation,requests:0,bodyBytes:0,headerBytes:0,errors:0,rateLimited:0,unknownBodies:0});}
    return buckets.get(key);
  }
  function add(request,name,value){const state=requests.get(request);if(!state)return;state.row[name]+=value;totals[name]+=value;}
  function on(name,fn){const ch=channel(name),handler=value=>{try{fn(value);}catch{/* Observability cannot fail a request. */}};ch.subscribe(handler);subscriptions.push([ch,handler]);}
  on('undici:request:create',({request})=>{requests.set(request,{row:rowFor(request),chunks:0});add(request,'requests',1);});
  on('undici:client:sendHeaders',({request,headers})=>add(request,'headerBytes',size(headers)));
  on('undici:request:bodyChunkSent',({request,chunk})=>{const state=requests.get(request);if(!state)return;state.chunks++;add(request,'bodyBytes',size(chunk));});
  on('undici:request:bodySent',({request})=>{
    const state=requests.get(request);if(!state||state.chunks)return;
    // Older Node/Undici releases lack chunk events; only count a known length
    // after successful transmission. Streams with unknown size remain explicit.
    if(Number.isFinite(request.contentLength)&&request.contentLength>=0)add(request,'bodyBytes',request.contentLength);
    else if(request.body!=null)add(request,'unknownBodies',1);
  });
  on('undici:request:headers',({request,response})=>{if(response.statusCode===429)add(request,'rateLimited',1);});
  on('undici:request:error',({request})=>add(request,'errors',1));
  function snapshot(){return {contract:OUTBOUND_TRAFFIC_CONTRACT,startedAt,windowStart,observedAt:now(),coverage:'node-fetch-http; excludes PostgreSQL, node:https, TLS/TCP overhead and inbound HTTP responses',totals:{...totals},destinations:[...buckets.values()].map(row=>({...row}))};}
  function flush(){
    if(closed)return;
    // Keep buckets stable so in-flight requests still contribute after a flush.
    const report=snapshot();
    if(report.destinations.some(r=>Object.entries(r).some(([k,v])=>typeof v==='number'&&v>0))){
      try{logger.info?.('[outbound-traffic] '+JSON.stringify(report));}catch{}
    }
    for(const row of buckets.values())for(const k of Object.keys(totals))row[k]=0;
    windowStart=now();
  }
  const timer=intervalMs>0?setInterval(flush,intervalMs):null;timer?.unref?.();
  return {snapshot,flush,close(){closed=true;clearInterval(timer);for(const [ch,handler]of subscriptions)ch.unsubscribe(handler);}};
}

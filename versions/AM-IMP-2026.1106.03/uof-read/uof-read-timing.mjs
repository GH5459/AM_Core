// Timings exist only on the current read operation. They contain fixed names,
// durations, counts and existing public failure codes; never identities or URLs.
const scopeKey=Symbol('uof-read-measurements');
const timedPaths=new Set(['/api/uof-review/web-pending','/api/uof-review/pending','/api/uof-review/bootstrap']);
const failures=new Set(['DATA_API_REQUEST_FAILED','DATA_API_UNAVAILABLE','DATA_API_RESOURCE_LIMIT','DATA_API_INVALID_CONTENT','DATA_API_RESPONSE_TOO_LARGE','DATA_API_RESPONSE_INTERRUPTED','DATA_API_INVALID_JSON','READ_QUERY_RESPONSE_INVALID','READ_QUERY_RESPONSE_INCOMPLETE','CASE_COLLECTION_CHANGED','PENDING_ROW_INVALID','LOGIN_REQUIRED','ACCESS_DENIED','ACCESS_REVOKED','MIGRATION_NOT_READY']);
export const UOF_READ_STAGES_POLICY='fresh-guards-parallel-classification-v1';
export function isMeasuredUofRead(app){return !!app[scopeKey];}
export function shouldMeasureUofRead(app,request){return !app[scopeKey]&&request.method==='GET'&&timedPaths.has(new URL(request.url).pathname);}
export async function readStage(app,name,work){
 const state=app[scopeKey];if(!state)return work();
 const start=performance.now();try{return await work();}catch(error){state.failure=failures.has(error?.code)?error.code:'ERROR';throw error;}
 finally{const item=state.stages.get(name)||{ms:0,calls:0};item.ms+=performance.now()-start;item.calls++;state.stages.set(name,item);}
}
export async function measuredUofRead(app,request){
 const scoped=Object.create(app),state={stages:new Map(),failure:null};Object.defineProperty(scoped,scopeKey,{value:state});
 for(const [method,name]of [['session','uof_session'],['authorize','uof_authorize'],['refreshDirectory','uof_directory'],['classification','uof_config'],['listItems','uof_list']]){
  const original=app[method];scoped[method]=function(...args){return readStage(this,name,()=>original.apply(this,args));};
 }
 const reviews=Object.create(app.reviews);scoped.reviews=reviews;
 for(const [method,name]of [['pending','uof_pending'],['classificationComments','uof_comments'],['details','uof_details'],['subjects','uof_subjects']]){
  const original=app.reviews[method];reviews[method]=function(...args){return readStage(scoped,name,()=>original.apply(app.reviews,args));};
 }
 const started=performance.now(),response=await app.fetch.call(scoped,request),headers=new Headers(response.headers);
 const entries=[...state.stages].map(([name,value])=>name+';dur='+value.ms.toFixed(1)+';desc="calls:'+value.calls+'"');
 entries.push('uof_total;dur='+(performance.now()-started).toFixed(1),'uof_response;dur=0;desc="http_'+response.status+'"');
 if(state.failure)entries.push('uof_failure;dur=0;desc="'+state.failure+'"');
 headers.append('Server-Timing',entries.join(', '));headers.set('X-UOF-Read-Stages',UOF_READ_STAGES_POLICY);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

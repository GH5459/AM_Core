import {FIXED_FILES,firstScreenAssets} from './first-screen.mjs';

export async function operationSpeedResponse(request,response,env,start){
 const path=new URL(request.url).pathname;
 // Final cache policy must run after every program/style transformation.
 // firstScreenAssets only allows the current version, fixed identity-independent
 // files, successful code MIME types and responses without cookies.
 if(FIXED_FILES.has(path))return firstScreenAssets(request,response,env);
 if(!/^\/api\/(?:tasks(?:\/|$)|attachments(?:\/|$)|meetings(?:\/|$))/.test(path))return response;
 const headers=new Headers(response.headers);
 headers.append('Server-Timing','operation_total;dur='+Math.max(0,performance.now()-start).toFixed(1));
 headers.set('X-DailyLog-Operation-Policy','bounded-reads-confirmed-writes-v1');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

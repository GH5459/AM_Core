'use strict';
function exact(source, before, after, label) {
  if (source.split(before).length !== 2) throw Error('Expected exactly one ' + label);
  return source.replace(before, after);
}
function patchMultilingual(source) {
  source = exact(source, "import {readTaskIdentity} from './task-read-identity.mjs';", "import {readTaskIdentity,requestsTaskReadIdentity,captureTaskReadIdentity} from './task-read-identity.mjs';", 'existing private identity import');
  const anchor = "  const identity=request.method==='GET'&&taskRoute(p)?await readTaskIdentity(base,request,env,ctx):null;";
  const addition = `  // Preserve the complete session wrapper chain while forwarding its private capability.
  if(p==='/api/auth/session'&&request.method==='GET'&&requestsTaskReadIdentity(request)){
   const {response,auth}=await readTaskIdentity(base,request,env,ctx);
   if(!response.ok)return response;
   if(!auth?.authenticated||!auth.user?.account)return captureTaskReadIdentity(request,auth);
   const experience=await employeeExperience(env,auth.user.account);
   const result=captureTaskReadIdentity(request,{...auth,experience});
   result.headers.set('X-Multilingual-Contract',MULTILINGUAL_CONTRACT);return result;
  }
`;
  return exact(source, anchor, addition + anchor, 'multilingual private session forwarding');
}
function patchMeetings(source) {
  if (source.includes("from './meeting-read-identity.mjs'")) throw Error('Meeting read patch already applied');
  source = "import {isMeetingListRead,meetingSession,meetingReadTiming} from './meeting-read-identity.mjs';\n" + source;
  source = exact(source, " if(!routes(url.pathname)&&!browser)return null;", " if(!routes(url.pathname)&&!browser)return null;\n const narrow=await isMeetingListRead(request),timing=meetingReadTiming(narrow);", 'proxy selector');
  source = exact(source, "  const r=await inner.fetch(new Request(url.origin+'/api/auth/session',{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx),session=await r.json();", "  const {response:r,session}=await meetingSession(inner,request,env,ctx,narrow);timing?.mark('dailylog_meeting_identity');", 'proxy session');
  source = exact(source, "  const origin=new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com');", "  timing?.mark('dailylog_meeting_binding');\n  const origin=new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com');", 'binding timing');
  source = exact(source, "  let body=text?await upstream.text():upstream.body;", "  let body=text?await upstream.text():upstream.body;timing?.mark('dailylog_meeting_upstream');", 'upstream timing');
  source = exact(source, "  return new Response(request.method==='HEAD'?null:body,{status:upstream.status,headers:responseHeaders});", "  if(timing)responseHeaders.set('Server-Timing',timing.header(upstream.headers.get('Server-Timing')));\n  return new Response(request.method==='HEAD'?null:body,{status:upstream.status,headers:responseHeaders});", 'response timing');
  source = exact(source, "{status:e.status||503,headers});}", "{status:e.status||503,headers:timing?{...headers,'Server-Timing':timing.header()}:headers});}", 'error timing');
  return source;
}
function patchOperationSpeed(source) {
  return exact(source,
    " if(!/^\\/api\\/(?:tasks(?:\\/|$)|attachments(?:\\/|$)|meetings(?:\\/|$))/.test(path))return response;",
    " if(path!=='/meetings/review/hub/api'&&!/^\\/api\\/(?:tasks(?:\\/|$)|attachments(?:\\/|$)|meetings(?:\\/|$))/.test(path))return response;",
    'outer meeting API total timing');
}
module.exports = {patchMultilingual, patchMeetings, patchOperationSpeed};

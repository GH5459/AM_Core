const enc=new TextEncoder(),hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const routes=p=>/^\/meetings\/review\/(?:hub(?:\/api)?|work\/[a-f0-9]{64}(?:\/(?:api|audio|glossary|hub))?)$/.test(p);
const denied=(message,status=403)=>Object.assign(Error(message),{status});
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"frame-ancestors 'self'"};
export async function meetingProxy(request,env,ctx,inner,{fetchImpl=fetch}={}){
 const url=new URL(request.url),browser=url.pathname==='/meetings/embedded-browser.js';
 if(!routes(url.pathname)&&!browser)return null;
 try{
  if(!['GET','HEAD','POST'].includes(request.method))throw denied('不支援此操作。',405);
  const r=await inner.fetch(new Request(url.origin+'/api/auth/session',{headers:{Cookie:request.headers.get('Cookie')||''}}),env,ctx),session=await r.json();
  if(!r.ok||!session.authenticated||!/^\d{1,20}$/.test(session.user?.account||''))throw denied('請回工作日誌登入後再開啟會議。',401);
  if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||request.headers.get('X-DailyLog-CSRF')!==session.csrfToken))throw denied('請從本人工作日誌操作。');
  if(browser)return new Response("window.dailylogMeetingEmbedded=true;window.loginContinuationSession=async()=>true;window.tryLoginContinuation=async()=>false;const originalFetch=window.fetch.bind(window);window.fetch=(input,options={})=>{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/meetings/')){const h=new Headers(options.headers||(input instanceof Request?input.headers:undefined));h.set('X-DailyLog-CSRF',"+JSON.stringify(session.csrfToken)+");options={...options,headers:h};}return originalFetch(input,options);};",{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  const rows=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND json_extract(value,'$.account')=?").bind(session.user.account).all();
  const matches=[...new Map((rows.results||[]).map(r=>JSON.parse(r.value)).filter(v=>v.confirmedAt&&/^U[a-f0-9]{32}$/i.test(v.lineUserId||'')).map(v=>[v.botUserId+':'+v.lineUserId,v])).values()];
  if(matches.length!==1)throw denied('請先完成本人 LINE 與公司帳號確認，再開啟會議。');
  const identity=matches[0];for(const key of ['line:'+identity.botUserId+':'+identity.lineUserId,'account:'+identity.botUserId+':'+session.user.account]){const row=await env.DB.prepare("SELECT value FROM documents WHERE namespace='line-work-identities' AND key=?").bind(key).first(),v=row&&JSON.parse(row.value);if(!v||!v.confirmedAt||v.account!==session.user.account||v.lineUserId!==identity.lineUserId||v.identityId!==identity.identityId)throw denied('本人帳號對應需要重新確認。');}
  const origin=new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN||'https://am.hozorental.com');
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_MEETING_MANAGEMENT_SECRET.length<32)throw denied('會議服務尚未設定完成。',503);
  const target=new URL(url.pathname+url.search,origin);target.searchParams.set('_dailylogLine',identity.lineUserId);
  if(request.method==='POST')target.searchParams.set('_dailylogNonce',crypto.randomUUID());
  const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>12*1024*1024)throw denied('單次上傳過大，請使用分段上傳。',413);
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const timestamp=String(Date.now()),bodyHash=await digest(btoa(binary)),account=session.user.account;
  const key=await crypto.subtle.importKey('raw',enc.encode(env.AMCORE_MEETING_MANAGEMENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode([request.method,target.pathname+target.search,timestamp,account,bodyHash].join('\n'))));
  const upstream=await fetchImpl(target,{method:request.method,redirect:'manual',headers:{'Content-Type':request.headers.get('Content-Type')||'application/json','x-meeting-time':timestamp,'x-meeting-actor':account,'x-meeting-signature':signature,...request.method==='GET'&&request.headers.has('Range')?{Range:request.headers.get('Range')}:{}},...(request.method==='POST'?{body:bytes}:{}),signal:AbortSignal.timeout(300000)});
  if(upstream.status>=300&&upstream.status<400)throw denied('會議來源已變更，請重新開啟。',503);
  const type=upstream.headers.get('Content-Type')||'application/octet-stream',text=/text\/html|javascript|application\/json/.test(type);
  let body=text?await upstream.text():upstream.body;
  if(text){for(const source of new Set([origin.origin,upstream.headers.get('X-DailyLog-Meetings-Origin')].filter(Boolean)))body=body.replaceAll(source+'/meetings/review/',url.origin+'/meetings/review/');}
  if(type.includes('text/html'))body=body.replaceAll('/login-continuation/browser.js','/meetings/embedded-browser.js').replaceAll('Google Calendar 的活動','已建檔的會議');
  const responseHeaders=new Headers({...headers,'Content-Type':type});if(!text)for(const name of ['Content-Range','Accept-Ranges','Content-Length'])if(upstream.headers.has(name))responseHeaders.set(name,upstream.headers.get(name));
  return new Response(request.method==='HEAD'?null:body,{status:upstream.status,headers:responseHeaders});
 }catch(e){return Response.json({ok:false,error:e.status?e.message:'會議暫時無法連線，請保留內容後重試。'},{status:e.status||503,headers});}
}

export async function meetingAssets(request,response){
 if(response.status!==200||request.method!=='GET')return response;
 const path=new URL(request.url).pathname;
 if(!['/','/index.html','/calendar.js','/journal.js'].includes(path))return response;
 let body=await response.text();
 if(path==='/calendar.js'){
  // Add actions only while the personal calendar is rendering. Unit and demo
  // calendars deliberately keep their original read-only display.
  body+='\n'+`const meetingCalendarOriginal=renderPersonalCalendarPanel;
renderPersonalCalendarPanel=function(){const prior=calendarEventsHtml;calendarEventsHtml=function(events,...args){const html=prior(events,...args);if(calendarPrefs().demo)return html;const template=document.createElement('template');template.innerHTML=html;template.content.querySelectorAll('.calendar-event').forEach((row,i)=>{const event=events[i];if(!event?.id||event.status==='cancelled')return;const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent='會議建檔';b.dataset.meetingEvent=event.id;b.dataset.meetingDate=typeof selectedDate==='string'?selectedDate:'';row.append(b);});return template.innerHTML;};try{return meetingCalendarOriginal();}finally{calendarEventsHtml=prior;}};`;
 }
 if(path==='/journal.js')body=body.replace("project:'專案'","project:'專案',meetings:'會議'");
 if(path==='/'||path==='/index.html')body=body.replace('</body>','<script defer src="/dailylog-meetings-client.js"></script></body>');
 const h=new Headers(response.headers);for(const key of ['Content-Length','Content-Encoding','ETag'])h.delete(key);h.set('Cache-Control','private, no-store');return new Response(body,{status:response.status,headers:h});
}

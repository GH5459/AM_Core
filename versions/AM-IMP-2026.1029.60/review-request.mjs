// A single combined read can share its original session verification. Nothing is
// cached on the Durable Object, in the browser, or across subsequent requests.
export async function scopedReviewBootstrap(app,request,readBootstrap){
 const origin=new URL(request.url).origin,cookie=request.headers.get('Cookie')||'';
 const scoped=Object.create(app);let flight,sessionMs=0;
 scoped.session=function(candidate,create=false){
  const url=new URL(candidate.url);
  if(create||candidate.method!=='GET'||url.origin!==origin||url.search||
    !['/api/uof-review/session','/api/uof-review/web-pending'].includes(url.pathname)||
    (candidate.headers.get('Cookie')||'')!==cookie)return app.session(candidate,create);
  if(!flight){const started=performance.now();flight=Promise.resolve().then(()=>app.session(candidate,false)).finally(()=>{sessionMs=performance.now()-started;});}
  return flight;
 };
 const start=performance.now(),response=await readBootstrap(request,scoped),headers=new Headers(response.headers);
 headers.append('Server-Timing','entry_session;dur='+sessionMs.toFixed(1)+', entry_bootstrap;dur='+(performance.now()-start).toFixed(1));
 return new Response(response.body,{status:response.status,headers});
}

// The caller has already performed the original session and current permission
// checks. This changes only provisioning bookkeeping and duplicate profile reads.
export async function sessionBootstrap({user,management,readProfile,registrationStatus,register,ctx}){
 if(!user)return {};
 const [values,status]=await Promise.all([readProfile(),management?null:registrationStatus()]);
 if(!management){
  if(status.state==='not_registered')await register(values);
  else ctx.waitUntil(register(values).catch(()=>{}));
 }
 return values;
}

export async function preloadGoogleConfig(request,response){
 if(request.method!=='GET'||response.status!==200||!['/','/index.html','/line-entry'].includes(new URL(request.url).pathname)||!response.headers.get('Content-Type')?.includes('text/html'))return response;
 let html=await response.clone().text();
 if(!html.includes('id="personalWorkspace"')||!/<script\b[^>]*\bsrc="\/?google-config\.js"[^>]*>/i.test(html))return response;
 // This is the original authenticated, no-store configuration request. Fetch it
 // earlier without changing its execution order or caching its response.
 html=html.replace(/<head(?:\s[^>]*)?>/i,head=>head+'<link rel="preload" as="script" href="/google-config.js">');
 const headers=new Headers(response.headers);for(const key of ['Content-Length','Content-Encoding','ETag'])headers.delete(key);
 return new Response(html,{status:response.status,headers});
}

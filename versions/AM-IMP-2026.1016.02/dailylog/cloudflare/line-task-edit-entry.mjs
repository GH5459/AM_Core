// Preserve the original protected task link across normal company login.
// This URL is a locator only; task and attachment authorization remain unchanged.
export function taskReturnPath(value){
 try{const u=new URL(value,'https://task.invalid');
  if(u.origin!=='https://task.invalid'||!['/','/index.html'].includes(u.pathname)||u.hash)return null;
  const id=u.searchParams.get('task');if(!/^[\w-]{1,100}$/.test(id||''))return null;
  if([...u.searchParams.keys()].some(k=>!['task','openExternalBrowser'].includes(k)))return null;
  return '/?'+new URLSearchParams({task:id}).toString();
 }catch{return null;}
}
export function taskEditResponse(request,result){
 const u=new URL(request.url);let target=null;
 if(request.method==='GET'&&[301,302,303,307,308].includes(result.status)){
  const location=result.headers.get('Location'),dest=location?new URL(location,u):null;
  if(dest?.origin===u.origin&&['/login','/login.html'].includes(dest.pathname)&&['/','/index.html'].includes(u.pathname)){
   const path=taskReturnPath(u.pathname+u.search);if(path)target='/login?'+new URLSearchParams({returnTo:path}).toString();
  }else if(['/login','/login.html'].includes(u.pathname)&&dest?.origin===u.origin&&dest.pathname==='/')target=taskReturnPath(u.searchParams.get('returnTo'));
 }
 if(!target)return result;
 const headers=new Headers(result.headers);headers.set('Location',target);headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');
 return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
}

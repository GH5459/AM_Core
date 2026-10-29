// Only identity-independent program files belong here. Bootstrap, configuration,
// HTML and every data/API response retain their original no-store policy.
export const FIXED_FILES = new Set([
 '/auth-client.js','/private-data.js','/private-vault-shell.js',
 '/journal-sync-merge.js','/notion-sync-client.js','/calendar.js','/journal.js',
 '/project-identity.js','/tasks.js','/mobile.js','/hr-tree.js',
 '/hr-project-page.js','/hr-component.js','/routine-libraries.js',
 '/notion-account.js','/task-attachments.js',
 '/calendar.css','/journal.css','/mobile.css','/tasks.css',
 '/notion-account.css','/task-attachments.css','/private-vault-shell.css','/project-identity.css'
]);
export const VERSION_BINDING = {type:'version_metadata',name:'DAILYLOG_RUNTIME_VERSION'};

export async function firstScreenAssets(request,response,env){
 if(request.method!=='GET'||response.status!==200)return response;
 const url=new URL(request.url),version=env.DAILYLOG_RUNTIME_VERSION?.id;
 if(typeof version!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(version))return response;
 const type=response.headers.get('Content-Type')||'';
 const headers=new Headers(response.headers);
 if(FIXED_FILES.has(url.pathname)){
  // A request from an older open page must never cache the current code under
  // its old version key. Cookie-bearing or unexpected responses cannot cache.
  if(url.searchParams.size===1&&url.searchParams.get('assetVersion')===version
    &&!headers.has('Set-Cookie')&&/^(?:text\/(?:javascript|css)|application\/javascript)\b/i.test(type)){
   headers.set('Cache-Control','private, max-age=31536000, immutable');
   return new Response(response.body,{status:response.status,headers});
  }
  return response;
 }
 if(!['/','/index.html','/line-entry'].includes(url.pathname)||!type.includes('text/html'))return response;
 let html=await response.clone().text();
 if(!html.includes('id="personalWorkspace"'))return response;
 const preloads=new Set();
 html=html.replace(/<(script|link)\b[^>]*>/gi,tag=>tag.replace(/\b(src|href)="([^"]+)"/gi,(attr,name,value)=>{
  const asset=new URL(value.replaceAll('&amp;','&'),url);
  if(asset.origin!==url.origin||asset.search||asset.hash||!FIXED_FILES.has(asset.pathname))return attr;
  asset.searchParams.set('assetVersion',version);
  const href=asset.pathname+asset.search;
  if(/^<script\b/i.test(tag))preloads.add(href);
  return name+'="'+href+'"';
 }));
 // Fetch in parallel while preserving all existing script execution order,
 // DOMContentLoaded handlers and inline program dependencies.
 html=html.replace(/<head(?:\s[^>]*)?>/i,head=>head+[...preloads].map(href=>'<link rel="preload" as="script" href="'+href+'">').join(''));
 for(const key of ['Content-Length','Content-Encoding','ETag'])headers.delete(key);
 headers.set('Cache-Control','private, no-store');
 headers.set('X-DailyLog-First-Screen','parallel-bootstrap-versioned-assets-v1');
 return new Response(html,{status:response.status,headers});
}

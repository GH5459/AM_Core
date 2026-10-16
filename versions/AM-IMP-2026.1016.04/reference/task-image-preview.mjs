export const TASK_IMAGE_POLICY='task-image-preview-v1';
export function rasterType(bytes){
 if(bytes.length<12)return null;
 if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(ascii(0,2)==='BM')return 'image/bmp';
 if(ascii(4,8)==='ftyp'&&['avif','avis'].includes(ascii(8,12)))return 'image/avif';
 return null;
}
export async function taskImageFetch(request,env,ctx,base){
 const url=new URL(request.url);if(request.method!=='GET'||!/^\/api\/attachments\/normal\/[\w-]{1,100}\/[\w-]{1,100}\/preview$/.test(url.pathname))return null;
 url.pathname=url.pathname.slice(0,-8);url.search='';
 // All session, task-read/current access and removed-file checks stay in the original route.
 const original=await base.fetch(new Request(url,request),env,ctx);if(original.status!==200)return original;
 const bytes=new Uint8Array(await original.arrayBuffer()),mime=rasterType(bytes);
 if(!mime)return Response.json({error:'此檔案無法顯示圖片預覽，請下載原檔。'},{status:415,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 const headers=new Headers(original.headers);headers.set('Content-Type',mime);headers.set('Content-Disposition','inline');headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',"default-src 'none'; img-src 'self'; sandbox; frame-ancestors 'none'");headers.set('X-DailyLog-Image-Policy',TASK_IMAGE_POLICY);return new Response(bytes,{status:200,headers});
}

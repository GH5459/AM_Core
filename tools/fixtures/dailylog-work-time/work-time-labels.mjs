export async function workTimeLabelsResponse(request,response){
 const route=new URL(request.url).pathname;
 if(request.method!=='GET'||response.status!==200||!['/tasks.js','/hr-component.js','/hr-project-page.js'].includes(route))return response;
 let source=await response.text();
 if(route==='/hr-project-page.js'){
  source=source.replaceAll("${t.minutes===null?'未填工時':esc(t.minutes)+' mins'}","${t.minutes===null?'':esc(t.minutes)+' mins'}");
 }else{
  source=source.replace("const label=n=>valid(n)?number(n)+' mins':'未填工時';","const label=n=>valid(n)?number(n)+' mins':'';");
  source=source.replace("const html=n=>'<small class=\"work-time-label\">'+label(n)+'</small>';","const html=n=>valid(n)?'<small class=\"work-time-label\">'+label(n)+'</small>':'';");
 }
 const result=new Response(source,response);for(const name of ['Content-Length','ETag','Content-Encoding'])result.headers.delete(name);result.headers.set('Cache-Control','private, no-store');return result;
}

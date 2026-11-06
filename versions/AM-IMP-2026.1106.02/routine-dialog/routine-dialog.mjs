// Moving a shadow host out of the document removes its dialogs from the native
// top layer but leaves their open attributes and unsaved form contents intact.
export async function routineDialogResponse(request,response){
 if(request.method!=='GET'||new URL(request.url).pathname!=='/routine-libraries.js'||response.status!==200)return response;
 let source=await response.text();
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Routine dialog mount anchor changed');source=source.replace(from,to);};
 replace("const parking=document.createElement('div');","const routineDialogFocus=new WeakMap();function rememberRoutineDialog(c){const active=c.root.activeElement;if(active?.closest('dialog[open]'))routineDialogFocus.set(c,active);}\n const parking=document.createElement('div');");
 replace('for(const c of components.values())if(c.host.parentNode!==parking)parking.append(c.host);','for(const c of components.values())if(c.host.parentNode!==parking){rememberRoutineDialog(c);parking.append(c.host);}');
 replace('park(){for(const c of components.values())parking.append(c.host);}','park(){for(const c of components.values()){rememberRoutineDialog(c);parking.append(c.host);}}');
 replace('for(const c of ready)slot.append(c.host);await Promise.allSettled',"for(const c of ready){slot.append(c.host);const active=routineDialogFocus.get(c);for(const dialog of c.root.querySelectorAll('dialog[open]')){if(dialog.matches(':modal'))continue;dialog.removeAttribute('open');dialog.showModal();if(active&&dialog.contains(active))active.focus({preventScroll:true});}routineDialogFocus.delete(c);}await Promise.allSettled");
 const headers=new Headers(response.headers);for(const key of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(key);headers.set('Cache-Control','private, no-store');
 return new Response(source,{status:response.status,statusText:response.statusText,headers});
}

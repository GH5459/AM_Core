// task-image-preview-v1: use the existing protected attachment metadata and URLs.
(()=>{
 const panels=new WeakMap(),imageFile=f=>!f.removedAt&&(/^image\//i.test(f.mime||'')||/\.(?:png|jpe?g|gif|webp|avif|bmp|heic|heif)$/i.test(f.name||''));
 function render(owner,state,readOnly=false){
  if(!owner.isConnected||state.scope!=='normal'||!state.id)return;
  const dialog=owner.closest('#taskCardDialog'),body=dialog?.querySelector('.dialog-body');if(!body||(!readOnly&&dialog.dataset.cardLayout==='timeline'))return;
  let panel=panels.get(owner);const files=state.loaded?(state.files||[]).filter(imageFile):[];
  if(!files.length){panel?.remove();panels.delete(owner);return;}
  if(!panel?.isConnected){panel=document.createElement('section');panel.className='task-image-gallery';panel.dataset.taskImages='true';panel.setAttribute('aria-label','任務圖片');const title=document.createElement('h3');title.textContent='圖片';panel.append(title);body.append(panel);panels.set(owner,panel);}
  const signature=JSON.stringify(files.map(f=>[f.id,f.name,f.mime]));
  if(panel.dataset.signature!==signature){
   panel.dataset.signature=signature;panel.querySelectorAll('figure').forEach(e=>e.remove());
   files.forEach((file,index)=>{
    const route='/api/attachments/normal/'+encodeURIComponent(state.id)+'/'+encodeURIComponent(file.id),preview=route+'/preview',figure=document.createElement('figure'),link=document.createElement('a'),img=document.createElement('img'),caption=document.createElement('figcaption'),name=document.createElement('span'),download=document.createElement('a'),error=document.createElement('div'),retry=document.createElement('button');
    link.href=preview;link.target='_blank';link.rel='noopener noreferrer';link.className='task-image-open';link.setAttribute('aria-label','開啟原圖：'+file.name);
    img.alt=file.name;img.decoding='async';img.loading=index===0?'eager':'lazy';img.src=preview;link.append(img);
    error.className='task-image-error';error.hidden=true;const message=document.createElement('span');message.textContent='圖片暫時無法顯示，可重試或下載原檔。';retry.type='button';retry.textContent='重試圖片';error.append(message,retry);
    img.addEventListener('error',()=>{link.hidden=true;error.hidden=false;retry.disabled=false;});img.addEventListener('load',()=>{link.hidden=false;error.hidden=true;retry.disabled=false;});
    retry.addEventListener('click',()=>{retry.disabled=true;link.hidden=false;error.hidden=true;img.src=preview+'?retry='+Date.now();});
    name.textContent=file.name;download.href=route;download.download='';download.textContent='下載原檔';caption.append(name,download);figure.append(link,error,caption);panel.append(figure);
   });
  }
  // The existing editor builds its collapsed sections synchronously after mount.
  // Move this separate reading panel back to the main content after that layout.
  queueMicrotask(()=>{if(!owner.isConnected||!panel.isConnected||!body.contains(owner))return;const focus=body.querySelector('.task-overview-focus');if(focus){if(focus.nextElementSibling!==panel)focus.after(panel);}else if(body.firstElementChild!==panel)body.prepend(panel);});
 }
 function readOnly(dialog,id){
  const body=dialog.querySelector('.dialog-body');if(!body)return;
  const owner=document.createElement('span');owner.hidden=true;owner.dataset.taskImageReader='';body.append(owner);
  fetch('/api/attachments/normal/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('unavailable');return r.json();}).then(packet=>{if(owner.isConnected)render(owner,{scope:'normal',id,files:packet.attachments,loaded:true},true);}).catch(()=>{if(owner.isConnected){owner.hidden=false;owner.textContent='圖片尚未載入，請重新載入任務。';}});
 }
 window.dailylogTaskImages={render,readOnly};
})();

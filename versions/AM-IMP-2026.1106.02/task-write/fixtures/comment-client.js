 // Quick replies reuse the original protected comment and attachment endpoints.
 function quickCommentHtml(value,taskId){
  return String(value||'').split(/(https?:\/\/[^\s<>"']+)/g).map((piece,index)=>{
   if(index%2===0)return esc(piece);
   const suffix=piece.match(/[，。！？、；：,.!?;:）)]+$/)?.[0]||'',raw=suffix?piece.slice(0,-suffix.length):piece;
   let url;try{url=new URL(raw);}catch{return esc(piece);}
   const image=url.origin===location.origin&&url.pathname.startsWith('/api/attachments/normal/'+encodeURIComponent(taskId)+'/')&&/^\/api\/attachments\/normal\/[\w-]+\/att-[\w-]+\/preview$/.test(url.pathname);
   let name='圖片';try{name=decodeURIComponent(url.hash.slice(1))||name;}catch{}
   return `<a ${image?'class="task-comment-image" ':''}href="${esc(raw)}" target="_blank" rel="noopener noreferrer"${image?' aria-label="開啟圖片：'+esc(name)+'" title="'+esc(name)+'"':''}>${image?'📷':esc(raw)}</a>${esc(suffix)}`;
  }).join('');
 }
 const quickCommentDrafts=new Map(),quickCommentJobs=new Map();
 let quickCommentOpening=false,quickCommentDb;
 const quickCommentOwner=()=>{const user=window.DAILYLOG_AUTH?.user;return user?.id&&user?.account?user.id+':'+user.account.trim().toLowerCase():'';};
 function openQuickCommentDb(){return quickCommentDb??=new Promise((resolve,reject)=>{const r=indexedDB.open('dailylog-quick-comment-outbox-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('jobs',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{quickCommentDb=null;reject(r.error);};});}
 async function storeQuickComment(job,remove=false){const db=await openQuickCommentDb();return new Promise((resolve,reject)=>{const tx=db.transaction('jobs','readwrite'),store=tx.objectStore('jobs'),{busy,...record}=job;if(remove)store.delete(job.id);else store.put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('裝置未能保留留言與照片。'));});}
 function quickCommentStatus(id){
  const jobs=[...quickCommentJobs.values()].filter(j=>j.owner===quickCommentOwner()&&j.taskId===id);
  return jobs.map(j=>`<span class="quick-comment-state ${j.state==='failed'?'quick-comment-failed':''}">${j.state==='failed'?'留言尚未確認送出':'留言送出中…'}${j.state==='failed'?` <button type="button" class="text-link" data-quick-comment-retry="${esc(j.id)}">重試送出</button>`:''}</span>`).join('');
 }
 function paintQuickComments(){
  const jobs=[...quickCommentJobs.values()].filter(j=>j.owner===quickCommentOwner());
  let tray=document.querySelector('#quickCommentOutbox');const main=document.querySelector('main');if(!main)return;
  if(!tray){tray=document.createElement('aside');tray.id='quickCommentOutbox';tray.setAttribute('aria-label','留言送出狀態');tray.setAttribute('aria-live','polite');main.prepend(tray);}
  tray.hidden=!jobs.length;const signature=JSON.stringify(jobs.map(j=>[j.id,j.state,j.error]));
  if(tray.dataset.signature!==signature){tray.dataset.signature=signature;tray.innerHTML=jobs.map(j=>`<div class="quick-comment-job ${j.state==='failed'?'quick-comment-failed':''}" data-comment-job="${esc(j.id)}"><span>${esc(j.title)}：${j.state==='failed'?'留言尚未確認送出':'留言送出中…'}</span>${j.state==='failed'?`<small>${esc(j.error||'上次送出尚未確認。')}（文字與照片已保留）</small><button type="button" class="btn small" data-quick-comment-retry="${esc(j.id)}">重試送出</button><details><summary>查看待送留言</summary><p>${quickCommentHtml(j.text,j.taskId)}</p><small>照片 ${j.files.length} 張</small></details>`:''}</div>`).join('');}
  for(const el of document.querySelectorAll('[data-quick-comment-status]')){const html=quickCommentStatus(el.dataset.quickCommentStatus);if(el.innerHTML!==html)el.innerHTML=html;}
 }
 async function restoreQuickComments(){try{const db=await openQuickCommentDb(),records=await new Promise((resolve,reject)=>{const r=db.transaction('jobs').objectStore('jobs').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const record of records)if(record.owner===quickCommentOwner()&&!quickCommentJobs.has(record.id))quickCommentJobs.set(record.id,{...record,state:'failed',busy:false,error:'上次送出尚未確認，請重試。'});paintQuickComments();}catch{ /* A new send stays open if device persistence is unavailable. */ }}
 async function runQuickComment(job){
  const checkOwner=()=>{if(!job.owner||job.owner!==quickCommentOwner())throw Error('登入帳號已變更，請用原帳號重試。');};
  try{
   checkOwner();job.state='sending';job.error='';await storeQuickComment(job);paintQuickComments();
   let latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task;checkOwner();
   if(!(latest.history||[]).some(h=>h.id===job.id)){
    for(const file of job.files){checkOwner();if(file.saved)continue;const body=new FormData();body.append('id',file.id);body.append('file',file.file);
     const r=await fetch('/api/attachments/normal/'+encodeURIComponent(job.taskId),{method:'POST',body,credentials:'same-origin',headers:{'X-DailyLog-CSRF':window.DAILYLOG_AUTH?.csrfToken||''}}),value=await r.json();checkOwner();if(!r.ok)throw Error(value.error||'照片上傳失敗，請重試。');file.saved=true;await storeQuickComment(job);
    }
    latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task;checkOwner();
    job.packet.version=latest.version;await storeQuickComment(job);checkOwner();
    for(let attempt=0;attempt<4;attempt++){
     checkOwner();try{latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId),job.packet)).task;checkOwner();break;}
     catch(e){if(e.status!==409||attempt===3)throw e;checkOwner();latest=(await dailylogRequest('/api/tasks/'+encodeURIComponent(job.taskId))).task;checkOwner();if(!Number.isSafeInteger(latest.version)||latest.version<=job.packet.version)throw e;job.packet.version=latest.version;await storeQuickComment(job);}
    }
   }
   if(latest?.id!==job.taskId||!Number.isSafeInteger(latest.version)||!latest.history?.some(h=>h.id===job.id&&h.kind==='comment'&&h.text===job.packet.text))throw Error('尚未收到留言保存確認，請重試。');
   await storeQuickComment(job,true);checkOwner();quickCommentJobs.delete(job.id);if((taskFor(job.taskId)?.version||0)<=latest.version)accept(latest);paintQuickComments();toast('留言已送出。');
  }catch(e){job.state='failed';job.error=e.message;quickCommentJobs.set(job.id,job);try{await storeQuickComment(job);}catch{job.error+='；裝置保存暫時失敗，請保留此頁。';}paintQuickComments();toast('留言尚未確認送出，文字與照片已保留。');}
 }
 async function sendQuickComment(id){
  const job=quickCommentJobs.get(id);if(!job||job.busy||job.owner!==quickCommentOwner())return;job.busy=true;
  try{
   if(navigator.locks)await navigator.locks.request('dailylog-comment:'+job.owner+':'+job.id,{ifAvailable:true},async lock=>{if(lock)return runQuickComment(job);job.state='failed';job.error='另一個頁面正在送出這則留言，請稍後再試。';paintQuickComments();});
   else await runQuickComment(job);
  }catch(e){job.state='failed';job.error=e.message;try{await storeQuickComment(job);}catch{}paintQuickComments();}finally{job.busy=false;}
 }
 function movableQuickComment(node){
  const title=node.querySelector('h2');title.tabIndex=0;title.title='拖曳標題移動；也可用方向鍵移動';title.setAttribute('aria-label','留言，拖曳標題或用方向鍵移動視窗');
  const viewport=()=>({left:window.visualViewport?.offsetLeft||0,top:window.visualViewport?.offsetTop||0,width:window.visualViewport?.width||innerWidth,height:window.visualViewport?.height||innerHeight});
  const move=(x,y)=>{const v=viewport();node.style.maxHeight=Math.max(100,v.height-16)+'px';const r=node.getBoundingClientRect();node.style.left=Math.max(v.left+8,Math.min(x,v.left+v.width-r.width-8))+'px';node.style.top=Math.max(v.top+8,Math.min(y,v.top+v.height-r.height-8))+'px';};
  let drag=null;title.addEventListener('pointerdown',e=>{if(e.button!==0||!e.isPrimary)return;const r=node.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};title.setPointerCapture(e.pointerId);node.dataset.dragging='true';e.preventDefault();});
  title.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)move(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
  const end=()=>{drag=null;delete node.dataset.dragging;};for(const name of ['pointerup','pointercancel','lostpointercapture'])title.addEventListener(name,end);
  title.addEventListener('keydown',e=>{const steps={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]},step=steps[e.key];if(step){e.preventDefault();const r=node.getBoundingClientRect();move(r.left+step[0],r.top+step[1]);}});
  const keep=()=>{const r=node.getBoundingClientRect();move(r.left,r.top);};const sizes=window.ResizeObserver?new ResizeObserver(keep):null;sizes?.observe(node);window.addEventListener('resize',keep);window.visualViewport?.addEventListener('resize',keep);window.visualViewport?.addEventListener('scroll',keep);
  const v=viewport();move(v.left+v.width-node.getBoundingClientRect().width-16,v.top+Math.min(100,Math.max(8,(v.height-node.getBoundingClientRect().height)/2)));
  return ()=>{sizes?.disconnect();window.removeEventListener('resize',keep);window.visualViewport?.removeEventListener('resize',keep);window.visualViewport?.removeEventListener('scroll',keep);};
 }
 async function openQuickComment(id){
  if(quickCommentOpening||document.querySelector('#quickCommentDialog'))return;
  quickCommentOpening=true;
  try{
   const task=taskFor(id);if(!task)throw Error('任務尚未載入，請稍後重試。');
   if(task.deletedAt)throw Error('這項任務已刪除，無法留言。');
   const composerOwner=quickCommentOwner(),draftKey=composerOwner+':'+id,state=quickCommentDrafts.get(draftKey)||{text:'',files:[]};quickCommentDrafts.set(draftKey,state);
   const node=document.createElement('dialog');node.id='quickCommentDialog';node.className='quick-comment-dialog';node.setAttribute('aria-labelledby','quickCommentTitle');
   node.innerHTML='<form><h2 id="quickCommentTitle">留言</h2><textarea class="field" name="text" rows="4" maxlength="2000" aria-label="留言內容" placeholder="寫留言、貼上連結…"></textarea><label class="photo-picker">＋ 加入照片<input type="file" name="photos" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" multiple aria-label="選擇照片" hidden></label><ul data-quick-photos></ul><p role="status" aria-live="polite"></p><footer><button type="button" class="btn" data-quick-close>取消</button><button type="submit" class="btn primary">送出</button></footer></form>';
   document.body.append(node);const form=node.querySelector('form'),text=form.elements.text,photos=form.elements.photos,status=node.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');text.value=state.text;let busy=false;
   const picker=node.querySelector('.photo-picker');picker.tabIndex=0;picker.setAttribute('role','button');picker.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!photos.disabled)photos.click();}};
   const feedback=message=>status.textContent=message;let stopMoving=()=>{};
   function paint(){
    node.querySelector('[data-quick-photos]').innerHTML=state.files.map((f,i)=>`<li>${esc(f.file.name)}<button type="button" class="text-link quick-photo-remove" data-quick-remove="${i}" ${busy?'disabled':''}>移除</button></li>`).join('');
    text.disabled=busy;photos.disabled=busy;submit.disabled=busy;node.querySelector('[data-quick-close]').disabled=busy;submit.textContent=busy?'準備送出…':'送出';
   }
   const dismiss=()=>{stopMoving();node.close();node.remove();};
   const close=()=>{if(busy)return;state.text=text.value;if(!state.text.trim()&&!state.files.length)quickCommentDrafts.delete(draftKey);dismiss();};
   node.addEventListener('cancel',event=>{event.preventDefault();close();});node.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});node.querySelector('[data-quick-close]').onclick=close;
   text.oninput=()=>{state.text=text.value;};
   node.querySelector('[data-quick-photos]').onclick=event=>{const b=event.target.closest('[data-quick-remove]');if(!b||busy)return;state.files.splice(Number(b.dataset.quickRemove),1);paint();};
   photos.onchange=()=>{
    const selected=[...photos.files];photos.value='';
    if(state.files.length+selected.length>10){feedback('每則留言最多附上 10 張照片。');return;}
    if(selected.some(f=>!/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(f.type)||f.size>10*1048576)){feedback('請選擇 PNG、JPG、GIF、WebP、AVIF 或 BMP 圖片，每張不超過 10 MB。');return;}
    for(const file of selected)state.files.push({file,id:'att-'+crypto.randomUUID(),saved:false});feedback('');paint();
   };
   form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;state.text=text.value;
    if(!composerOwner||composerOwner!==quickCommentOwner()){feedback('登入帳號已變更，請用原帳號重新開啟留言。');return;}
    if(!state.text.trim()&&!state.files.length){feedback('請輸入留言或選擇照片。');text.focus();return;}
    const imageUrl=f=>location.origin+'/api/attachments/normal/'+encodeURIComponent(id)+'/'+f.id+'/preview#'+encodeURIComponent(f.file.name);
    const content=[state.text.trim(),...state.files.map(imageUrl)].filter(Boolean).join('\n');
    if(content.length>2000){feedback('留言與照片連結合計太長，請縮短文字或減少照片。');return;}
    busy=true;paint();feedback('');
    try{
     const operationId=state.operationId||'op-'+crypto.randomUUID();state.operationId=operationId;
     const job={id:operationId,taskId:id,title:task.title,owner:composerOwner,text:state.text,files:state.files.map(f=>({...f})),packet:{kind:'comment',text:content,mentions:[],operationId,version:task.version},state:'pending',createdAt:Date.now()};
     // Only device persistence is awaited. No network request may keep this window open.
     await storeQuickComment(job);quickCommentJobs.set(job.id,job);quickCommentDrafts.delete(draftKey);dismiss();paintQuickComments();toast('留言正在背景送出。');void sendQuickComment(job.id);
    }catch(e){feedback('尚未送出：裝置無法保留留言與照片，內容仍留在這裡，請重試。');}
    finally{busy=false;if(node.isConnected)paint();}
   };
   paint();node.show();stopMoving=movableQuickComment(node);text.focus({preventScroll:true});
  }finally{quickCommentOpening=false;}
 }
 document.addEventListener('click',event=>{const retry=event.target.closest('[data-quick-comment-retry]');if(retry){event.preventDefault();void sendQuickComment(retry.dataset.quickCommentRetry);return;}const b=event.target.closest('[data-quick-comment]');if(!b)return;event.preventDefault();event.stopPropagation();openQuickComment(b.dataset.quickComment).catch(e=>toast(e.message));});
 const startQuickComments=()=>{void restoreQuickComments();const main=document.querySelector('main');if(main)new MutationObserver(paintQuickComments).observe(main,{childList:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startQuickComments,{once:true});else queueMicrotask(startQuickComments);
 window.addEventListener('beforeunload',event=>{if([...quickCommentDrafts.values()].some(s=>s.text.trim()||s.files.length)){event.preventDefault();event.returnValue='';}});

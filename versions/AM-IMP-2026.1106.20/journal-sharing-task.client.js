 const journalShareBusy=new Set();
 const journalShareKey=()=> 'dailylog-journal-share-pending:'+me();
 function journalSharePending(){try{return JSON.parse(localStorage.getItem(journalShareKey())||'{}');}catch{return {};}}
 function journalShareRemember(id,previewId){const v=journalSharePending();if(previewId)v[id]=previewId;else delete v[id];localStorage.setItem(journalShareKey(),JSON.stringify(v));paintJournalSharePending();}
 function paintJournalSharePending(){let n=document.getElementById('journalSharePending');if(!n){n=document.createElement('aside');n.id='journalSharePending';document.querySelector('main')?.prepend(n);}const ids=Object.keys(journalSharePending());n.hidden=!ids.length;n.innerHTML=ids.map(id=>'<div class="task-save-job">分享結果待確認 <button type="button" class="btn" data-journal-share="'+esc(id)+'">查看原分享</button></div>').join('');}
 function personalReportButton(t){return t&&!t.deletedAt&&[t.lead,...t.collaborators||[]].some(p=>p?.account===me())?'<button type="button" class="btn small" data-journal-share="'+esc(t.id)+'">分享至工作日誌</button>':'';}
 function mountPersonalReport(){
  const node=dialog(),t=active?.task;if(!node.open||!t)return;
  const form=node.querySelector('#taskEditForm'),host=form?.querySelector('.card-save-actions')||node.querySelector('.task-card-actions')||node.querySelector('.dialog-body');if(!host)return;
  let box=node.querySelector('[data-journal-share-card]');if(!box){box=document.createElement('div');box.dataset.journalShareCard='';host.append(box);}
  if(!form){box.innerHTML=personalReportButton(t);return;}
  if(!box.childNodes.length)box.innerHTML='<button type="button" class="btn" data-save-journal-share>儲存並分享至工作日誌</button><small>儲存成功後選擇對象；確認分享才會出現在對方日誌，不傳送 LINE。</small>';
  box.hidden=!!t.deletedAt||![t.lead,...t.collaborators||[]].some(p=>p?.account===me());
  box.querySelector('button').disabled=form.dataset.readReady==='false';
 }
 function personalReportSaved(id){void openJournalShare(id);}
 async function openJournalShare(id){
  if(document.getElementById('journalShareDialog')||journalShareBusy.has(id))return;
  const editor=dialog().querySelector('#taskEditForm')||dialog().querySelector('#taskStatusForm');if(dialog().open&&editor&&cardDirty(editor)){toast('請先儲存修改，再分享。');return;}
  const account=me(),node=document.createElement('dialog');node.id='journalShareDialog';node.className='journal-share-dialog';
  node.innerHTML='<div class="dialog-head"><h2>分享至工作日誌</h2></div><div class="dialog-body"><p role="status">正在讀取公司組織…</p></div><div class="dialog-foot"><button type="button" class="btn" data-share-cancel>取消</button></div>';
  document.body.append(node);node.showModal();let busy=false,preview=null;
  const error=text=>{node.querySelector('[role=status]').textContent=text;};
  node.querySelector('[data-share-cancel]').onclick=()=>{if(!busy)node.close();};node.oncancel=e=>{if(busy)e.preventDefault();};node.onclose=()=>node.remove();
  try{
   const pending=journalSharePending()[id];
   if(pending){
    const r=await dailylogRequest('/api/journal-sharing/receipt?id='+encodeURIComponent(pending));if(!node.open||me()!==account)return;
    node.querySelector('.dialog-body').innerHTML='<h3>'+esc(r.snapshot.title)+'</h3><p>'+r.people.map(p=>esc(p.name)).join('、')+'</p><p class="share-result">'+esc(r.snapshot.result)+'</p><p role="status">'+(r.state==='sent'?'這次分享已儲存成功。':'這次分享尚未完成，可重試原分享或重新選擇。')+'</p>';
    const redo=document.createElement('button');redo.type='button';redo.className='btn';redo.textContent='重新選擇分享對象';redo.onclick=()=>{journalShareRemember(id,null);node.close();void openJournalShare(id);};node.querySelector('.dialog-foot').append(redo);
    if(r.state==='sent')journalShareRemember(id,null);
    else{const retry=document.createElement('button');retry.type='button';retry.className='btn primary';retry.textContent='重試原分享';retry.onclick=async()=>{if(busy||me()!==account)return;busy=true;retry.disabled=redo.disabled=true;try{const result=await dailylogRequest('/api/journal-sharing/share',{action:'confirm',previewId:pending});if(result.state!=='sent')throw Error('分享尚未確認。');journalShareRemember(id,null);node.close();toast('分享已確認保存。');}catch(e){error(e.message);}finally{busy=false;retry.disabled=redo.disabled=false;}};node.querySelector('.dialog-foot').append(retry);}return;
   }
   const [d,read]=await Promise.all([dailylogRequest('/api/journal-sharing/directory'),dailylogRequest('/api/tasks/'+id)]);
   if(!node.open||me()!==account)return;const task=read.task,org=d.organization,people=org.people.filter(p=>p.account!==account),selected=new Set(),departments=org.departments||[];
   const person=p=>'<label class="journal-share-person"><input type="checkbox" data-share-person="'+esc(p.account)+'">'+esc(p.name)+' <small>'+esc(p.department||p.account)+'</small></label>';
   const tree=(parent,seen=new Set())=>departments.filter(d=>(d.parentId||null)===parent&&!seen.has(d.id)).map(d=>'<details><summary>'+esc(d.name)+'</summary>'+people.filter(p=>p.departments?.includes(d.id)).map(person).join('')+tree(d.id,new Set([...seen,d.id]))+'</details>').join('');
   const placed=new Set(departments.map(d=>d.id)),loose=people.filter(p=>!p.departments?.some(d=>placed.has(d)));
   node.querySelector('.dialog-body').innerHTML='<p><strong>'+esc(task.title)+'</strong></p><p>分享已儲存的完成結果或進度。對方在「分享給我的更新」查看，不會增加 LINE 推播。</p><label>搜尋同仁<input class="field" type="search" data-share-search placeholder="姓名或工號"></label><div data-share-tree>'+tree(null)+loose.map(person).join('')+'</div><div data-share-search-results hidden></div><p data-share-count>已選 0 人</p>'+(task.meetingSource?.workspaceId?'<label class="journal-share-person"><input type="checkbox" data-share-meeting>分享給本場會議所有人</label>':'')+'<button type="button" class="btn" data-share-groups>選擇 LINE 群組成員</button><div data-share-group-list></div><div data-share-preview></div><p role="status" aria-live="polite"></p>';
   const next=document.createElement('button');next.type='button';next.className='btn primary';next.textContent='預覽分享';node.querySelector('.dialog-foot').append(next);
   function invalidate(){preview=null;next.textContent='預覽分享';node.querySelector('[data-share-preview]').replaceChildren();error('');}
   node.addEventListener('change',e=>{if(e.target.dataset.sharePerson){const key=e.target.dataset.sharePerson;if(e.target.checked)selected.add(key);else selected.delete(key);for(const input of node.querySelectorAll('[data-share-person]'))input.checked=selected.has(input.dataset.sharePerson);node.querySelector('[data-share-count]').textContent='已選 '+selected.size+' 人';}invalidate();});
   node.querySelector('[data-share-search]').oninput=e=>{const q=e.target.value.trim().toLowerCase(),results=node.querySelector('[data-share-search-results]');node.querySelector('[data-share-tree]').hidden=!!q;results.hidden=!q;results.innerHTML=q?people.filter(p=>(p.name+' '+p.account+' '+p.department).toLowerCase().includes(q)).map(person).join('')||'<p>找不到同仁。</p>':'';for(const input of results.querySelectorAll('input'))input.checked=selected.has(input.dataset.sharePerson);};
   let offset=0;node.querySelector('[data-share-groups]').onclick=async e=>{e.target.disabled=true;error('正在確認可使用的 LINE 群組…');try{const r=await dailylogRequest('/api/journal-sharing/groups?offset='+offset);if(!node.open||me()!==account)return;const box=node.querySelector('[data-share-group-list]');if(offset===0)box.innerHTML='<label class="journal-share-person"><input type="radio" name="shareGroup" value="" checked>不選群組</label>';for(const group of r.groups)box.insertAdjacentHTML('beforeend','<label class="journal-share-person"><input type="radio" name="shareGroup" value="'+esc(group.key)+'">'+esc(group.name)+'</label>');offset=r.next;e.target.hidden=offset===null;e.target.textContent='讀取更多群組';error(r.notice||(!r.groups.length?'此頁沒有可確認的群組。':''));}catch(e){error(e.message);}finally{e.target.disabled=false;}};
   next.onclick=async()=>{if(busy||me()!==account)return;busy=true;for(const b of node.querySelectorAll('button,input'))b.disabled=true;error(preview?'正在分享，請稍候…':'正在確認分享內容及對象…');try{
    if(preview){try{journalShareRemember(id,preview);}catch{throw Error('裝置無法保留分享識別，這次尚未送出。');}const result=await dailylogRequest('/api/journal-sharing/share',{action:'confirm',previewId:preview});if(result.state!=='sent')throw Error('尚未確認分享成功。');journalShareRemember(id,null);node.close();toast('已分享至 '+result.count+' 位同仁的工作日誌。');window.dispatchEvent(new Event('dailylog:shared'));return;}
    const r=await dailylogRequest('/api/journal-sharing/share',{action:'preview',taskId:id,accounts:[...selected],groupKey:node.querySelector('[name=shareGroup]:checked')?.value||null,meeting:!!node.querySelector('[data-share-meeting]')?.checked});if(!node.open||me()!==account)return;preview=r.previewId;
    node.querySelector('[data-share-preview]').innerHTML='<h3>確認分享 · '+r.people.length+' 人</h3><p>'+r.people.map(p=>esc(p.name)).join('、')+'</p>'+(r.warnings||[]).map(w=>'<p class="share-warning">'+esc(w)+'</p>').join('')+'<p><strong>'+(r.snapshot.category==='done'?'整項已完成':r.snapshot.personalDone?'已完成自己的部分':'進度更新')+'</strong></p><p class="share-result">'+esc(r.snapshot.result)+'</p><p>分享後顯示在對方今日的日誌，只分享上列內容。</p>';next.textContent='確認分享';error('確認對象與內容後，按下「確認分享」。');
   }catch(e){error(e.message+' 可保留此畫面重試；若內容或名單已改變，請重新選擇並預覽。');}finally{busy=false;for(const b of node.querySelectorAll('button,input'))b.disabled=false;}};
  }catch(e){error(e.message);}
 }
 document.addEventListener('click',e=>{const save=e.target.closest('[data-save-journal-share]');if(save){e.preventDefault();const form=save.closest('form');if(!form||save.disabled)return;form.dataset.personalReportAccount='journal-share';form.requestSubmit();return;}const b=e.target.closest('[data-journal-share]');if(b){e.preventDefault();void openJournalShare(b.dataset.journalShare);}});
 window.dailylogJournalShare={open:openJournalShare};
 const journalShareRow=rowSummary;rowSummary=function(task,...args){return journalShareRow(task,...args)+personalReportButton(task);};
 document.addEventListener('DOMContentLoaded',paintJournalSharePending);

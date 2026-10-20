 const personalReportStates=new Map(),personalReportBusy=new Set();
 const personalReportKey=()=> 'dailylog-line-personal-completion-v1:'+me();
 function reportable(t){return t?.status==='done'&&!t.deletedAt&&[t.lead,...t.collaborators||[]].some(p=>p.account===me());}
 function personalReportButton(t){if(!reportable(t))return '';const r=personalReportStates.get(t.id);return `<button type="button" class="btn small personal-report-button" data-personal-report="${esc(t.id)}">${r?.state==='sent'?'查看 LINE 回報':r?.state==='pending'?'確認／重試原 LINE 回報':'回報原 LINE 個人'}</button>`;}
 function mountPersonalReport(){
  const node=dialog(),t=active?.task;if(!node.open||!t)return;
  const form=node.querySelector('#taskEditForm'),host=form?.querySelector('.card-save-actions')||node.querySelector('.task-card-actions')||node.querySelector('.dialog-body');if(!host)return;
  let box=node.querySelector('[data-personal-report-card]');if(!box){box=document.createElement('div');box.dataset.personalReportCard='';host.append(box);}
  if(!form){box.innerHTML=personalReportButton(t);return;}
  const eligible=!t.deletedAt&&[t.lead,...t.collaborators||[]].some(p=>p.account===me());
  if(!box.childNodes.length){box.innerHTML='<button type="button" class="btn personal-report-button" data-save-personal-report>儲存並回報 LINE 個人</button><small data-personal-report-reason></small>';}
  const button=box.querySelector('[data-save-personal-report]'),reason=box.querySelector('[data-personal-report-reason]');
  const update=()=>{box.hidden=form.elements.status?.value!=='done';button.disabled=!eligible||form.dataset.readReady==='false';reason.textContent=eligible?'先選同仁，儲存成功後預覽完成內容，再確認私訊發送。':'請由完成整項任務的目前執行同仁回報。';};
  update();if(!form.dataset.personalReportBound){form.dataset.personalReportBound='true';form.addEventListener('change',update);}
 }
 function personalReportSaved(id,task,recipientAccount){
  personalReportStates.set(id,{state:'ready',title:task.title,recipientAccount});try{rememberPersonalReports();}catch{toast('完成內容已儲存，請保留畫面確認回報。');}paintPersonalReports();
  if(!dialog().open)void openPersonalReport(id);
 }
 function rememberPersonalReports(){localStorage.setItem(personalReportKey(),JSON.stringify([...personalReportStates]));}
 function paintPersonalReports(){let box=document.querySelector('#personalCompletionReports');if(!box){box=document.createElement('aside');box.id='personalCompletionReports';box.setAttribute('aria-live','polite');document.querySelector('main')?.prepend(box);}const pending=[...personalReportStates].filter(([,v])=>['pending','ready'].includes(v.state));box.hidden=!pending.length;box.innerHTML=pending.map(([id,r])=>`<div class="task-save-job"><strong>${esc(r.title)}：${r.state==='ready'?'已儲存，待確認 LINE 回報':'LINE 回報尚未確認'}</strong><p>${r.state==='ready'?'完成內容已儲存；確認前不會發送 LINE。':'內容已保留。請查看原回報，再決定重試。'}</p><button type="button" class="btn" data-personal-report="${esc(id)}">${r.state==='ready'?'預覽並確認回報':'查看／重試原回報'}</button></div>`).join('');mountPersonalReport();}
 async function openPersonalReport(id){
  if(!personalReportStates.get(id)?.recipientAccount){const account=await choosePersonalRecipient();if(!account)return;personalReportStates.set(id,{state:'ready',title:taskFor(id)?.title||'任務',recipientAccount:account});try{rememberPersonalReports();}catch{}}

  if(document.querySelector('#personalCompletionDialog')||personalReportBusy.has(id))return;
  const editor=dialog().querySelector('#taskEditForm')||dialog().querySelector('#taskStatusForm');if(dialog().open&&editor&&cardDirty(editor)){toast('請先儲存任務卡的修改，再確認 LINE 回報。');return;}
  let data;personalReportBusy.add(id);try{data=await dailylogRequest('/api/tasks/'+id+'/line-personal-report?recipientAccount='+encodeURIComponent(personalReportStates.get(id).recipientAccount));}catch(e){toast(e.message);return;}finally{personalReportBusy.delete(id);}
  const p=data.preview,r=data.report,sent=r?.state==='sent',view=r||p;
  if(sent){personalReportStates.set(id,{state:'sent',title:view.title,recipientAccount:p.recipientAccount});rememberPersonalReports();paintPersonalReports();}
  const node=document.createElement('dialog');node.id='personalCompletionDialog';node.className='personal-report-dialog';node.setAttribute('aria-labelledby','personalCompletionTitle');
  node.innerHTML=`<div class="dialog-head"><h2 id="personalCompletionTitle">${sent?'已回報原 LINE 個人':'確認 LINE 完成回報'}</h2></div><div class="dialog-body"><p>LINE 收件人：<strong>${esc(p.recipientName)}</strong>（${esc(p.recipientAccount)}）</p><p class="work-hint">任務連結依原有查看權限開啟。</p><p class="work-hint">由葉小蝸發送，並註明實際完成者。${sent?'LINE 已接受此回報。':'按下確認後才會送到上述群組。'}</p><div class="personal-report-preview"><p>任務完成回報</p><p>${esc(view.completionActor.name)} 已完成任務：${esc(view.title)}</p><p>完成結果：<br>${esc(view.result)}</p><p>原任務卡：<br><a href="${esc(view.url)}">${esc(view.url)}</a></p></div>${r?.error?`<p role="status">${esc(r.error)}</p>`:''}<p role="alert" data-personal-report-error hidden></p></div><div class="dialog-foot"><button type="button" class="btn" data-personal-report-cancel>${sent?'關閉':'取消'}</button>${sent?'':'<button type="button" class="btn primary" data-personal-report-send>確認並回報個人</button>'}</div>`;
  let busy=false;node.querySelector('[data-personal-report-cancel]').onclick=()=>{if(!busy)node.close();};node.oncancel=e=>{if(busy)e.preventDefault();};node.onclose=()=>node.remove();
  node.querySelector('[data-personal-report-send]')?.addEventListener('click',async()=>{
   if(busy)return;const packet={confirm:true,recipientAccount:p.recipientAccount,id:p.id,version:view.version||p.version,snapshot:view.snapshot||p.snapshot},error=node.querySelector('[data-personal-report-error]');
   personalReportStates.set(id,{state:'pending',title:view.title,recipientAccount:p.recipientAccount,packet});try{rememberPersonalReports();}catch{error.hidden=false;error.textContent='裝置無法保留回報內容，請保留畫面再試。';return;}
   busy=true;for(const b of node.querySelectorAll('button'))b.disabled=true;
   try{const response=await dailylogRequest('/api/tasks/'+id+'/line-personal-report',packet);if(response.report?.state!=='sent')throw Error(response.report?.error||'尚未收到 LINE 確認，請稍後重試原回報。');personalReportStates.set(id,{state:'sent',title:view.title,recipientAccount:p.recipientAccount});rememberPersonalReports();node.close();toast('LINE 已接受完成回報，已私訊給選定同仁並附上原任務卡。');}catch(e){error.hidden=false;error.textContent=e.message;}finally{busy=false;for(const b of node.querySelectorAll('button'))b.disabled=false;paintPersonalReports();}
  });document.body.append(node);node.showModal();
 }
 document.addEventListener('click',e=>{const save=e.target.closest('[data-save-personal-report]');if(save){e.preventDefault();e.stopPropagation();const form=save.closest('form'),id=active?.task?.id;if(!form||save.disabled)return;save.disabled=true;void choosePersonalRecipient().then(async account=>{if(!account||!form.isConnected||active?.task?.id!==id)return;form.dataset.personalReportAccount=account;form.requestSubmit();try{await form.cardSavePromise;}finally{delete form.dataset.personalReportAccount;}}).finally(()=>{if(save.isConnected)save.disabled=false;});return;}const b=e.target.closest('[data-personal-report]');if(!b)return;e.preventDefault();e.stopPropagation();void openPersonalReport(b.dataset.personalReport);});
 document.addEventListener('DOMContentLoaded',()=>{try{for(const [id,r]of JSON.parse(localStorage.getItem(personalReportKey())||'[]'))if(/^work-[0-9a-f-]{36}$/.test(id)&&['pending','ready','sent'].includes(r.state))personalReportStates.set(id,r);}catch{}paintPersonalReports();});

 async function choosePersonalRecipient(){
  if(document.querySelector('#personalRecipientDialog'))return null;
  let org;try{org=(await dailylogRequest('/api/tasks/personal-completion-directory')).organization;}catch(e){toast(e.message);return null;}
  if(!org||!Array.isArray(org.people)||!Array.isArray(org.departments)){toast('組織名單尚未準備完成。');return null;}
  const people=[...new Map(org.people.map(p=>[p.account,p])).values()],departments=org.departments,valid=new Set(departments.map(d=>d.id));
  const person=p=>'<label class="personal-recipient-person"><input type="radio" name="personalRecipient" value="'+esc(p.account)+'">'+esc(p.name)+' <small>'+esc(p.account)+'</small></label>';
  const tree=(parent,seen=new Set())=>departments.filter(d=>(d.parentId||null)===parent&&!seen.has(d.id)).map(d=>'<details><summary>'+esc(d.name)+'</summary>'+people.filter(p=>p.departments?.includes(d.id)).map(person).join('')+tree(d.id,new Set([...seen,d.id]))+'</details>').join('');
  const loose=people.filter(p=>!p.departments?.some(d=>valid.has(d)));
  const node=document.createElement('dialog');node.id='personalRecipientDialog';node.className='personal-report-dialog';node.innerHTML='<div class="dialog-head"><h2>選擇 LINE 收件人</h2></div><div class="dialog-body"><label>搜尋同仁<input class="field" type="search" data-recipient-search placeholder="姓名或工號"></label><div data-recipient-tree>'+tree(null)+(loose.length?'<details><summary>未歸屬單位</summary>'+loose.map(person).join('')+'</details>':'')+'</div><div data-recipient-results hidden></div><p role="status" data-recipient-selected>尚未選擇收件人</p><p>只選一位同仁。尚未確認 LINE 身分者無法發送；確認前可取消。</p></div><div class="dialog-foot"><button type="button" class="btn" data-recipient-cancel>取消</button><button type="button" class="btn primary" data-recipient-continue disabled>選擇此人並繼續</button></div>';
  let selected=null,answer=null;const next=node.querySelector('[data-recipient-continue]');
  node.addEventListener('change',e=>{if(e.target.name!=='personalRecipient')return;selected=e.target.value;for(const radio of node.querySelectorAll('[name=personalRecipient]'))radio.checked=radio.value===selected;const p=people.find(p=>p.account===selected);node.querySelector('[data-recipient-selected]').textContent='已選：'+p.name+'（'+p.account+'）';next.disabled=false;});
  node.querySelector('[data-recipient-search]').oninput=e=>{const q=e.target.value.trim().toLowerCase(),results=node.querySelector('[data-recipient-results]');node.querySelector('[data-recipient-tree]').hidden=!!q;results.hidden=!q;results.innerHTML=q?people.filter(p=>(p.name+' '+p.account).toLowerCase().includes(q)).map(person).join('')||'<p>找不到符合的同仁。</p>':'';for(const radio of results.querySelectorAll('input'))radio.checked=radio.value===selected;};
  node.querySelector('[data-recipient-cancel]').onclick=()=>node.close();next.onclick=()=>{answer=selected;node.close();};document.body.append(node);node.showModal();return new Promise(resolve=>{node.onclose=()=>{node.remove();resolve(answer);};});
 }

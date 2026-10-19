export function workspaceClient(BOOT){
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token='',data=null,memberList=[],membersLoaded=false,settingsDirty=false,settingsVersion=0,renderedSettingsVersion=-1,busy=false,publishing=false,polling=false,audioUrl='',mode='',editSnapshot=null,readingHash='',lastState='',sharingDirty=false,organization=null,selectedPeople=[],historyOffset=0;
 const newBlocks=new Map();
 let savingAll=false,contentSaveError='';
 let glossaryEntries=[],glossaryEntry=null,glossaryDirty=false,glossaryBusy=false,glossaryCanEdit=false,glossaryOpened=false,glossaryImportPreview=null,glossaryFileLoading=false,glossaryImportDirty=false;
 const dirty=new Map(),timers=new Map(),saving=new Set(),versions=new Map();
 const statusNames={offered:'等待上傳者確認',declined:'本次不製作',setup:'設定中',processing:'製作中',review:'共同確認中',failed:'製作未完成',publishing:'發布處理中',published:'正式會議記錄'};
 const color=id=>{let n=0;for(const c of id)n=(n*31+c.charCodeAt(0))>>>0;return `hsl(${n%360} 48% 40%)`;};
 const error=e=>{const message=e?.message||String(e||'');$('#error').textContent=message;if($('#confirmDialog').open){$('#confirmError').textContent=message;if(message)$('#confirmError').focus();}};
 async function api(input){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),input.action==='publish'?120000:60000);try{const r=await fetch('/meetings/review/work/'+BOOT.id+'/api',{method:'POST',headers:{...token?{Authorization:'Bearer '+token}:{},'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store',signal:controller.signal});const j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||'操作未完成'),{status:r.status});return j;}catch(e){if(e.name==='AbortError')throw Error(input.action==='publish'?'連線逾時；發布可能已開始，請按「檢查發布狀態」確認。原內容仍保留。':'連線逾時，請保留內容後重試。');throw e;}finally{clearTimeout(timeout);}}

 const editable=()=>data?.canEdit&&mode==='edit';
 const editData=()=>data.editing||{fields:data.workspace.fields,versions:data.workspace.versions,blocks:[]};
 function fieldStatus(key,text,failed=false){const e=document.querySelector('[data-status="'+key+'"]');if(e){e.textContent=text;e.style.color=failed?'#933b2b':'';}}
 function mark(key,value,version){if(!dirty.has(key))versions.set(key,Number(version??editData().versions[key]??0));dirty.set(key,value);const e=document.querySelector('[data-part="'+key+'"]');e?.classList.add('dirty');fieldStatus(key,'尚未儲存');e?.querySelector('[data-save]')?.removeAttribute('disabled');contentSaveError='';contentSaveState();}
 function contentSaveState(){
  const bar=$('#contentSaveBar');bar.hidden=!editable()||!['review','published'].includes(data?.workspace.state);if(bar.hidden)return;
  const active=savingAll||saving.size>0;if(!dirty.size&&!active)contentSaveError='';$('#saveContent').disabled=!dirty.size||active;
  const message=contentSaveError||(active?'正在儲存內容，請稍候…':dirty.size?'有 '+dirty.size+' 處內容尚未儲存':data.pendingRevision?'內容已儲存，正在同步正式記錄與任務':'目前所有內容已儲存');
  if($('#contentSaveStatus').textContent!==message)$('#contentSaveStatus').textContent=message;
  const times=(data.changes||[]).filter(h=>/^(record:|todo:)/.test(h.field)||['record','transcript','published_revision'].includes(h.field)).map(h=>Date.parse(h.created_at)).filter(Number.isFinite);
  const text=times.length?'最近內容儲存：'+new Date(Math.max(...times)).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'';
  $('#contentSavedAt').hidden=!text;if($('#contentSavedAt').textContent!==text)$('#contentSavedAt').textContent=text;
 }
 function changeText(h,currentOnly=false){if(!h)return '';const a=typeof h.before_value==='string'?h.before_value:JSON.stringify(h.before_value,null,2),b=typeof h.after_value==='string'?h.after_value:JSON.stringify(h.after_value,null,2);return meetingTextChanges(a,b).filter(x=>!currentOnly||x.kind!=='delete').map(x=>x.kind==='same'?esc(x.text):'<'+(x.kind==='delete'?'del':'ins')+'>'+esc(x.text)+'</'+(x.kind==='delete'?'del':'ins')+'>').join('');}
 function latest(key){return(data.changes||[]).find(h=>h.field===key);}
 function markHistory(key,e){const h=latest(key),box=e.querySelector('[data-change]');if(!box)return;const signature=JSON.stringify(h||null);if(box.dataset.key===signature)return;box.dataset.key=signature;if(!h){box.innerHTML='';return;}const wasOpen=!!box.querySelector('details')?.open;box.style.setProperty('--change-color',h.color||color(h.actor_id));box.innerHTML='<details><summary><span class="edit-author">'+esc(h.actor_name)+' 編輯</span> · '+esc(new Date(h.created_at).toLocaleString('zh-TW'))+' · 查看新增與刪除</summary><div class="change-text">'+changeText(h)+'</div><div data-part-history></div><button type="button" class="secondary" data-part-more>查看這一處的歷次修改</button></details>';if(wasOpen)box.querySelector('details').open=true;let offset=0;box.querySelector('[data-part-more]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const j=await api({action:'history',field:key,offset});box.querySelector('[data-part-history]').insertAdjacentHTML('beforeend',j.history.map(item=>'<details style="--change-color:'+esc(item.color||color(item.actor_id))+'"><summary><span class="edit-author">'+esc(item.actor_name)+' 編輯</span> · '+esc(new Date(item.created_at).toLocaleString('zh-TW'))+'</summary><div class="change-text">'+changeText(item)+'</div></details>').join(''));offset+=j.history.length;button.textContent=j.history.length===100?'載入更早的修改':'已顯示這一處的全部修改';button.hidden=j.history.length<100;}catch(err){error(err);}finally{button.disabled=false;}};}
 function partControls(key,e){e.dataset.part=key;e.innerHTML+='<div class="part-actions"><button type="button" class="secondary" data-save>儲存</button><button type="button" class="secondary" data-discard>取消修改</button><button type="button" class="secondary" data-remove>刪除</button></div><div class="field-status" role="status" data-status="'+esc(key)+'"></div><div data-change></div>';
  e.addEventListener('focusin',event=>{if(event.target.matches('[contenteditable],input,select,textarea'))e.classList.add('active-edit');});e.querySelector('[data-save]').onclick=()=>save(key).catch(error);
  e.querySelector('[data-discard]').onclick=()=>{dirty.delete(key);versions.delete(key);if(newBlocks.has(key)){newBlocks.delete(key);e.remove();}e.classList.remove('dirty','pending-delete','active-edit');e.querySelector('[data-conflict]')?.remove();document.activeElement?.blur();fieldStatus(key,'');render();};
  e.querySelector('[data-remove]').onclick=()=>{if(confirm(key.startsWith('record:')?'刪除此段文字？按儲存後生效，原文保留在修改紀錄。':'移除此項待辦？按儲存後生效，既有任務及進度仍保留。')){mark(key,key.startsWith('record:')?'':null,Number(e.dataset.version));if(key.startsWith('record:'))e.querySelector('[contenteditable]').textContent='';else e.classList.add('pending-delete');fieldStatus(key,'已標記刪除，請按儲存');}};
 }
 function plainEditor(e){e.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));});}
 async function save(key){
  if(!dirty.has(key)||saving.has(key)||!editable())return;saving.add(key);contentSaveError='';contentSaveState();const value=structuredClone(dirty.get(key)),version=versions.get(key),e=document.querySelector('[data-part="'+key+'"]');e?.querySelector('[data-save]')?.setAttribute('disabled','');fieldStatus(key,'正在儲存…');
  try{data=await api({action:'save-part',field:key,value,version,...newBlocks.has(key)?{after:newBlocks.get(key).after}:{}});versions.set(key,Number(editData().versions[key]||0));newBlocks.delete(key);if(JSON.stringify(dirty.get(key))===JSON.stringify(value)){dirty.delete(key);e?.classList.remove('dirty','pending-delete','active-edit');}fieldStatus(key,data.pendingRevision?'已儲存，正在同步正式記錄與任務':'已儲存');error('');render();}
  catch(err){contentSaveError='儲存未完成，尚未儲存的輸入仍保留：'+err.message;fieldStatus(key,err.message,true);if(err.status===409){data=await api({action:'read'});let box=e?.querySelector('[data-conflict]');if(e&&!box){box=document.createElement('div');box.dataset.conflict='';e.append(box);}const remote=key.startsWith('record:')?editData().blocks.find(b=>'record:'+b.id===key)?.text:editData().fields[key];if(box){box.innerHTML='<p>最新內容（你的輸入仍保留）：</p><pre>'+esc(typeof remote==='string'?remote:JSON.stringify(remote??null,null,2))+'</pre><button class="secondary">已比較，儲存我的版本</button>';box.querySelector('button').onclick=()=>{if(confirm('確認已比較最新內容，使用你的內容取代這一段或待辦？')){versions.set(key,Number(editData().versions[key]||0));box.remove();save(key).catch(error);}};}}throw err;}
  finally{saving.delete(key);if(e?.querySelector('[data-save]'))e.querySelector('[data-save]').disabled=!dirty.has(key);contentSaveState();}
 }
 function editor(key,label,value){let e=document.querySelector('[data-part="'+key+'"]');if(!e){e=document.createElement('div');e.innerHTML='<label>'+esc(label)+'</label><textarea class="auto-text" aria-label="'+esc(label)+'"></textarea>';partControls(key,e);e.querySelector('textarea').oninput=event=>{grow(event.target);mark(key,event.target.value,Number(e.dataset.version));};e.querySelector('[data-remove]').hidden=true;}
  const area=e.querySelector('textarea');if(!dirty.has(key)&&document.activeElement!==area){area.value=value||'';e.dataset.version=editData().versions[key]||0;grow(area);}area.disabled=!editable();e.classList.toggle('dirty',dirty.has(key));e.querySelector('[data-save]').disabled=!dirty.has(key)||saving.has(key);markHistory(key,e);return e;
 }
 function grow(e){e.style.height='auto';e.style.height=Math.max(60,e.scrollHeight+2)+'px';}
 function blockEditor(block){const key='record:'+block.id;let e=document.querySelector('[data-part="'+key+'"]');if(!e){e=document.createElement('div');e.className='record-part';e.innerHTML='<div class="paragraph" contenteditable="true" role="textbox" aria-multiline="true" aria-label="會議段落"></div>';partControls(key,e);const area=e.querySelector('[contenteditable]');plainEditor(area);area.oninput=()=>mark(key,area.innerText,Number(e.dataset.version));}
  const area=e.querySelector('[contenteditable]');if(!dirty.has(key)&&document.activeElement!==area){const h=latest(key);area.innerHTML=h&&h.after_value===block.text?changeText(h,true):esc(block.text);area.style.setProperty('--change-color',h?.color||color(h?.actor_id||''));e.dataset.version=editData().versions[key]||0;}
  e.classList.toggle('empty-part',!block.text&&!dirty.has(key));area.classList.toggle('prose-heading',/^(重點摘要|會議內容|結論與決議|主要結論|下次會議)$|^#{1,3}\s/.test(block.text));area.contentEditable=String(!!editable());e.classList.toggle('dirty',dirty.has(key));e.querySelector('[data-save]').disabled=!dirty.has(key)||saving.has(key);markHistory(key,e);return e;
 }

 function setup(s){
  if(settingsDirty||renderedSettingsVersion===Number(data.workspace.versions.settings||0))return;renderedSettingsVersion=Number(data.workspace.versions.settings||0);settingsVersion=Number(data.workspace.versions.settings||0);
  for(const k of ['topic','date','prompt','projectGoal'])$('#'+k).value=s[k]||'';
  const type=['會議','月會'].includes(s.type)?'工作會議':s.type,known=data.types.some(t=>t.name===type);$('#type').innerHTML=data.types.map(t=>'<option>'+esc(t.name)+'</option>').join('')+'<option value="custom">自訂類型</option>';
  $('#type').value=known?type:'custom';$('#customType').value=known?'':type;$('#customTypeBox').hidden=known;renderSpeakers(s.speakers);
  $('#frequency').value=s.cycle?.frequency||(s.type==='月會'?'monthly':s.type==='會議'?'none':'daily');$('#intervalDays').value=s.cycle?.intervalDays||7;$('#nextDate').value=s.cycle?.nextDate||'';schedulePreview();
 }
 function renderSpeakers(speakers){$('#speakers').innerHTML=speakers.map((s,i)=>'<div class="speaker"><strong>'+String.fromCharCode(65+i)+'</strong><input data-name aria-label="參與者姓名" value="'+esc(s.name)+'" placeholder="姓名"><select data-gender aria-label="性別"><option value="">男／女</option><option '+(s.gender==='男'?'selected':'')+'>男</option><option '+(s.gender==='女'?'selected':'')+'>女</option></select><input data-role aria-label="職務" value="'+esc(s.role)+'" placeholder="職務（選填）"><button class="secondary" type="button" data-remove>移除</button></div>').join('');$('#speakers').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{b.closest('.speaker').remove();settingsDirty=true;renumber();});}
 function renumber(){$('#speakers').querySelectorAll('strong').forEach((e,i)=>e.textContent=String.fromCharCode(65+i));}
 function settings(){const type=$('#type').value==='custom'?$('#customType').value.trim():$('#type').value;return {topic:$('#topic').value.trim(),type,...type==='工作會議'?{cycle:{frequency:$('#frequency').value,intervalDays:$('#frequency').value==='custom'?Number($('#intervalDays').value):7,nextDate:$('#nextDate').value}}:{},prompt:$('#prompt').value,date:$('#date').value,projectGoal:$('#projectGoal').value,speakers:[...$('#speakers').children].map(e=>({name:e.querySelector('[data-name]').value,gender:e.querySelector('[data-gender]').value,role:e.querySelector('[data-role]').value}))};}
 function schedulePreview(){const s=settings(),work=s.type==='工作會議';$('#cycleBox').hidden=!work;$('#intervalBox').hidden=$('#frequency').value!=='custom';const due=meetingDueDate(s);$('#duePreview').textContent=due?'新增待辦預設到期日：'+due+'。之後仍可逐項修改。':'未設定固定週期，新增待辦先預填建立當天，仍可修改。';}
 async function saveSettings(){const value=settings();const next=await api({action:'edit',field:'settings',value,version:settingsVersion});data=next;settingsDirty=false;$('#settingsStatus').textContent='設定已儲存';render();}
 function options(selected){return '<option value="">不指定負責人</option>'+memberList.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+(p.workReady?'':'（待連接工作日誌）')+'</option>').join('')+(selected&&!memberList.some(p=>p.id===selected)?'<option selected value="'+esc(selected)+'">'+esc(data.workspace.ownerNames?.[selected]||'原負責人（待重新確認）')+'</option>':'');}

 function todoEditor(key,t,index){let e=document.querySelector('[data-part="'+key+'"]');const created=!e;if(!e){e=document.createElement('li');e.className='todo-line';e.innerHTML='<h3 data-number></h3><div class="paragraph" data-content contenteditable="true" role="textbox" aria-multiline="true" aria-label="任務內容"></div><dl><div><dt>負責人</dt><dd><select data-owner aria-label="負責人"></select></dd></div><div><dt>截止日期</dt><dd><input data-due type="date" aria-label="截止日期"></dd></div></dl><details><summary>來源依據</summary><textarea class="auto-text" data-evidence aria-label="來源依據"></textarea></details>';partControls(key,e);plainEditor(e.querySelector('[data-content]'));
   const change=()=>mark(key,{content:e.querySelector('[data-content]').innerText,ownerId:e.querySelector('[data-owner]').value,due:e.querySelector('[data-due]').value,evidence:e.querySelector('[data-evidence]').value},Number(e.dataset.version));
   e.querySelectorAll('input,textarea,select,[contenteditable]').forEach(n=>n.addEventListener('input',change));
  }
  e.querySelector('[data-number]').textContent='任務 '+index;
  if(created||!dirty.has(key)&&!e.contains(document.activeElement)){e.querySelector('[data-content]').textContent=t.content;e.querySelector('[data-due]').value=t.due;e.querySelector('[data-evidence]').value=t.evidence;e.dataset.version=editData().versions[key]||0;}
  const select=e.querySelector('[data-owner]'),chosen=dirty.has(key)?dirty.get(key)?.ownerId:t.ownerId,html=options(chosen||'');if(select.innerHTML!==html&&document.activeElement!==select)select.innerHTML=html;
  e.querySelectorAll('textarea,input,select').forEach(n=>n.disabled=!editable());e.querySelector('[contenteditable]').contentEditable=String(!!editable());e.classList.toggle('dirty',dirty.has(key));e.querySelector('[data-save]').disabled=!dirty.has(key)||saving.has(key);markHistory(key,e);return e;
 }

 function prose(text){return String(text||'尚無會議內容。').split(/\r?\n/).map(line=>{if(!line.trim())return '';const heading=line.match(/^#{1,3}\s+(.+)$/);if(heading||['重點摘要','會議內容','結論與決議','主要結論','下次會議'].includes(line.trim()))return '<h3>'+esc(heading?heading[1]:line)+'</h3>';return '<p'+(/^[•・\-]\s/.test(line)?' class="prose-bullet"':'')+'>'+esc(line)+'</p>';}).join('');}
 function seek(seconds){$('#audio').currentTime=Number(seconds);$('#audio').play().catch(error);}
 function renderReader(){const r={...data.reader};if(memberList.length&&data.workspace.fields){const ts=Object.entries(data.workspace.fields).filter(([k,v])=>k.startsWith('todo:')&&v);r.todos=(r.todos||[]).map((t,i)=>({...t,owner:memberList.find(p=>p.id===ts[i]?.[1].ownerId)?.name||t.owner}));}const hash=JSON.stringify(r);if(readingHash===hash)return;readingHash=hash;
  $('#readingRecordText').innerHTML=prose(r.record);$('#readingTranscriptText').textContent=r.transcript||r.warning||'這場會議未提供逐字稿。';
  const ts=r.todos||[];$('#readingTodoCount').textContent=ts.length?'（'+ts.length+' 項）':'（無）';$('#readingTodoList').innerHTML=ts.length?'<ol>'+ts.map((t,i)=>'<li><h3>任務 '+(i+1)+'</h3><p>'+esc(t.content)+'</p><dl><div><dt>負責人</dt><dd>'+esc(t.owner)+'</dd></div><div><dt>截止日期</dt><dd>'+esc(t.due)+'</dd></div></dl></li>').join('')+'</ol>':'<p class="muted">本次會議沒有待辦事項。</p>';
  $('#readingSegments').innerHTML=(r.segments||[]).map(s=>'<p><button class="secondary" data-time="'+Number(s.start/1000)+'">'+Math.floor(s.start/60000)+':'+String(Math.floor(s.start/1000)%60).padStart(2,'0')+' '+esc(s.speaker)+'</button> '+esc(s.text)+'</p>').join('')||'沒有可定位的逐字稿時間。';$('#readingSegments').querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>seek(b.dataset.time));
 }

 function render(){if(!data)return;if(data.access==='member'&&token&&window.initializeMeetingHub)window.initializeMeetingHub({id:BOOT.id,token});const w=data.workspace,locked=['publishing','published'].includes(w.state),review=['review','publishing','published'].includes(w.state),readOnly=data.access!=='member';
  if(!mode||w.state==='published'&&lastState&&lastState!=='published')mode=w.state==='published'?'view':'edit';lastState=w.state;if(readOnly)mode='view';
  const reading=review&&mode==='view';document.body.classList.toggle('reader-mode',reading);document.body.classList.toggle('collaboration-mode',review&&!reading);$('#pageHeading').textContent=reading?'會議記錄':'會議工作頁';
  $('#glossaryPageLink').href='/meetings/review/work/'+BOOT.id+'/glossary';
  if(BOOT.glossaryOnly&&!readOnly){document.body.classList.add('glossary-page');$('#pageHeading').textContent='共用會議詞庫';$('#pageSubtitle').textContent='管理正確用詞、同音字與背景說明';if(!glossaryOpened){glossaryOpened=true;$('#openGlossary').click();}}
  $('#glossaryPanel').hidden=readOnly||mode!=='edit'||!['setup','failed','review','published'].includes(w.state);
  $('#modeSwitch').hidden=!review||readOnly||w.state==='publishing';$('#viewMode').setAttribute('aria-pressed',String(mode==='view'));$('#editMode').setAttribute('aria-pressed',String(mode==='edit'));$('#editMode').hidden=!data.canEdit;$('#hostLogin').hidden=!readOnly;
  $('#connection').textContent=(readOnly?(data.access==='recipient'?'指定夥伴分享觀看':'連結分享觀看'):'已確認：'+data.actor.name)+' · '+statusNames[w.state];$('#title').textContent=data.reader?.topic||w.fields?.settings.topic||'會議工作頁';$('#source').textContent=(data.reader?.date||w.fields?.settings.date||'')+' · '+(data.reader?.filename||w.filename||'')+' · 主持人：'+(data.reader?.hostName||w.hostName||'');
  $('#notice').textContent=[w.warning,w.error,data.pendingRevision?.error_code|| (data.pendingRevision?'修改已儲存，正在依序同步正式記錄與任務；觀看模式會顯示已完成同步的正式版本。':'')].filter(Boolean).join('\n');
  if(!audioUrl&&data.audioUrl){audioUrl=data.audioUrl;$('#audio').src=audioUrl;$('#audio').hidden=false;$('#audioStatus').textContent='原始會議錄音，按播放即可收聽。';}
  $('#setupPanel').hidden=readOnly||!['setup','failed'].includes(w.state);$('#processingPanel').hidden=w.state!=='processing';$('#recordPanel').hidden=!review||reading;$('#todoPanel').hidden=!review||reading;$('#historyPanel').hidden=readOnly||reading;$('#publishPanel').hidden=!review||locked||reading;$('#readerPanel').hidden=!reading;
  $('#sharingPanel').hidden=!data.host||mode!=='edit'||w.state==='publishing';if(!sharingDirty){$('#shareEnabled').checked=!!data.sharing?.enabled;selectedPeople=data.sharing?.people||[];}renderSelected();renderShareNotices();$('#revisionPanel').hidden=true;if(reading)renderReader();if(!data.pendingRevision)document.querySelectorAll('[data-status]').forEach(e=>{if(e.textContent==='已儲存，正在同步正式記錄與任務')e.textContent='已儲存';});
  document.querySelectorAll('[data-step]').forEach(e=>e.classList.toggle('active',e.dataset.step===(locked?'published':review?'review':'setup')));
  if(!$('#setupPanel').hidden)setup(w.fields.settings);
  $('#start').hidden=!data.host;$('#publish').hidden=!data.host||locked;$('#publishText').textContent='原對話成員各自儲存修改後，由主持人首次發布。發布後成員仍可分段修改並儲存，保留修改歷程。';
  if(review&&!reading){const editing=editData(),blocks=[...editing.blocks];for(const [key,b]of newBlocks)if(!blocks.some(x=>'record:'+x.id===key))blocks.push({id:key.slice(7),text:dirty.get(key)||''});
   const ids=new Set(blocks.map(b=>'record:'+b.id));for(const e of $('#recordEditor').children)if(!ids.has(e.dataset.part))e.remove();
   for(const b of blocks){const e=blockEditor(b);if(!e.parentNode)$('#recordEditor').append(e);}
   const tr=editor('transcript','逐字稿',editing.fields.transcript);if(!tr.parentNode)$('#transcriptEditor').append(tr);if($('#transcriptEditor').getClientRects().length)grow(tr.querySelector('textarea'));
   const keys=new Set(Object.entries(editing.fields).filter(([k,v])=>k.startsWith('todo:')&&v).map(([k])=>k));for(const k of dirty.keys())if(k.startsWith('todo:'))keys.add(k);
   for(const e of $('#todos').children)if(!keys.has(e.dataset.part))e.remove();let index=0;
   for(const k of keys){const value=dirty.get(k)||editing.fields[k];if(!value)continue;const e=todoEditor(k,value,++index);if(!e.parentNode)$('#todos').append(e);}
   $('#editTodoCount').textContent=index?'（'+index+' 項）':'（無）';$('#noEditTodos').hidden=!!index;
   $('#addTodo').hidden=!editable();$('#addRecordBlock').hidden=!editable();$('#refreshMembers').hidden=!editable();$('#speakerFix').hidden=!editable();$('#replaceSpeaker').hidden=!editable();
   if(!membersLoaded&&editable())loadMembers().catch(error);
  }
  $('#online').innerHTML=(data.presence||[]).map(p=>'<span class="person" style="--person-color:'+color(p.id)+'">'+esc(p.name)+(p.field?' · 正在編輯':'')+'</span>').join('');
  contentSaveState();
 }
 function renderShareNotices(){
  const box=$('#sharingNotices');if(!box||!data.host)return;
  const labels={sent:'LINE 通知已送出（不代表已讀）',not_requested:'既有分享：此次不補發通知',cancelled:'通知已取消',failed:'通知未完成，請確認 LINE 連線或聯絡管理者'};
  box.innerHTML=(data.sharing?.notices||[]).map(n=>'<p>'+esc(n.name)+'：'+esc(n.waitingForPublication?'等待會議發布後通知':n.state==='pending'?(n.reason==='line_not_linked'?'尚未確認本人 LINE 連線，完成後系統會再試':n.reason==='delivery_pending'?'通知暫未完成，系統會重試':'LINE 通知處理中'):labels[n.state]||'通知處理中')+'</p>').join('');
 }
 function renderSelected(){const box=$('#sharedPeople');if(!box)return;const key=JSON.stringify(selectedPeople);if(box.dataset.key===key)return;box.dataset.key=key;box.innerHTML=selectedPeople.map(p=>'<span class="selected-person"><span>'+esc(p.name)+' <small>'+esc(p.account)+'</small></span><button class="secondary" aria-label="移除 '+esc(p.name)+' '+esc(p.account)+'" data-account="'+esc(p.account)+'">移除</button></span>').join('')||'<p class="muted">尚未指定分享夥伴。</p>';box.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{selectedPeople=selectedPeople.filter(p=>p.account!==b.dataset.account);sharingDirty=true;$('#sharingStatus').textContent='分享名單尚未儲存';renderSelected();renderOrganization();});}
 function renderOrganization(){if(!organization)return;const q=$('#shareSearch').value.trim().toLocaleLowerCase(),selected=new Set(selectedPeople.map(p=>p.account)),nodes=new Map(organization.departments.map(d=>[d.id,{...d,children:[],people:[]} ])),roots=[];
  for(const node of nodes.values()){const parent=nodes.get(node.parentId);if(parent)parent.children.push(node);else roots.push(node);}
  const path=id=>{const names=[],seen=new Set();while(id&&nodes.has(id)&&!seen.has(id)){seen.add(id);const node=nodes.get(id);names.unshift(node.name);id=node.parentId;}return names.join('／');};
  const unassigned={name:'尚未分配單位',children:[],people:[]};
  for(const p of organization.people){const departments=[...new Set((p.departments||[]).filter(id=>nodes.has(id)))];if(![p.name,p.account,p.department,...departments.map(path)].join(' ').toLocaleLowerCase().includes(q))continue;if(departments.length)for(const id of departments)nodes.get(id).people.push(p);else unassigned.people.push(p);}
  if(unassigned.people.length)roots.push(unassigned);
  const person=p=>'<label class="sharing-option"><input type="checkbox" data-account="'+esc(p.account)+'" '+(selected.has(p.account)?'checked':'')+'><span>'+esc(p.name)+' <small>'+esc(p.account)+'</small></span></label>';
  function tree(node,seen=new Set()){if(node.id&&seen.has(node.id))return {html:'',accounts:new Set()};const next=new Set(seen);if(node.id)next.add(node.id);const children=node.children.map(child=>tree(child,next)),accounts=new Set(node.people.map(p=>p.account));for(const child of children)for(const account of child.accounts)accounts.add(account);if(!accounts.size)return {html:'',accounts};return {accounts,html:'<details class="org-department" '+(q?'open':'')+'><summary>'+esc(node.name)+'（'+accounts.size+' 人）</summary><div class="org-children">'+node.people.map(person).join('')+children.map(child=>child.html).join('')+'</div></details>'};}
  $('#organizationPeople').innerHTML=roots.map(root=>tree(root).html).join('')||'<p>找不到符合的同仁。</p>';
  $('#organizationPeople').querySelectorAll('[data-account]').forEach(n=>n.onchange=()=>{const p=organization.people.find(p=>p.account===n.dataset.account);if(n.checked&&!selectedPeople.some(x=>x.account===p.account))selectedPeople.push({account:p.account,name:p.name});else if(!n.checked)selectedPeople=selectedPeople.filter(x=>x.account!==p.account);for(const peer of $('#organizationPeople').querySelectorAll('[data-account]'))if(peer.dataset.account===p.account)peer.checked=n.checked;sharingDirty=true;$('#sharingStatus').textContent='分享名單尚未儲存';renderSelected();});
 }

 async function loadMembers(){membersLoaded=true;$('#membersStatus').textContent='正在讀取成員及工作日誌對應…';try{const j=await api({action:'members',observed:true});memberList=j.members.people;$('#membersStatus').textContent='已列出系統在原對話收過發言、且目前能確認身分的成員；未列出者請先在原群組發言，再重新讀取。';render();}catch(e){membersLoaded=false;throw e;}}
 function glossaryStatus(text){$('#glossaryStatus').textContent=text;}
 function glossaryLock(){
  $('#glossaryForm').querySelectorAll('input,textarea,button').forEach(e=>e.disabled=glossaryBusy||!glossaryCanEdit);
  $('#glossaryImportFields').disabled=glossaryBusy||!glossaryCanEdit||glossaryFileLoading;
  $('#confirmGlossaryImport').disabled=!glossaryImportPreview||!!glossaryImportPreview.errors||!glossaryImportPreview.added;
 }
 function invalidateImport(){glossaryImportDirty=true;glossaryImportPreview=null;$('#glossaryImportPreview').replaceChildren();$('#glossaryImportStatus').textContent='內容變更後，請先預覽再匯入。';glossaryLock();}
 $('#glossaryImportTemplate').href='data:text/csv;charset=utf-8,'+encodeURIComponent('\uFEFF正確用詞,常見錯字,背景說明\r\n合成星河館,合成新河管|合成星合館,測試館名；僅在討論該館時使用\r\n');
 $('#glossaryImportText').oninput=invalidateImport;$('#glossaryImportFormat').onchange=invalidateImport;
 $('#glossaryImportFile').onchange=async()=>{
  if(glossaryBusy)return;const file=$('#glossaryImportFile').files[0];if(!file)return;
  invalidateImport();glossaryFileLoading=true;glossaryLock();
  try{if(file.size>1024*1024)throw Error('檔案超過 1 MB，請拆分後匯入。');const ext=file.name.split('.').pop().toLowerCase();if(!['csv','tsv','txt'].includes(ext))throw Error('請選擇 CSV、TSV 或 TXT；Excel 請先另存為 CSV UTF-8。');
   const text=await file.text();$('#glossaryImportText').value=text;$('#glossaryImportFormat').value=ext==='txt'?'text':ext;$('#glossaryImportStatus').textContent='已讀入檔案，請按「預覽匯入」。';
  }catch(e){$('#glossaryImportStatus').textContent=e.message;}finally{glossaryFileLoading=false;glossaryLock();}
 };
 $('#previewGlossaryImport').onclick=async()=>{
  if(glossaryBusy||!glossaryCanEdit||glossaryFileLoading)return;glossaryBusy=true;glossaryImportPreview=null;$('#glossaryImportPreview').replaceChildren();glossaryLock();$('#glossaryImportStatus').textContent='正在檢查格式、重複詞與錯字衝突…';
  try{const j=await api({action:'glossary-preview',text:$('#glossaryImportText').value,format:$('#glossaryImportFormat').value});glossaryImportPreview=j.preview;$('#glossaryImportPreview').replaceChildren();
   for(const row of j.preview.rows){const p=document.createElement('p');p.textContent='第 '+row.line+' 列 · '+row.term+'：'+row.message+(row.aliases.length?'\n常見錯字：'+row.aliases.join('、'):'')+(row.note?'\n背景：'+row.note:'');p.style.whiteSpace='pre-wrap';p.style.overflowWrap='anywhere';if(row.status==='error')p.className='error';$('#glossaryImportPreview').append(p);}
   $('#glossaryImportStatus').textContent='可新增 '+j.preview.added+' 筆、重複略過 '+j.preview.skipped+' 筆、錯誤 '+j.preview.errors+' 筆。'+(j.preview.errors?'請先修正錯誤，整批尚未寫入。':'確認預覽後再按「確認匯入」。');
  }catch(e){$('#glossaryImportStatus').textContent=e.message;}finally{glossaryBusy=false;glossaryLock();}
 };
 $('#confirmGlossaryImport').onclick=async()=>{
  if(glossaryBusy||!glossaryCanEdit||!glossaryImportPreview||glossaryImportPreview.errors||!glossaryImportPreview.added)return;
  glossaryBusy=true;glossaryLock();$('#glossaryImportStatus').textContent='正在匯入，請稍候…';
  try{const j=await api({action:'glossary-import',text:$('#glossaryImportText').value,format:$('#glossaryImportFormat').value,previewHash:glossaryImportPreview.previewHash});glossaryEntries=j.entries;glossaryImportPreview=null;glossaryImportDirty=false;$('#glossaryImportPreview').replaceChildren();glossaryList();glossaryStatus('共用詞庫目前共有 '+j.entries.length+' 筆。');$('#glossaryImportStatus').textContent='匯入完成：新增 '+j.imported.added+' 筆，重複略過 '+j.imported.skipped+' 筆。下一次製作會議時開始使用。';}
  catch(e){glossaryImportPreview=null;$('#glossaryImportStatus').textContent=e.message+'\n匯入內容仍保留；請重新預覽確認結果，避免重複操作。';}finally{glossaryBusy=false;glossaryLock();}
 };
 function glossaryList(){
  const q=$('#glossarySearch').value.trim().toLocaleLowerCase();$('#glossaryList').replaceChildren();
  const entries=glossaryEntries.filter(e=>[e.term,...e.aliases,e.note].join(' ').toLocaleLowerCase().includes(q));
  if(!entries.length){const p=document.createElement('p');p.textContent='尚無符合的詞條。';$('#glossaryList').append(p);}
  for(const entry of entries){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=entry.term+(entry.enabled?'':'（停用）')+'\n'+(entry.aliases.length?'常見錯字：'+entry.aliases.join('、')+'\n':'')+entry.note;b.onclick=()=>{if(glossaryBusy||glossaryDirty&&!confirm('詞條有尚未儲存的內容，確定改看另一個詞條？'))return;glossarySelect(entry);};$('#glossaryList').append(b);}
 }
 function glossarySelect(entry=null){
  glossaryEntry=entry?structuredClone(entry):null;glossaryDirty=false;
  $('#glossaryFormTitle').textContent=entry?'修改詞條':'新增詞條';$('#glossaryTerm').value=entry?.term||'';$('#glossaryAliases').value=(entry?.aliases||[]).join('\n');$('#glossaryNote').value=entry?.note||'';$('#glossaryEnabled').checked=entry?.enabled??true;
 }
 async function glossaryLoad(){
  if(glossaryBusy)return;const j=await api({action:'glossary-list'});glossaryEntries=j.entries;glossaryCanEdit=j.canEdit;
  glossaryLock();glossaryList();
  glossaryStatus((j.canEdit?'已讀取 '+j.entries.length+' 筆詞條。':'目前只能閱讀詞庫。')+(glossaryDirty?'你的輸入仍保留，請先比較清單中的最新版本。':''));
 }
 $('#openGlossary').onclick=()=>{$('#glossaryDialog').showModal();glossaryLoad().catch(e=>glossaryStatus(e.message));};
 $('#glossarySearch').oninput=glossaryList;
 $('#glossaryForm').oninput=()=>{glossaryDirty=true;glossaryStatus('詞條尚未儲存。');};
 $('#newGlossary').onclick=()=>{if(!glossaryBusy&&(!glossaryDirty||confirm('確定放棄這個詞條尚未儲存的內容？')))glossarySelect();};
 $('#reloadGlossary').onclick=()=>glossaryLoad().catch(e=>glossaryStatus(e.message));
 $('#glossaryForm').onsubmit=async e=>{
  e.preventDefault();if(glossaryBusy||!glossaryCanEdit)return;glossaryBusy=true;glossaryLock();glossaryStatus('正在儲存…');
  try{const entry={...(glossaryEntry?{id:glossaryEntry.id}:{}),version:glossaryEntry?.version||0,term:$('#glossaryTerm').value,aliases:$('#glossaryAliases').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),note:$('#glossaryNote').value,enabled:$('#glossaryEnabled').checked};
   const j=await api({action:'glossary-save',entry});glossaryEntries=j.entries;glossarySelect(j.entries.find(t=>t.term===entry.term.trim()));glossaryList();glossaryStatus('詞條已儲存，下一次製作會議時開始使用。');
  }catch(e){glossaryStatus(e.message+'\n你的輸入仍保留。');}finally{glossaryBusy=false;glossaryLock();}
 };
 function closeGlossary(e){if(glossaryBusy||glossaryFileLoading){e?.preventDefault();return;}if((glossaryDirty||glossaryImportDirty)&&!confirm('詞條或匯入內容尚未儲存，確定關閉詞庫？')){e?.preventDefault();return;}$('#glossaryDialog').close();if(BOOT.glossaryOnly){window.close();location.href='/meetings/review/work/'+BOOT.id;}else $('#openGlossary').focus();}
 $('#closeGlossary').onclick=closeGlossary;$('#glossaryDialog').addEventListener('cancel',e=>{e.preventDefault();closeGlossary(e);});
 $('#setupPanel').addEventListener('input',()=>{settingsDirty=true;$('#settingsStatus').textContent='尚未儲存設定';schedulePreview();});
 $('#type').onchange=()=>{const custom=$('#type').value==='custom';$('#customTypeBox').hidden=!custom;if(!custom)$('#prompt').value=data.types.find(t=>t.name===$('#type').value).prompt;settingsDirty=true;schedulePreview();};
 $('#addSpeaker').onclick=()=>{const s=settings().speakers;if(s.length>=40)return;s.push({name:'',gender:'',role:''});renderSpeakers(s);settingsDirty=true;};
 $('#saveSettings').onclick=()=>saveSettings().catch(error);
 $('#saveType').onclick=async()=>{try{const s=settings(),prior=data.types.find(t=>t.name===s.type);data=await api({action:'save-type',name:s.type,prompt:s.prompt,version:prior?.version||0});$('#settingsStatus').textContent='已保存為本對話可重複選用的會議類型；本場設定仍請儲存。';}catch(e){error(e);}};
 $('#start').onclick=async()=>{if(busy)return;busy=true;try{if(settingsDirty)await saveSettings();data=await api({action:'start',revision:data.workspace.revision});render();}catch(e){error(e);}finally{busy=false;}};
 $('#addTodo').onclick=()=>{const k='todo:'+crypto.randomUUID();mark(k,{content:'',ownerId:'',due:meetingDueDate(editData().fields.settings,new Date(Date.now()+8*3600000).toISOString().slice(0,10)),evidence:''});render();};
 $('#refreshMembers').onclick=()=>loadMembers().catch(error);
 $('#publish').onclick=()=>{if(dirty.size||saving.size){error('尚有內容未儲存，請先完成儲存再發布。');return;}const ts=Object.entries(data.workspace.fields).filter(([k,v])=>k.startsWith('todo:')&&v).map(([,v])=>v);if(ts.some(t=>!t.content.trim()||t.ownerId&&!t.due)){error('請補齊待辦內容；已選負責人的待辦必須填截止日期。');return;}$('#confirmText').textContent='會議：'+data.workspace.fields.settings.topic+'。將建立 '+ts.filter(t=>t.ownerId).length+' 項個人任務，保留 '+ts.filter(t=>!t.ownerId).length+' 項未分派待辦。';$('#confirmError').textContent='';$('#confirmStatus').textContent='';$('#confirmDialog').dataset.revision=data.workspace.revision;$('#confirmDialog').showModal();};
 $('#cancelPublish').onclick=()=>$('#confirmDialog').close();
 $('#confirmDialog').addEventListener('cancel',e=>{if(publishing)e.preventDefault();});
 $('#confirmPublish').onclick=async()=>{if(busy)return;busy=true;publishing=true;error('');$('#confirmStatus').textContent='正在核對身分並送出發布，請稍候…';$('#confirmPublish').textContent='正在確認發布…';for(const id of ['confirmPublish','cancelPublish','refreshPublish'])$('#'+id).disabled=true;try{data=await api({action:'publish',revision:Number($('#confirmDialog').dataset.revision)});$('#confirmDialog').close();render();}catch(e){error(e);}finally{busy=false;publishing=false;$('#confirmStatus').textContent='';$('#confirmPublish').textContent='確認發布';for(const id of ['confirmPublish','cancelPublish','refreshPublish'])$('#'+id).disabled=false;}};
 $('#refreshPublish').onclick=async()=>{if(busy)return;busy=true;try{data=await api({action:'read'});if(['publishing','published'].includes(data.workspace.state)){$('#confirmDialog').close();render();}else error('尚未發布，內容仍可修改。請返回檢查提示，確認後重新開啟發布視窗。');}catch(e){error(e);}finally{busy=false;}};

 $('#loadHistory').onclick=async()=>{try{historyOffset=0;$('#history').innerHTML='';await loadHistory();}catch(e){error(e);}};
 async function loadHistory(){const j=await api({action:'history',offset:historyOffset});$('#history').insertAdjacentHTML('beforeend',j.history.map(h=>'<details style="--change-color:'+esc(h.color||color(h.actor_id))+'"><summary><span class="edit-author">'+esc(h.actor_name)+' 編輯</span> · '+esc(h.field.startsWith('todo:')?'待辦事項':h.field.startsWith('record:')?'會議段落':({settings:'會議設定',record:'會議記錄',transcript:'逐字稿',sharing:'分享權限',published_revision:'正式會議修訂'}[h.field]||h.field))+' · '+esc(new Date(h.created_at).toLocaleString('zh-TW'))+'</summary><div class="change-text">'+changeText(h)+'</div></details>').join('')||'尚無人工修改紀錄。');historyOffset+=j.history.length;$('#moreHistory').hidden=j.history.length<100;}
 $('#moreHistory').onclick=()=>loadHistory().catch(error);
 $('#replaceSpeaker').onclick=()=>{const old=$('#oldSpeaker').value,next=$('#newSpeaker').value;if(!old||!next)return;for(const e of $('#recordEditor').children){const key=e.dataset.part,area=e.querySelector('[contenteditable]');if(area?.innerText.includes(old)){area.textContent=area.innerText.split(old).join(next);mark(key,area.innerText,Number(e.dataset.version));}}const tr=document.querySelector('[data-part="transcript"] textarea');if(tr?.value.includes(old)){tr.value=tr.value.split(old).join(next);mark('transcript',tr.value,Number(tr.closest('[data-part]').dataset.version));}};
 $('#addRecordBlock').onclick=()=>{const key='record:'+crypto.randomUUID().replaceAll('-',''),blocks=[...editData().blocks,...[...newBlocks.keys()].map(k=>({id:k.slice(7)}))];newBlocks.set(key,{after:blocks.at(-1)?.id||null});mark(key,'',0);render();document.querySelector('[data-part="'+key+'"] [contenteditable]').focus();};
 $('#viewMode').onclick=()=>{mode='view';render();};
 $('#saveContent').onclick=async()=>{if(savingAll||saving.size||!editable())return;savingAll=true;contentSaveError='';contentSaveState();try{for(const key of [...dirty.keys()])await save(key);}catch(err){error(err);}finally{savingAll=false;contentSaveState();}};
 $('#editMode').onclick=()=>{if(!data.canEdit)return;mode='edit';render();};
 $('#shareEnabled').onchange=()=>{sharingDirty=true;$('#sharingStatus').textContent='尚未儲存分享設定';};
 $('#choosePeople').onclick=async()=>{try{$('#organizationStatus').textContent='正在讀取最新組織架構…';const j=await api({action:'organization'});organization=j.organization;$('#organizationPicker').hidden=false;$('#organizationStatus').textContent='從單位展開或搜尋姓名，可選擇多位夥伴。';renderOrganization();}catch(e){$('#organizationStatus').textContent='組織架構讀取未完成，原分享名單保持。';error(e);}};
 $('#shareSearch').oninput=renderOrganization;
 $('#saveSharing').onclick=async()=>{if(busy)return;busy=true;$('#saveSharing').disabled=true;try{data=await api({action:'sharing',enabled:$('#shareEnabled').checked,accounts:selectedPeople.map(p=>p.account),revision:data.workspace.revision,version:data.sharing.version});sharingDirty=false;audioUrl='';$('#sharingStatus').textContent='分享設定已儲存。新加入夥伴的 LINE 通知進度如下；指定夥伴只能觀看與收聽。';render();error('');}catch(e){error(e);}finally{busy=false;$('#saveSharing').disabled=false;}};

 let audioRetries=0;
 $('#audio').onerror=async()=>{if(audioRetries++<2&&data?.audioUrl&&data.audioUrl!==audioUrl){const player=$('#audio'),at=player.currentTime;audioUrl=data.audioUrl;player.src=audioUrl;player.currentTime=at;$('#audioStatus').textContent='正在更新錄音播放授權，請再按播放。';return;}$('#audioStatus').textContent='錄音暫時無法播放。可重新整理頁面再試，原始錄音仍保留。';};
 window.addEventListener('beforeunload',e=>{if(dirty.size||settingsDirty||sharingDirty){e.preventDefault();e.returnValue='';}});
 async function refresh(){if(polling||publishing||document.hidden||!data)return;polling=true;try{const active=document.activeElement,field=mode==='edit'?(active?.closest('[data-part]')?.dataset.part||(active?.closest('#setupPanel')?'settings':'')):'';data=await api({action:'read',field});render();}catch(e){error(e);if(data?.access!=='member'&&[401,403].includes(e.status)){$('#readerPanel').hidden=true;$('#meetingHeading').hidden=true;$('#connection').textContent='此連結已停止對外分享';$('#hostLogin').hidden=false;$('#audio').pause();$('#audio').removeAttribute('src');audioUrl='';}}finally{polling=false;}}
 async function login(){if(!BOOT.liffId||!window.liff)throw Error('LINE 登入尚未設定完成，請聯絡管理者。');await liff.init({liffId:BOOT.liffId});if(!liff.isLoggedIn()){liff.login({redirectUri:location.origin+'/meetings/review/work/'+BOOT.id});return false;}token=liff.getAccessToken();return true;}
 $('#hostLogin').onclick=async()=>{try{if(!await login())return;data=await api({action:'read'});audioUrl='';$('#meetingHeading').hidden=false;render();if(data.access!=='member')error('此身分僅可觀看；編輯限原對話成員。');else error('');}catch(e){error(e);}};
 async function init(){try{if(BOOT.loginUrl&&location.origin!==new URL(BOOT.loginUrl).origin){location.replace(BOOT.loginUrl);return;}if(!BOOT.publicAvailable&&!await login())return;data=await api({action:'read'});render();setInterval(refresh,5000);}catch(e){error(e);$('#connection').textContent='尚未完成身分驗證';$('#hostLogin').hidden=false;}}
 init();
}

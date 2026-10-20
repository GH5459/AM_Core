export function workspaceClient(BOOT){
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token='',data=null,memberList=[],membersLoaded=false,settingsDirty=false,settingsVersion=0,renderedSettingsVersion=-1,busy=false,publishing=false,polling=false,audioUrl='',mode='',editSnapshot=null,readingHash='',lastState='',sharingDirty=false,sharingBase=null,selectedPeople=[],historyOffset=0;
 const newBlocks=new Map();
 const speakerTools=meetingSpeakerTools();
 let showingSettings=false,speakerPlan=null,speakerUndo=null,segmentsHash='';
 let savingAll=false,contentSaveError='';
 let glossaryEntries=[],glossaryEntry=null,glossaryDirty=false,glossaryBusy=false,glossaryCanEdit=false,glossaryOpened=false,glossaryImportPreview=null,glossaryFileLoading=false,glossaryImportDirty=false;
 const dirty=new Map(),timers=new Map(),saving=new Set(),versions=new Map();
 const statusNames={offered:'等待上傳者確認',declined:'本次不製作',setup:'設定中',processing:'製作中',review:'共同確認中',failed:'製作未完成',publishing:'發布處理中',published:'正式會議記錄'};
 const color=id=>{let n=0;for(const c of id)n=(n*31+c.charCodeAt(0))>>>0;return `hsl(${n%360} 48% 40%)`;};
 const error=e=>{const message=e?.message||String(e||'');$('#error').textContent=message;if($('#confirmDialog').open){$('#confirmError').textContent=message;if(message)$('#confirmError').focus();}};
 async function api(input){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),input.action==='publish'?120000:60000);try{const r=await fetch('/meetings/review/work/'+BOOT.id+'/api',{method:'POST',headers:{...token?{Authorization:'Bearer '+token}:{},'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store',signal:controller.signal});const j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||'操作未完成'),{status:r.status});return j;}catch(e){if(e.name==='AbortError')throw Error(input.action==='publish'?'連線逾時；發布可能已開始，請按「檢查發布狀態」確認。原內容仍保留。':'連線逾時，請保留內容後重試。');throw e;}finally{clearTimeout(timeout);}}

 const editable=()=>data?.canEdit&&mode==='edit';
 const editData=()=>data.editing||{fields:data.workspace.fields,versions:data.workspace.versions,blocks:[]};
 // Keep the version of the visible text, even while its editor retains focus.
 // A newer read may acknowledge a save whose HTTP response was lost.
 function sameValue(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameValue(a[k],b[k]));}
 function acceptData(next){const revision=d=>Number(d?.editing?.revision??d?.workspace.revision??0);if(!data||next.access!=='member'||data.access!=='member'||revision(next)>=revision(data))data=next;}
 function acknowledge(key,version){versions.set(key,version);const e=document.querySelector('[data-part="'+key+'"]');if(e)e.dataset.version=version;}
 function clearSaved(key){dirty.delete(key);versions.delete(key);newBlocks.delete(key);const e=document.querySelector('[data-part="'+key+'"]');e?.classList.remove('dirty','pending-delete','active-edit');e?.querySelector('[data-conflict]')?.remove();fieldStatus(key,data.pendingRevision?'已儲存，正在同步正式記錄與任務':'已儲存');}
 function recoverSaved(key){if(data.access!=='member'||!data.canEdit)return false;const remote=key.startsWith('record:')?editData().blocks.find(b=>'record:'+b.id===key)?.text:editData().fields[key]??null,version=Number(editData().versions[key]||0);if(!dirty.has(key)||version<=Number(versions.get(key)||0)||!sameValue(dirty.get(key),remote))return false;acknowledge(key,version);clearSaved(key);return true;}
 function fieldStatus(key,text,failed=false){const e=document.querySelector('[data-status="'+key+'"]');if(e){e.textContent=text;e.style.color=failed?'#933b2b':'';}}
 function mark(key,value,version){if(!dirty.has(key))versions.set(key,Number(version??editData().versions[key]??0));dirty.set(key,value);const e=document.querySelector('[data-part="'+key+'"]');e?.classList.add('dirty');fieldStatus(key,'尚未儲存');e?.querySelector('[data-save]')?.removeAttribute('disabled');contentSaveError='';contentSaveState();}
 function contentSaveState(){
  const bar=$('#contentSaveBar');bar.hidden=!editable()||!['review','published'].includes(data?.workspace.state);if(bar.hidden)return;
  const active=savingAll||saving.size>0,count=dirty.size+(settingsDirty?1:0);if(!count&&!active)contentSaveError='';$('#saveContent').disabled=!count||active;
  const message=contentSaveError||(active?'正在儲存內容，請稍候…':count?'有 '+count+' 處內容尚未儲存':data.pendingRevision?'內容已儲存，正在同步正式記錄與任務':'目前所有內容已儲存');
  if($('#contentSaveStatus').textContent!==message)$('#contentSaveStatus').textContent=message;
  const times=(data.changes||[]).filter(h=>/^(record:|todo:)/.test(h.field)||['record','transcript','published_revision'].includes(h.field)).map(h=>Date.parse(h.created_at)).filter(Number.isFinite);
  const text=times.length?'最近內容儲存：'+new Date(Math.max(...times)).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'';
  $('#contentSavedAt').hidden=!text;if($('#contentSavedAt').textContent!==text)$('#contentSavedAt').textContent=text;
 }
 function changeText(h,currentOnly=false){if(!h)return '';const a=typeof h.before_value==='string'?h.before_value:JSON.stringify(h.before_value,null,2),b=typeof h.after_value==='string'?h.after_value:JSON.stringify(h.after_value,null,2);return meetingTextChanges(a,b).filter(x=>!currentOnly||x.kind!=='delete').map(x=>x.kind==='same'?esc(x.text):'<'+(x.kind==='delete'?'del':'ins')+'>'+esc(x.text)+'</'+(x.kind==='delete'?'del':'ins')+'>').join('');}
 function latest(key){return(data.changes||[]).find(h=>h.field===key);}
 function markHistory(key,e){const h=latest(key),box=e.querySelector('[data-change]');if(!box)return;const signature=JSON.stringify(h||null);if(box.dataset.key===signature)return;box.dataset.key=signature;if(!h){box.innerHTML='';return;}const wasOpen=!!box.querySelector('details')?.open;box.style.setProperty('--change-color',h.color||color(h.actor_id));box.innerHTML='<details><summary><span class="edit-author">'+esc(h.actor_name)+' 編輯</span> · '+esc(new Date(h.created_at).toLocaleString('zh-TW'))+' · 查看新增與刪除</summary><div class="change-text">'+changeText(h)+'</div><div data-part-history></div><button type="button" class="secondary" data-part-more>查看這一處的歷次修改</button></details>';if(wasOpen)box.querySelector('details').open=true;let offset=0;box.querySelector('[data-part-more]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const j=await api({action:'history',field:key,offset});box.querySelector('[data-part-history]').insertAdjacentHTML('beforeend',j.history.map(item=>'<details style="--change-color:'+esc(item.color||color(item.actor_id))+'"><summary><span class="edit-author">'+esc(item.actor_name)+' 編輯</span> · '+esc(new Date(item.created_at).toLocaleString('zh-TW'))+'</summary><div class="change-text">'+changeText(item)+'</div></details>').join(''));offset+=j.history.length;button.textContent=j.history.length===100?'載入更早的修改':'已顯示這一處的全部修改';button.hidden=j.history.length<100;}catch(err){error(err);}finally{button.disabled=false;button.focus();}};}
 function partControls(key,e){e.dataset.part=key;e.innerHTML+='<div class="part-actions"><button type="button" class="secondary" data-save>儲存</button><button type="button" class="secondary" data-discard>取消修改</button><button type="button" class="secondary" data-remove>刪除</button></div><div class="field-status" role="status" data-status="'+esc(key)+'"></div><div data-change></div>';
  e.addEventListener('focusin',event=>{if(event.target.matches('[contenteditable],input,select,textarea'))e.classList.add('active-edit');});e.querySelector('[data-save]').onclick=()=>save(key).catch(error);
  e.querySelector('[data-discard]').onclick=()=>{dirty.delete(key);versions.delete(key);if(newBlocks.has(key)){newBlocks.delete(key);e.remove();}e.classList.remove('dirty','pending-delete','active-edit');e.querySelector('[data-conflict]')?.remove();document.activeElement?.blur();fieldStatus(key,'');render();};
  e.querySelector('[data-remove]').onclick=()=>{if(confirm(key.startsWith('record:')?'刪除此段文字？按儲存後生效，原文保留在修改紀錄。':'移除此項待辦？按儲存後生效，既有任務及進度仍保留。')){mark(key,key.startsWith('record:')?'':null,Number(e.dataset.version));if(key.startsWith('record:'))e.querySelector('[contenteditable]').textContent='';else e.classList.add('pending-delete');fieldStatus(key,'已標記刪除，請按儲存');}};
 }
 function plainEditor(e){e.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));});}
 async function save(key){
  if(!dirty.has(key)||saving.has(key)||!editable())return;saving.add(key);contentSaveError='';contentSaveState();const value=structuredClone(dirty.get(key)),version=versions.get(key),e=document.querySelector('[data-part="'+key+'"]');e?.querySelector('[data-save]')?.setAttribute('disabled','');fieldStatus(key,'正在儲存…');
  try{const saved=await api({action:'save-part',field:key,value,version,...newBlocks.has(key)?{after:newBlocks.get(key).after}:{}});acceptData(saved);acknowledge(key,Number((saved.editing?.versions||saved.workspace.versions)[key]||0));newBlocks.delete(key);if(sameValue(dirty.get(key),value))clearSaved(key);fieldStatus(key,dirty.has(key)?'尚未儲存':data.pendingRevision?'已儲存，正在同步正式記錄與任務':'已儲存');error('');render();}
  catch(err){let read=false;if(err.status===409||!err.status||err.status>=500){try{acceptData(await api({action:'read'}));read=true;}catch{ /* Preserve the original failure and the local input. */ }}if(read&&recoverSaved(key)){contentSaveError='';error('');render();return;}contentSaveError='儲存未完成，尚未儲存的輸入仍保留：'+err.message;fieldStatus(key,err.message,true);if(err.status===409&&read){let box=e?.querySelector('[data-conflict]');if(e&&!box){box=document.createElement('div');box.dataset.conflict='';e.append(box);}const remote=key.startsWith('record:')?editData().blocks.find(b=>'record:'+b.id===key)?.text:editData().fields[key];if(box){box.innerHTML='<p>最新內容（你的輸入仍保留）：</p><pre>'+esc(typeof remote==='string'?remote:JSON.stringify(remote??null,null,2))+'</pre><button class="secondary">已比較，儲存我的版本</button>';box.querySelector('button').onclick=()=>{if(confirm('確認已比較最新內容，使用你的內容取代這一段或待辦？')){versions.set(key,Number(editData().versions[key]||0));box.remove();save(key).catch(error);}};}}throw err;}
  finally{saving.delete(key);if(e?.querySelector('[data-save]'))e.querySelector('[data-save]').disabled=!dirty.has(key);contentSaveState();}
 }
 function editor(key,label,value){let e=document.querySelector('[data-part="'+key+'"]');if(!e){e=document.createElement('div');e.innerHTML='<label>'+esc(label)+'</label><textarea class="auto-text" aria-label="'+esc(label)+'"></textarea>';partControls(key,e);e.querySelector('textarea').oninput=event=>{grow(event.target);mark(key,event.target.value,Number(e.dataset.version));};e.querySelector('[data-remove]').hidden=true;}
  const area=e.querySelector('textarea');if(!dirty.has(key)&&document.activeElement!==area){area.value=value||'';e.dataset.version=editData().versions[key]||0;grow(area);}area.disabled=!editable();e.classList.toggle('dirty',dirty.has(key));e.querySelector('[data-save]').disabled=!dirty.has(key)||saving.has(key);markHistory(key,e);return e;
 }
 function grow(e){e.style.height='auto';e.style.height=Math.max(60,e.scrollHeight+2)+'px';}
 function blockEditor(block){const key='record:'+block.id;let e=document.querySelector('[data-part="'+key+'"]');if(!e){e=document.createElement('div');e.className='record-part';e.innerHTML='<div class="paragraph" contenteditable="true" role="textbox" aria-multiline="true" aria-label="會議段落"></div>';partControls(key,e);const area=e.querySelector('[contenteditable]');plainEditor(area);area.oninput=()=>mark(key,area.innerText,Number(e.dataset.version));}
  const area=e.querySelector('[contenteditable]');if(!dirty.has(key)&&document.activeElement!==area){const h=latest(key);area.innerHTML=h&&h.after_value===block.text?changeText(h,true):esc(block.text);area.style.setProperty('--change-color',h?.color||color(h?.actor_id||''));e.dataset.version=editData().versions[key]||0;}
  e.classList.toggle('empty-part',!block.text&&!dirty.has(key));area.classList.toggle('prose-heading',/^(重點與決議|重點摘要|會議內容|結論與決議|主要結論|下次會議)$|^#{1,3}\s/.test(block.text));area.contentEditable=String(!!editable());e.classList.toggle('dirty',dirty.has(key));e.querySelector('[data-save]').disabled=!dirty.has(key)||saving.has(key);markHistory(key,e);return e;
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
 async function saveSettings(){const value=settings();const next=await api({action:'edit',field:'settings',value,version:settingsVersion});acceptData(next);settingsVersion=Number(next.workspace.versions.settings||0);renderedSettingsVersion=settingsVersion;settingsDirty=!sameValue(value,settings());$('#settingsStatus').textContent=settingsDirty?'儲存期間的新輸入仍保留，請再次儲存':'設定已儲存；原會議內容保持';render();}
 function options(selected){return '<option value="">不指定負責人</option>'+memberList.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+(p.workReady?'':'（待連接工作日誌）')+'</option>').join('')+(selected&&!memberList.some(p=>p.id===selected)?'<option selected value="'+esc(selected)+'">'+esc(data.workspace.ownerNames?.[selected]||'原負責人（待重新確認）')+'</option>':'');}

 function todoEditor(key,t,index){let e=document.querySelector('[data-part="'+key+'"]');const created=!e;if(!e){e=document.createElement('li');e.className='todo-line';e.innerHTML='<h3 data-number></h3><div class="paragraph" data-content contenteditable="true" role="textbox" aria-multiline="true" aria-label="任務內容"></div><dl><div><dt>負責人</dt><dd><select data-owner aria-label="負責人"></select></dd></div><div><dt>截止日期</dt><dd><input data-due type="date" aria-label="截止日期"></dd></div></dl><details><summary>來源依據</summary><textarea class="auto-text" data-evidence aria-label="來源依據"></textarea></details>';partControls(key,e);plainEditor(e.querySelector('[data-content]'));
   const change=()=>mark(key,{content:e.querySelector('[data-content]').innerText,ownerId:e.querySelector('[data-owner]').value,due:e.querySelector('[data-due]').value,evidence:e.querySelector('[data-evidence]').value},Number(e.dataset.version));
   e.querySelectorAll('input,textarea,select,[contenteditable]').forEach(n=>n.addEventListener('input',change));
  }
  const delivery=data.assignment?.items.find(t=>t.id===key);e.querySelector('[data-number]').textContent='任務 '+index+(delivery?' · '+(delivery.state==='delivered'?'已派發':'待派發'):'');
  if(created||!dirty.has(key)&&!e.contains(document.activeElement)){e.querySelector('[data-content]').textContent=t.content;e.querySelector('[data-due]').value=t.due;e.querySelector('[data-evidence]').value=t.evidence;e.dataset.version=editData().versions[key]||0;}
  const select=e.querySelector('[data-owner]'),chosen=dirty.has(key)?dirty.get(key)?.ownerId:t.ownerId,html=options(chosen||'');if(select.innerHTML!==html&&document.activeElement!==select)select.innerHTML=html;
  e.querySelectorAll('textarea,input,select').forEach(n=>n.disabled=!editable());e.querySelector('[contenteditable]').contentEditable=String(!!editable());e.classList.toggle('dirty',dirty.has(key));e.querySelector('[data-save]').disabled=!dirty.has(key)||saving.has(key);markHistory(key,e);return e;
 }

 function prose(text){return String(text||'尚無會議內容。').split(/\r?\n/).map(line=>{if(!line.trim())return '';const heading=line.match(/^#{1,3}\s+(.+)$/);if(heading||['重點與決議','重點摘要','會議內容','結論與決議','主要結論','下次會議'].includes(line.trim()))return '<h3>'+esc(heading?heading[1]:line)+'</h3>';return '<p'+(/^[•・\-]\s/.test(line)?' class="prose-bullet"':'')+'>'+esc(line)+'</p>';}).join('');}
 function seek(seconds){$('#audio').currentTime=Number(seconds);$('#audio').play().catch(error);}
 function renderReader(){const r={...data.reader};if(memberList.length&&data.workspace.fields){const ts=Object.entries(data.workspace.fields).filter(([k,v])=>k.startsWith('todo:')&&v);r.todos=(r.todos||[]).map((t,i)=>({...t,owner:memberList.find(p=>p.id===ts[i]?.[1].ownerId)?.name||t.owner}));}const hash=JSON.stringify([r,data.assignment]);if(readingHash===hash)return;readingHash=hash;
  const openTopics=new Set(Array.from($('#readingRecordText').querySelectorAll('details[open]')).map(e=>e.dataset.decision));
  $('#readingRecordText').innerHTML=decisionRecordHtml(r.record)??prose(r.record);$('#readingRecordText').querySelectorAll('details[data-decision]').forEach(e=>e.open=openTopics.has(e.dataset.decision));$('#readingTranscriptText').textContent=r.transcript||r.warning||'這場會議未提供逐字稿。';
  const ts=r.todos||[];$('#readingTodoCount').textContent=ts.length?'（'+ts.length+' 項）':'（無）';$('#readingTodoList').innerHTML=ts.length?'<ol>'+ts.map((t,i)=>'<li><h3>任務 '+(i+1)+'</h3><p>'+esc(t.content)+'</p><dl><div><dt>負責人</dt><dd>'+esc(t.owner)+'</dd></div><div><dt>截止日期</dt><dd>'+esc(t.due)+'</dd></div></dl></li>').join('')+'</ol>':'<p class="muted">本次會議沒有待辦事項。</p>';
  $('#readingSegments').innerHTML=(r.segments||[]).map(s=>'<p><button class="secondary" data-time="'+Number(s.start/1000)+'">'+Math.floor(s.start/60000)+':'+String(Math.floor(s.start/1000)%60).padStart(2,'0')+' '+esc(s.speaker)+'</button> '+esc(s.text)+'</p>').join('')||'沒有可定位的逐字稿時間。';$('#readingSegments').querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>seek(b.dataset.time));
 }

 function render(){if(!data)return;let recovered=false;for(const key of dirty.keys())if(!saving.has(key))recovered=recoverSaved(key)||recovered;if(recovered&&!dirty.size&&!saving.size){contentSaveError='';error('');}if(data.access==='member'&&token&&window.initializeMeetingHub)window.initializeMeetingHub({id:BOOT.id,token});const w=data.workspace,locked=['publishing','published'].includes(w.state),review=['review','publishing','published'].includes(w.state),readOnly=data.access!=='member';
  if(!mode||w.state==='published'&&lastState&&lastState!=='published')mode=w.state==='published'?'view':'edit';lastState=w.state;if(readOnly)mode='view';
  const reading=review&&mode==='view';document.body.classList.toggle('reader-mode',reading);document.body.classList.toggle('collaboration-mode',review&&!reading);$('#pageHeading').textContent=reading?'會議記錄':'會議工作頁';
  $('#glossaryPageLink').href='/meetings/review/work/'+BOOT.id+'/glossary';
  if(BOOT.glossaryOnly&&!readOnly){document.body.classList.add('glossary-page');$('#pageHeading').textContent='共用會議詞庫';$('#pageSubtitle').textContent='管理正確用詞、同音字與背景說明';if(!glossaryOpened){glossaryOpened=true;$('#openGlossary').click();}}
  $('#glossaryPanel').hidden=readOnly||mode!=='edit'||!['setup','failed','review','published'].includes(w.state);
  $('#modeSwitch').hidden=!review||readOnly||w.state==='publishing';$('#viewMode').setAttribute('aria-pressed',String(mode==='view'));$('#editMode').setAttribute('aria-pressed',String(mode==='edit'));$('#editMode').hidden=!data.canEdit;$('#hostLogin').hidden=!readOnly;
  $('#connection').textContent=(readOnly?(data.access==='recipient'?'指定夥伴分享觀看':'連結分享觀看'):'已確認：'+data.actor.name)+' · '+statusNames[w.state];$('#title').textContent=data.reader?.topic||w.fields?.settings.topic||'會議工作頁';$('#source').textContent=(data.reader?.date||w.fields?.settings.date||'')+' · '+(data.reader?.filename||w.filename||'')+' · 主持人：'+(data.reader?.hostName||w.hostName||'');
  const assignments=data.assignment?.items||[],waiting=assignments.filter(t=>t.state==='pending');const deliveryNotice=w.state==='published'&&data.assignment?'個人任務：已派發 '+(assignments.length-waiting.length)+' 項，待派發 '+waiting.length+' 項。'+(data.assignment.message||(waiting.length?'未完成連線者完成 UOF／LINE 與工作日誌連線後，系統會自動補派。':'')):'';
  $('#notice').textContent=[w.warning,w.error,data.pendingRevision?.error_code|| (data.pendingRevision?'修改已儲存，正在依序同步正式記錄；個人任務另行派發。':''),deliveryNotice].filter(Boolean).join('\n');
  if(!audioUrl&&data.audioUrl){audioUrl=data.audioUrl;$('#audio').src=audioUrl;$('#audio').hidden=false;$('#audioStatus').textContent='原始會議錄音，按播放即可收聽。';}
  const returned=showingSettings&&w.state==='review'&&data.host&&editable();
  $('#setupPanel').hidden=readOnly||!['setup','failed'].includes(w.state)&&!returned;$('#processingPanel').hidden=w.state!=='processing';$('#recordPanel').hidden=!review||reading||returned;$('#todoPanel').hidden=!review||reading||returned;$('#historyPanel').hidden=readOnly||reading||returned;$('#publishPanel').hidden=!review||locked||reading||returned;$('#readerPanel').hidden=!reading;
  $('#reviewNavigation').hidden=!data.host||w.state!=='review'||!editable()||returned;$('#returnReview').hidden=!returned;$('#settingsReviewHint').hidden=!returned;$('#saveType').hidden=returned;
  $('#sharingPanel').hidden=!data.host||mode!=='edit'||w.state==='publishing';if(!sharingDirty){$('#shareEnabled').checked=!!data.sharing?.enabled;selectedPeople=data.sharing?.people||[];}renderSelected();$('#revisionPanel').hidden=true;if(reading)renderReader();if(!data.pendingRevision)document.querySelectorAll('[data-status]').forEach(e=>{if(e.textContent==='已儲存，正在同步正式記錄與任務')e.textContent='已儲存';});
  document.querySelectorAll('[data-step]').forEach(e=>e.classList.toggle('active',e.dataset.step===(returned?'setup':locked?'published':review?'review':'setup')));
  if(!readOnly&&['setup','failed','review'].includes(w.state))setup(w.fields.settings);
  $('#start').hidden=!data.host||w.state==='review';$('#publish').hidden=!data.host||locked;$('#publishText').textContent='原對話成員各自儲存修改後，由主持人首次發布。尚未完成 UOF／LINE 與工作日誌連線的負責人不影響發布；任務先保留待派發，完成連線後自動補派。發布後仍可分段修改並儲存。';
  if(review&&!reading){const editing=editData(),blocks=[...editing.blocks];for(const [key,b]of newBlocks)if(!blocks.some(x=>'record:'+x.id===key))blocks.push({id:key.slice(7),text:dirty.get(key)||''});
   const ids=new Set(blocks.map(b=>'record:'+b.id));for(const e of $('#recordEditor').children)if(!ids.has(e.dataset.part))e.remove();
   for(const b of blocks){const e=blockEditor(b);if(!e.parentNode)$('#recordEditor').append(e);}
   const tr=editor('transcript','逐字稿',editing.fields.transcript);if(!tr.parentNode)$('#transcriptEditor').append(tr);if($('#transcriptEditor').getClientRects().length)grow(tr.querySelector('textarea'));
   const keys=new Set(Object.entries(editing.fields).filter(([k,v])=>k.startsWith('todo:')&&v).map(([k])=>k));for(const k of dirty.keys())if(k.startsWith('todo:'))keys.add(k);
   for(const e of $('#todos').children)if(!keys.has(e.dataset.part))e.remove();let index=0;
   for(const k of keys){const value=dirty.get(k)||editing.fields[k];if(!value)continue;const e=todoEditor(k,value,++index);if(!e.parentNode)$('#todos').append(e);}
   $('#editTodoCount').textContent=index?'（'+index+' 項）':'（無）';$('#noEditTodos').hidden=!!index;
   $('#addTodo').hidden=!editable();$('#addRecordBlock').hidden=!editable();$('#refreshMembers').hidden=!editable();$('#speakerFix').hidden=!editable();$('#replaceSpeaker').hidden=!editable();
   renderSpeakerCorrection();
   if(!membersLoaded&&editable())loadMembers().catch(error);
  }
  $('#online').innerHTML=(data.presence||[]).map(p=>'<span class="person" style="--person-color:'+color(p.id)+'">'+esc(p.name)+(p.field?' · 正在編輯':'')+'</span>').join('');
  contentSaveState();
 }
 function renderSelected(){const box=$('#sharedPeople');if(!box)return;const key=JSON.stringify(selectedPeople);if(box.dataset.key===key)return;box.dataset.key=key;box.innerHTML=selectedPeople.map(p=>'<span class="selected-person"><span>'+esc(p.name)+' <small>'+esc(p.account)+'</small></span><button class="secondary" aria-label="移除 '+esc(p.name)+' '+esc(p.account)+'" data-account="'+esc(p.account)+'">移除</button></span>').join('')||'<p class="muted">尚未指定分享夥伴。</p>';box.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{selectedPeople=selectedPeople.filter(p=>p.account!==b.dataset.account);markSharingDirty();$('#sharingStatus').textContent='分享名單尚未儲存';renderSelected();});}
 function transcriptValue(){return dirty.has('transcript')?dirty.get('transcript'):editData().fields.transcript||'';}
 function speakerNames(){const speakers=(data.workspace.state==='review'?settings():editData().fields.settings).speakers||[],full=s=>s.name+(s.role?'('+s.role+')':''),known=speakers.filter(s=>s.name.trim()).map(full),entries=speakerTools.entries(transcriptValue()),observed=entries.filter(e=>e.timestamp||known.includes(e.speaker)||/^講(?:話)?者\s*[A-Z]$/.test(e.speaker)).map(e=>e.speaker);return [...new Set([...known.filter(s=>observed.includes(s)),...observed,...known])];}
 function renderSpeakerCorrection(){
  if(speakerUndo&&speakerUndo.every(c=>!dirty.has(c.key)&&Number(editData().versions[c.key]||0)>c.version)){
   speakerUndo=null;$('#speakerStatus').textContent=data.pendingRevision?'講話者修正已儲存，正在同步正式記錄。':'講話者修正已儲存；待辦負責人保持。';
  }
  const names=speakerNames(),html=names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');
  for(const [id,index]of [['swapFirst',0],['swapSecond',1]]){const e=$('#'+id);if(e.dataset.options!==html){const previous=e.value;e.innerHTML=html;e.value=names.includes(previous)?previous:names[index]||names[0]||'';e.dataset.options=html;}}
  $('#swapSpeakers').disabled=names.length<2||saving.size>0||savingAll;
  $('#undoSpeaker').hidden=!speakerUndo;
  if(!$('#segmentCorrection').open)return;
  const text=transcriptValue(),hash=JSON.stringify([text,names]);if(hash===segmentsHash)return;segmentsHash=hash;$('#segments').replaceChildren();
  for(const entry of speakerTools.entries(text).filter(e=>e.timestamp||names.includes(e.speaker))){const row=document.createElement('div');row.className='speaker-segment';row.dataset.line=entry.line;const label=document.createElement('label');label.textContent=(entry.timestamp?'['+entry.timestamp+'] ':'')+'講話者';const select=document.createElement('select');select.setAttribute('aria-label',label.textContent);select.innerHTML=names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');select.value=entry.speaker;label.append(select);row.append(label);const p=document.createElement('p');p.textContent=entry.text;row.append(p);
   if(entry.start!==null){const play=document.createElement('button');play.type='button';play.className='secondary';play.textContent='播放此段';play.onclick=()=>seek(entry.start/1000);row.append(play);}
   const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.textContent='套用此段';apply.onclick=()=>{if(transcriptValue()!==text){error('逐字稿剛有修改，請重新選擇這一段。');segmentsHash='';renderSpeakerCorrection();return;}previewSpeakers({[entry.speaker]:select.value},{line:entry.line,time:entry.timestamp||null});};row.append(apply);$('#segments').append(row);
  }
  if(!$('#segments').children.length)$('#segments').textContent='尚無可辨識的講話者段落，可在下方逐字稿直接修正。';
 }
 function previewSpeakers(mapping,scope={}){
  if(!editable()||saving.size||savingAll)return;
  if(Object.entries(mapping).some(([a,b])=>!a.trim()||!b.trim()||b.length>240||/[\r\n：:]/.test(b))){error('請填寫有效的講話者姓名，不可含換行或冒號。');return;}
  const changes=[],transcript=transcriptValue(),after=speakerTools.replace(transcript,mapping,{line:scope.line??null});
  if(after!==transcript)changes.push({key:'transcript',before:transcript,after,version:Number(document.querySelector('[data-part="transcript"]').dataset.version)});
  // Only timestamp-matched evidence follows a single-segment correction.
  const uniqueTime=scope.time&&speakerTools.entries(transcript).filter(e=>e.timestamp===scope.time&&Object.hasOwn(mapping,e.speaker)).length===1;
  for(const e of $('#recordEditor').children){const key=e.dataset.part,area=e.querySelector('[contenteditable]'),before=area.innerText,value=scope.line!==undefined&&!uniqueTime?before:speakerTools.replace(before,mapping,{time:scope.time||null});if(value!==before)changes.push({key,before,after:value,version:Number(e.dataset.version)});}
  if(!changes.length){error('找不到符合的講話者標示，原內容保持。');return;}
  speakerPlan={changes};$('#speakerPreview').textContent=Object.entries(mapping).map(([a,b])=>a+' → '+b).join('\n')+'\n\n將修改 '+changes.length+' 處內容。'+(scope.line!==undefined?(uniqueTime?'僅此段逐字稿與相同時間的對話依據。':'僅此段逐字稿；時間未能唯一對應，請另行核對會議記錄的對話依據。'):'整份逐字稿及明確講話者標示。')+'\n\n'+changes.slice(0,5).map(c=>'修改前：'+c.before.slice(0,500)+'\n修改後：'+c.after.slice(0,500)).join('\n\n');$('#speakerDialog').showModal();error('');
 }
 function setSpeakerValue(key,value,version){const e=document.querySelector('[data-part="'+key+'"]'),area=e.querySelector(key==='transcript'?'textarea':'[contenteditable]');if(key==='transcript')area.value=value;else area.textContent=value;mark(key,value,version);}
 $('#segmentCorrection').addEventListener('toggle',()=>{if(data&&editable())renderSpeakerCorrection();});
 $('#swapSpeakers').onclick=()=>{const a=$('#swapFirst').value,b=$('#swapSecond').value;if(a===b){error('請選擇兩位不同的講話者。');return;}previewSpeakers({[a]:b,[b]:a});};
 $('#replaceSpeaker').onclick=()=>previewSpeakers({[$('#oldSpeaker').value.trim()]:$('#newSpeaker').value.trim()});
 $('#cancelSpeaker').onclick=()=>{speakerPlan=null;$('#speakerDialog').close();};
 $('#applySpeaker').onclick=()=>{
  const plan=speakerPlan;if(!plan||!editable()||saving.size||savingAll)return;
  if(plan.changes.some(c=>{const e=document.querySelector('[data-part="'+c.key+'"]'),area=e?.querySelector(c.key==='transcript'?'textarea':'[contenteditable]'),text=c.key==='transcript'?area?.value:area?.innerText;return text!==c.before||Number(e?.dataset.version)!==c.version;})){$('#speakerDialog').close();error('預覽期間內容已改變，請重新預覽；你的輸入仍保留。');return;}
  speakerUndo=plan.changes.map(c=>({...c,wasDirty:dirty.has(c.key),priorValue:structuredClone(dirty.get(c.key)),priorVersion:versions.get(c.key)}));
  for(const c of plan.changes)setSpeakerValue(c.key,c.after,c.version);speakerPlan=null;$('#speakerDialog').close();$('#speakerStatus').textContent='已套用到畫面，尚未儲存；請檢查講話者，再按「儲存內容修改」。待辦負責人保持。';renderSpeakerCorrection();
 };
 $('#undoSpeaker').onclick=()=>{
  if(!speakerUndo||saving.size||savingAll)return;
  if(speakerUndo.some(c=>!dirty.has(c.key)||dirty.get(c.key)!==c.after||Number(editData().versions[c.key]||0)!==c.version)){error('內容已另行修改或儲存，請用交換或逐段修正建立新的修改，避免覆蓋後續內容。');return;}
  for(const c of speakerUndo){setSpeakerValue(c.key,c.before,c.version);if(c.wasDirty){dirty.set(c.key,c.priorValue);versions.set(c.key,c.priorVersion);}else{dirty.delete(c.key);versions.delete(c.key);}}speakerUndo=null;$('#speakerStatus').textContent='已復原上次講話者修正，先前編輯仍保留。';render();
 };
 function markSharingDirty(base){if(!sharingDirty)sharingBase=base||{version:data.sharing.version};sharingDirty=true;}

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
 $('#setupPanel').addEventListener('input',()=>{settingsDirty=true;$('#settingsStatus').textContent='尚未儲存設定';schedulePreview();contentSaveState();});
 $('#type').onchange=()=>{const custom=$('#type').value==='custom';$('#customTypeBox').hidden=!custom;if(!custom)$('#prompt').value=data.types.find(t=>t.name===$('#type').value).prompt;settingsDirty=true;schedulePreview();};
 $('#addSpeaker').onclick=()=>{const s=settings().speakers;if(s.length>=40)return;s.push({name:'',gender:'',role:''});renderSpeakers(s);settingsDirty=true;};
 $('#saveSettings').onclick=()=>saveSettings().catch(error);
 $('#saveType').onclick=async()=>{try{const s=settings(),prior=data.types.find(t=>t.name===s.type);data=await api({action:'save-type',name:s.type,prompt:s.prompt,version:prior?.version||0});$('#settingsStatus').textContent='已保存為本對話可重複選用的會議類型；本場設定仍請儲存。';}catch(e){error(e);}};
 $('#start').onclick=async()=>{if(busy)return;busy=true;try{if(settingsDirty)await saveSettings();data=await api({action:'start',revision:data.workspace.revision});render();}catch(e){error(e);}finally{busy=false;}};
 $('#addTodo').onclick=()=>{const k='todo:'+crypto.randomUUID();mark(k,{content:'',ownerId:'',due:meetingDueDate(editData().fields.settings,new Date(Date.now()+8*3600000).toISOString().slice(0,10)),evidence:''});render();};
 $('#refreshMembers').onclick=()=>loadMembers().catch(error);
 $('#publish').onclick=()=>{if(dirty.size||settingsDirty||saving.size){error('尚有內容未儲存，請先完成儲存再發布。');return;}const ts=Object.entries(data.workspace.fields).filter(([k,v])=>k.startsWith('todo:')&&v).map(([,v])=>v);if(ts.some(t=>!t.content.trim()||t.ownerId&&!t.due)){error('請補齊待辦內容；已選負責人的待辦必須填截止日期。');return;}$('#confirmText').textContent='會議：'+data.workspace.fields.settings.topic+'。將依連線狀態派發 '+ts.filter(t=>t.ownerId).length+' 項個人任務，保留 '+ts.filter(t=>!t.ownerId).length+' 項未分派待辦。尚未連線者不影響發布，完成連線後自動補派。';$('#confirmError').textContent='';$('#confirmStatus').textContent='';$('#confirmDialog').dataset.revision=data.workspace.revision;$('#confirmDialog').showModal();};
 $('#cancelPublish').onclick=()=>$('#confirmDialog').close();
 $('#confirmDialog').addEventListener('cancel',e=>{if(publishing)e.preventDefault();});
 $('#confirmPublish').onclick=async()=>{if(busy)return;busy=true;publishing=true;error('');$('#confirmStatus').textContent='正在核對身分並送出發布，請稍候…';$('#confirmPublish').textContent='正在確認發布…';for(const id of ['confirmPublish','cancelPublish','refreshPublish'])$('#'+id).disabled=true;try{data=await api({action:'publish',revision:Number($('#confirmDialog').dataset.revision)});$('#confirmDialog').close();render();}catch(e){error(e);}finally{busy=false;publishing=false;$('#confirmStatus').textContent='';$('#confirmPublish').textContent='確認發布';for(const id of ['confirmPublish','cancelPublish','refreshPublish'])$('#'+id).disabled=false;}};
 $('#refreshPublish').onclick=async()=>{if(busy)return;busy=true;try{data=await api({action:'read'});if(['publishing','published'].includes(data.workspace.state)){$('#confirmDialog').close();render();}else error('尚未發布，內容仍可修改。請返回檢查提示，確認後重新開啟發布視窗。');}catch(e){error(e);}finally{busy=false;}};

 $('#loadHistory').onclick=async()=>{try{historyOffset=0;$('#history').innerHTML='';await loadHistory();}catch(e){error(e);}};
 async function loadHistory(){const j=await api({action:'history',offset:historyOffset});$('#history').insertAdjacentHTML('beforeend',j.history.map(h=>'<details style="--change-color:'+esc(h.color||color(h.actor_id))+'"><summary><span class="edit-author">'+esc(h.actor_name)+' 編輯</span> · '+esc(h.field.startsWith('todo:')?'待辦事項':h.field.startsWith('record:')?'會議段落':({settings:'會議設定',record:'會議記錄',transcript:'逐字稿',sharing:'分享權限',published_revision:'正式會議修訂'}[h.field]||h.field))+' · '+esc(new Date(h.created_at).toLocaleString('zh-TW'))+'</summary><div class="change-text">'+changeText(h)+'</div></details>').join('')||'尚無人工修改紀錄。');historyOffset+=j.history.length;$('#moreHistory').hidden=j.history.length<100;}
 $('#moreHistory').onclick=()=>loadHistory().catch(error);

 $('#addRecordBlock').onclick=()=>{const key='record:'+crypto.randomUUID().replaceAll('-',''),blocks=[...editData().blocks,...[...newBlocks.keys()].map(k=>({id:k.slice(7)}))];newBlocks.set(key,{after:blocks.at(-1)?.id||null});mark(key,'',0);render();document.querySelector('[data-part="'+key+'"] [contenteditable]').focus();};
 $('#backSettings').onclick=()=>{if(!data.host||data.workspace.state!=='review')return;showingSettings=true;render();$('#setupPanel').scrollIntoView?.({block:'start'});};
 $('#returnReview').onclick=()=>{showingSettings=false;render();$('#recordPanel').scrollIntoView?.({block:'start'});};
 $('#viewMode').onclick=()=>{mode='view';render();};
 $('#saveContent').onclick=async()=>{if(savingAll||saving.size||!editable())return;savingAll=true;contentSaveError='';contentSaveState();try{if(settingsDirty){await saveSettings();if(settingsDirty)throw Error('設定仍有新輸入，請再次儲存。');}for(const key of [...dirty.keys()])await save(key);}catch(err){error(err);}finally{savingAll=false;contentSaveState();}};
 $('#editMode').onclick=()=>{if(!data.canEdit)return;mode='edit';render();};
 $('#shareEnabled').onchange=()=>{markSharingDirty();$('#sharingStatus').textContent='尚未儲存分享設定';};
 $('#choosePeople').onclick=async()=>{const button=$('#choosePeople');button.disabled=true;try{$('#organizationStatus').textContent='正在讀取最新組織架構…';const j=await api({action:'organization'}),base={version:data.sharing.version},original=selectedPeople.map(p=>p.account).sort().join(','),picked=await window.chooseMeetingPeople({organization:j.organization,selected:selectedPeople,title:'選擇分享對象'});if(picked){if(picked.map(p=>p.account).sort().join(',')!==original){markSharingDirty(base);$('#sharingStatus').textContent='分享名單尚未儲存';}if(sharingDirty)selectedPeople=picked;renderSelected();}$('#organizationStatus').textContent='選好後請按「儲存分享設定」才會生效。';}catch(e){$('#organizationStatus').textContent='組織架構讀取未完成，原分享名單保持。';error(e);}finally{button.disabled=false;button.focus();}};
 $('#saveSharing').onclick=async()=>{if(busy)return;busy=true;$('#saveSharing').disabled=true;try{data=await api({action:'sharing',enabled:$('#shareEnabled').checked,accounts:selectedPeople.map(p=>p.account),revision:data.workspace.revision,version:sharingBase?.version??data.sharing.version});sharingDirty=false;sharingBase=null;audioUrl='';$('#sharingStatus').textContent='分享設定已儲存。發布後，指定夥伴可從 Rich Menu「會議」的「分享給我的會議」閱讀與收聽；不發送 LINE 推播。';render();error('');}catch(e){error(e);}finally{busy=false;$('#saveSharing').disabled=false;}};

 let audioRetries=0;
 $('#audio').onerror=async()=>{if(audioRetries++<2&&data?.audioUrl&&data.audioUrl!==audioUrl){const player=$('#audio'),at=player.currentTime;audioUrl=data.audioUrl;player.src=audioUrl;player.currentTime=at;$('#audioStatus').textContent='正在更新錄音播放授權，請再按播放。';return;}$('#audioStatus').textContent='錄音暫時無法播放。可重新整理頁面再試，原始錄音仍保留。';};
 window.addEventListener('beforeunload',e=>{if(dirty.size||settingsDirty||sharingDirty){e.preventDefault();e.returnValue='';}});
 async function refresh(){if(polling||publishing||document.hidden||!data)return;polling=true;try{const active=document.activeElement,field=mode==='edit'?(active?.closest('[data-part]')?.dataset.part||(active?.closest('#setupPanel')?'settings':'')):'';acceptData(await api({action:'read',field}));render();}catch(e){error(e);if(data?.access!=='member'&&[401,403].includes(e.status)){$('#readerPanel').hidden=true;$('#meetingHeading').hidden=true;$('#connection').textContent='此連結已停止對外分享';$('#hostLogin').hidden=false;$('#audio').pause();$('#audio').removeAttribute('src');audioUrl='';}}finally{polling=false;}}
 async function login(){if(!BOOT.liffId||!window.liff)throw Error('LINE 登入尚未設定完成，請聯絡管理者。');await liff.init({liffId:BOOT.liffId});if(!liff.isLoggedIn()){liff.login({redirectUri:location.origin+'/meetings/review/work/'+BOOT.id});return false;}token=liff.getAccessToken();return true;}
 $('#hostLogin').onclick=async()=>{try{if(!await login())return;data=await api({action:'read'});audioUrl='';$('#meetingHeading').hidden=false;render();if(data.access!=='member')error('此身分僅可觀看；編輯限原對話成員。');else error('');}catch(e){error(e);}};
 async function init(){try{if(BOOT.loginUrl&&location.origin!==new URL(BOOT.loginUrl).origin){location.replace(BOOT.loginUrl);return;}if(!BOOT.publicAvailable&&!await login())return;data=await api({action:'read'});render();setInterval(refresh,5000);}catch(e){error(e);$('#connection').textContent='尚未完成身分驗證';$('#hostLogin').hidden=false;}}
 init();
}

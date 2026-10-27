// Injected inside the original review closure; never submits or alters a ticket.
const urgency=createUrgency();
let urgencyOffset=0;
const urgencyNow=()=>Date.now()+urgencyOffset;
const urgencyDate=value=>new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
function urgencyChips(items){const c=urgency.counts(items,urgencyNow()),box=nodes('div',null,'urgency-chips');for(const [key,label]of [['red','24 小時內（含逾期）'],['orange','超過 24 至 48 小時'],['green','超過 48 至 72 小時'],['unknown','待確認']]){if(key==='unknown'&&!c[key])continue;const chip=nodes('span',(key==='unknown'?'待確認 ':'● ')+c[key],'urgency-chip urgency-'+key);chip.setAttribute('aria-label',label+'，'+c[key]+'筆');box.append(chip);}if(c.overdue)box.append(nodes('span','其中逾期 '+c.overdue,'urgency-overdue'));return box;}
function urgencyBadge(item){const box=nodes('div',null,'urgency-detail');box.dataset.urgencyTask=item.taskId;updateUrgencyBadge(box,item);return box;}
function updateUrgencyBadge(box,item){const u=urgency.evaluate(item,urgencyNow());box.className='urgency-detail urgency-'+u.color;box.replaceChildren(nodes('strong',(u.color==='unknown'?'':'● ')+u.label));if(u.dueAt)box.append(nodes('span',u.levelLabel+'（'+u.hours+' 小時內） · 截止 '+urgencyDate(u.dueAt),'urgency-deadline'));}
function installUrgencyFilter(){let filter=$('urgencyFilter');if(!filter){const label=nodes('label','剩餘可簽核時間');label.htmlFor='urgencyFilter';filter=nodes('select');filter.id='urgencyFilter';for(const [key,text]of [['all','全部時間'],['red','24 小時內（含逾期）'],['overdue','只看已逾期'],['orange','超過 24 至 48 小時'],['green','超過 48 至 72 小時'],['unknown','時間或等級待確認']]){const option=nodes('option',text);option.value=key;filter.append(option);}filter.onchange=()=>{S.urgency=filter.value;S.page=0;renderList();};$('listFilter').after(label,filter);}filter.value=S.urgency||'all';}
function urgencyMatches(item){const u=urgency.evaluate(item,urgencyNow());return !S.urgency||S.urgency==='all'||(S.urgency==='overdue'?u.overdue:u.color===S.urgency);}
function updateUrgency(){if(document.hidden)return;for(const box of document.querySelectorAll('[data-urgency-task]')){const item=S.cases.find(c=>c.taskId===box.dataset.urgencyTask)||S.current?.item;if(item)updateUrgencyBadge(box,item);}if(S.view==='categories')renderCategories();}
// Only text/status updates: preserve open forms, selection, inline content and queue.
setInterval(updateUrgency,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateUrgency();});

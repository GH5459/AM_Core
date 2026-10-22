export const reporterScript=String.raw`
function reporterForm(t,action='reopen',stale=false){
 const form=el('form'),button=el('button',action==='reopen'?'仍有問題':'補充說明或照片'),label=el('label','目前還遇到什麼情況？'),detail=el('textarea'),fileLabel=el('label','補充照片（選填，最多10張，合計10MB）'),file=el('input'),message=el('p',undefined,'subtle'),send=el('button','送出補充','primary'),cancel=el('button','取消'),row=el('div',undefined,'row');
 form.hidden=true;form.id='reporter-'+t.id;button.type='button';button.disabled=stale;button.dataset.stale=String(stale);detail.maxLength=4000;detail.setAttribute('aria-label','目前還遇到什麼情況');label.append(detail);file.type='file';file.multiple=true;file.accept='image/png,image/jpeg,image/webp';file.setAttribute('aria-label','補充照片');fileLabel.append(file);send.type='submit';cancel.type='button';row.append(send,cancel);form.append(el('h3',action==='reopen'?'告訴葉小蝸哪裡還有問題':'補充原案件'),label,fileLabel,message,row);
 let pending=null;const storeKey='reporter:'+t.id;
 async function open(){form.hidden=false;try{pending=await feedbackStore(storeKey);if(pending&&t.history.some(h=>h.id===pending.operationId)){await feedbackStore(storeKey,null,true);pending=null;}if(pending){detail.value=pending.detail;detail.disabled=true;file.disabled=true;send.textContent='重試送出同一筆補充';message.textContent='上次送出結果尚待確認，原文字與照片保留，重試不會重複建立。';}}catch(error){failure(error);}detail.focus();}
 button.onclick=()=>form.hidden?open():form.hidden=true;cancel.onclick=()=>{form.hidden=true;button.focus();};
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;try{
  pending=await feedbackStore(storeKey);if(!pending){const images=[],files=Array.from(file.files||[]);if(files.length>10||files.reduce((n,f)=>n+f.size,0)>10*1024*1024)throw Error('最多10張照片，合計10MB。');for(const f of files)images.push(await feedbackImage(f));const text=detail.value.trim();if(!text&&!images.length)throw Error('請填寫說明或選擇照片。');pending={version:t.version,operationId:crypto.randomUUID(),detail:text,images};await feedbackStore(storeKey,pending);}
  busy=true;send.disabled=true;cancel.disabled=true;detail.disabled=true;file.disabled=true;message.textContent='正在保存補充…';await api('/api/xiaoye/issues/'+t.id+'/'+action,pending);await feedbackStore(storeKey,null,true);history.replaceState(null,'','/xiaoye?issue='+encodeURIComponent(t.id));busy=false;await load();$('#issues').prepend(el('p','補充已送出，葉小蝸會接續原案件確認。','stage'));
 }catch(error){busy=false;send.disabled=false;cancel.disabled=false;if(error.status>=400&&error.status<500){await feedbackStore(storeKey,null,true).catch(()=>{});pending=null;detail.disabled=false;file.disabled=false;message.textContent='本次尚未保存，請依提示調整或重新讀取案件。';}else message.textContent='尚未確認送出，原內容保留，可重試同一筆。';failure(error);}};
 return {button,form,open};
}
`;

// Browser-only controller: uncertain writes can only be followed by a read.
export function meetingStartFeedback({button,status,checkButton,beforeStart,start,read,onData,getState,isBusy,setBusy,report}){
 let pending=false,uncertain=false;
 const show=(message,failed=false)=>{status.textContent=message;status.className=failed?'error':'field-status';};
 const lock=()=>{button.disabled=pending||uncertain;checkButton.disabled=pending;checkButton.hidden=!uncertain;};
 const observed=value=>{onData(value);const state=getState();uncertain=!['setup','failed','processing','review','publishing','published'].includes(state);if(uncertain){show('尚未確認整理狀態，請稍後再檢查；不要重送整理。',true);return;}
  show(state==='setup'?'尚未開始整理。請確認設定後，再按一次整理。':state==='failed'?'整理未完成，請查看失敗提示；原錄音保留。':'已受理整理，請查看目前進度。',state==='failed');};
 async function submit(){
  if(pending||uncertain||isBusy())return;
  pending=true;setBusy(true);lock();show('正在儲存設定並送出整理，請稍候…');let sent=false;
  try{await beforeStart();show('正在送出整理，請稍候…');sent=true;observed(await start());}
  catch(e){uncertain=sent&&![400,401,403,409,422].includes(e.status);
   const message=uncertain?'尚未確認整理是否已受理。原錄音保留，請先按「檢查整理狀態」，不要重送。':(e.message||'整理尚未開始，請檢查設定。');
   show(message,true);report(message);
  }finally{pending=false;setBusy(false);lock();}
 }
 async function check(){
  if(pending||isBusy())return;pending=true;setBusy(true);lock();show('正在檢查整理狀態，不會重新送出…');
  try{observed(await read());}catch(e){uncertain=true;show('暫時讀不到整理狀態，請稍後再檢查；不要重送整理。',true);report(e);}
  finally{pending=false;setBusy(false);lock();}
 }
 button.onclick=submit;checkButton.onclick=check;
 return {submit,check,guard:message=>show(message,true)};
}

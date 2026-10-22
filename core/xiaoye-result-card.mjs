import {externalBrowserUrl} from './line-external-browser.mjs';
export const RESULT_CONTRACT='xiaoye-simple-result-v1';
export function resultSummary(value){
 const text=String(value||'').trim(),sentence=text.split(/(?<=[。！？])/u)[0]?.split('\n')[0]?.trim();
 return sentence&&[...sentence].length<=100?sentence:'已完成處理，請依原操作再試一次；若還有問題，可以補充文字或照片。';
}
export function resultCommand(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^xiaoye:result:confirm:(work-[a-f0-9-]{36}):([1-9][0-9]{0,8})$/);
 return m?{taskId:m[1],version:Number(m[2])}:null;
}
export function resultText(task){return '請確認處理結果：'+task.title+'\n'+resultSummary(task.secretary?.result?.text)+'\n請選「已解決」或「仍有問題」。';}
export function resultCard(origin,task){
 const url=new URL('/xiaoye',origin);url.searchParams.set('issue',task.id);url.searchParams.set('action','reopen');url.searchParams.set('resultVersion',String(task.version));
 return {type:'flex',altText:('請確認處理結果：'+task.title).slice(0,400),contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:'請試試看，問題解決了嗎？',weight:'bold',color:'#176451',wrap:true},{type:'text',text:task.title,weight:'bold',wrap:true},{type:'text',text:resultSummary(task.secretary?.result?.text),wrap:true}]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[{type:'button',style:'primary',color:'#176451',action:{type:'postback',label:'已解決',data:'xiaoye:result:confirm:'+task.id+':'+task.version}},{type:'button',style:'secondary',action:{type:'uri',label:'仍有問題',uri:externalBrowserUrl(url.href)}}]}}};
}

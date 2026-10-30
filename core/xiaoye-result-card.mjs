export const RESULT_CONTRACT='xiaoye-completion-explanation-v2';
export function completionExplanation(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(Error('完成前請簡短填寫原因、處理方式和結果。'),{status:400});
 const result={};
 for(const [key,label]of [['cause','原因'],['handling','處理方式'],['outcome','結果']]){
  const text=typeof value[key]==='string'?value[key].trim():'';
  if(!text||[...text].length>120||/[\r\n]/.test(text))throw Object.assign(Error(label+'請用120字內的一段白話說明，不可留空。'),{status:400});
  result[key]=text;
 }
 return result;
}
export function resultLines(result){
 if(result?.kind==='guidance'&&typeof result.text==='string'&&result.text.trim())return [result.text.trim()];
 if(result?.explanation){try{const e=completionExplanation(result.explanation);return ['原因：'+e.cause,'處理方式：'+e.handling,'結果：'+e.outcome];}catch{}}
 return [resultSummary(result?.text)];
}
export function resultSummary(value){
 const text=String(value||'').trim(),sentence=text.split(/(?<=[。！？])/u)[0]?.split('\n')[0]?.trim();
 return sentence&&[...sentence].length<=100?sentence:'已完成處理，請依原操作再試一次；若還有問題，可以補充文字或照片。';
}
export function resultCommand(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^xiaoye:result:(confirm|reopen|followup):(work-[a-f0-9-]{36}):([1-9][0-9]{0,8})$/);
 return m?{taskId:m[2],version:Number(m[3]),...(m[1]==='reopen'?{reopen:true}:m[1]==='followup'?{followup:true}:{})}:null;
}
export function questionCard(task,question){return {type:'flex',altText:('需要補充：'+task.title).slice(0,400),contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:'想請你補充',weight:'bold',wrap:true},{type:'text',text:task.title,weight:'bold',wrap:true},{type:'text',text:question,wrap:true}]},footer:{type:'box',layout:'vertical',contents:[{type:'button',style:'primary',action:{type:'postback',label:'回覆這個問題',data:'xiaoye:result:followup:'+task.id+':'+task.version}}]}}};}
export function resultText(task){return '請確認處理結果：'+task.title+'\n'+resultLines(task.secretary?.result).join('\n')+'\n請選「已解決」或「仍有問題」。';}
export function resultCard(origin,task){
 return {type:'flex',altText:('請確認處理結果：'+task.title).slice(0,400),contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:'請試試看，問題解決了嗎？',weight:'bold',color:'#176451',wrap:true},{type:'text',text:task.title,weight:'bold',wrap:true},...resultLines(task.secretary?.result).map(text=>({type:'text',text,wrap:true}))]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[{type:'button',style:'primary',color:'#176451',action:{type:'postback',label:'已解決',data:'xiaoye:result:confirm:'+task.id+':'+task.version}},{type:'button',style:'secondary',action:{type:'postback',label:'仍有問題',data:'xiaoye:result:reopen:'+task.id+':'+task.version}}]}}};
}

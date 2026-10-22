// Persistent actions belong to one draft; later messages cannot hide or retarget them.
export function intakeCard(text,value={},url='https://dailylog.chatgpt-673.workers.dev/xiaoye'){
 const draft=value.draftId,scoped=value.draft&&/^draft-[a-f0-9]{64}$/.test(draft||'');
 const action=(label,data,style='secondary')=>({type:'button',style,height:'sm',action:{type:'postback',label,data}});
 const buttons=scoped?[action('完成回報','xiaoye:finish:'+draft,'primary'),action('取消回報','xiaoye:cancel:'+draft)]:[action('開始新回報','xiaoye:report')];
 buttons.push({type:'button',height:'sm',action:{type:'uri',label:'查看我的案件',uri:url}});
 if(!value.draft&&!value.cancelled&&!value.ended)buttons.push(action('結束補充','xiaoye:end'+(value.taskId?':'+value.taskId:'')));
 return {type:'flex',altText:text.slice(0,390),contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text,wrap:true,size:'md'}]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:buttons}}};
}
export function isIntakeImage(bytes){
 return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71||bytes[0]===255&&bytes[1]===216&&bytes[2]===255||new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
}

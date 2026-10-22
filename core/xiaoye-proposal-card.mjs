const names={am:'LINE 小助手',dailylog:'工作日誌',uof:'UOF 簽核'};
const shorten=(value,max)=>{const s=String(value||'').trim();return s.length>max?s.slice(0,max-1)+'…':s;};
export function proposalUrl(origin,task,action){const url=new URL('/xiaoye',origin);url.searchParams.set('issue',task.id);url.searchParams.set('review',task.secretary.proposal.hash);url.searchParams.set('action',action);return url.href;}
export function proposalImpact(p){return p.systems.map(x=>names[x]||x).join('、')+'；'+(p.deploy?'包含正式發布':'本次不含正式發布');}
export function proposalText(t){const p=t.secretary.proposal;return '葉小蝸提案待核准｜第 '+p.version+' 版\n問題案名：'+t.title+'\n回報人：'+t.secretary.reporters.map(x=>x.name||'回報同仁').join('、')+'\n問題說明：'+shorten(t.description,500)+'\n處理方式：'+shorten(p.summary,400)+'\n影響：'+proposalImpact(p);}
export function proposalCard(origin,t){
 const p=t.secretary.proposal;
 const field=(label,value)=>({type:'box',layout:'vertical',spacing:'xs',contents:[{type:'text',text:label,weight:'bold',size:'sm',color:'#176451'},{type:'text',text:shorten(value,650)||'未提供',wrap:true,size:'sm',color:'#25342F'}]});
 return {type:'flex',altText:shorten('提案待核准｜'+t.title,400),contents:{type:'bubble',size:'mega',header:{type:'box',layout:'vertical',contents:[{type:'text',text:'待你核准｜方案第 '+p.version+' 版',weight:'bold',color:'#176451',wrap:true}]},body:{type:'box',layout:'vertical',spacing:'lg',contents:[field('問題案名',t.title),field('回報人與問題說明','回報人：'+t.secretary.reporters.map(x=>x.name||'回報同仁').join('、')+'\n'+shorten(t.description,440)),field('處理方式',shorten(p.summary,230)+'\n'+shorten(p.steps,360)),field('影響',proposalImpact(p)),{type:'text',text:'完整原文、圖片與查核方式請開啟原案件查看。',size:'xs',wrap:true,color:'#53675D'}]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[{type:'button',style:'primary',color:'#176451',action:{type:'uri',label:'同意此版方案',uri:proposalUrl(origin,t,'approve')}},{type:'button',style:'secondary',action:{type:'uri',label:'提供看法與建議',uri:proposalUrl(origin,t,'feedback')}}]}}};
}

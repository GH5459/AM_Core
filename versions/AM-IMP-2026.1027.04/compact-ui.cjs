const assert=require('node:assert/strict');
const once=(source,a,b)=>{assert.equal(source.split(a).length,2,'Unexpected UI baseline: '+a.slice(0,70));return source.replace(a,b);};
exports.inbox=source=>{
 source=once(source,"[['red','紅'],['orange','橘'],['green','綠'],['unknown','待確認']]","[['red',''],['orange',''],['green',''],['unknown','待確認']]");
 source=once(source,"link('● '+label+' '+counts[key]","link('● '+(label?label+' ':'')+counts[key]");
 return once(source,"if(counts.nearestDueAt){const next=items.map(i=>urgency.evaluate(i,Date.now()+offset)).filter(u=>u.dueAt).sort((a,b)=>a.remainingMs-b.remainingMs)[0];box.append(el('span','最早一筆：'+next.label,'uof-inbox-note'));}",'');
};
exports.review=source=>{
 source=once(source,"[['red','紅'],['orange','橘'],['green','綠'],['unknown','待確認']]","[['red','24 小時內（含逾期）'],['orange','超過 24 至 48 小時'],['green','超過 48 至 72 小時'],['unknown','待確認']]");
 source=once(source,"box.append(nodes('span',label+' '+c[key],'urgency-chip urgency-'+key));","const chip=nodes('span',(key==='unknown'?'待確認 ':'● ')+c[key],'urgency-chip urgency-'+key);chip.setAttribute('aria-label',label+'，'+c[key]+'筆');box.append(chip);");
 source=once(source,"(u.color==='unknown'?'待確認':u.color==='red'?'● 紅':u.color==='orange'?'● 橘':'● 綠')+' · '+u.label","(u.color==='unknown'?'':'● ')+u.label");
 for(const label of ['紅色 · ','橘色 · ','綠色 · '])source=once(source,label,'');
 return source;
};

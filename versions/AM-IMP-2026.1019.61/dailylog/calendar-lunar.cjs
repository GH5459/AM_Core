'use strict';
// ICU Chinese calendar, fixed to Taiwan civil dates. RDATE expands a reviewed
// finite range; never substitute a Gregorian YEARLY rule for a lunar rule.
const LAST_LUNAR_YEAR=2100,DAY_MS=86400000;
const formatter=new Intl.DateTimeFormat('en-u-ca-chinese',{year:'numeric',month:'numeric',day:'numeric',timeZone:'Asia/Taipei'});
const cache=new Map();
const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_REQUEST',status:400});};
function lunarParts(date){const p=Object.fromEntries(formatter.formatToParts(new Date(date+'T04:00:00Z')).map(x=>[x.type,x.value]));
 return {year:Number(p.relatedYear),month:parseInt(p.month,10),day:Number(p.day),leapMonth:p.month.includes('bis')};}
const serial=p=>p.year*10000+p.month*100+(p.leapMonth?40:0)+p.day;
function lunarToSolar(year,month,day,leapMonth=false){const key=[year,month,day,leapMonth].join(':');if(cache.has(key))return cache.get(key);
 let lo=Math.floor(Date.UTC(year,0,1)/DAY_MS),hi=Math.floor(Date.UTC(year+1,2,1)/DAY_MS);const target=serial({year,month,day,leapMonth});
 while(lo<hi){const mid=Math.floor((lo+hi)/2),date=new Date(mid*DAY_MS).toISOString().slice(0,10);if(serial(lunarParts(date))<target)lo=mid+1;else hi=mid;}
 const date=new Date(lo*DAY_MS).toISOString().slice(0,10),result=serial(lunarParts(date))===target?date:null;cache.set(key,result);return result;
}
function normalizeLunar(input,date){if(input.frequency!=='YEARLY'||input.calendar!=='chinese')fail('農曆活動目前支援每年重複。');
 if(Object.keys(input).some(k=>!['frequency','calendar','month','day','leapMonth','throughYear'].includes(k)))fail('農曆重複規則包含不支援的欄位。');
 if(!Number.isInteger(input.month)||input.month<1||input.month>12||!Number.isInteger(input.day)||input.day<1||input.day>30)fail('請確認有效農曆月日。');
 if(input.leapMonth!==undefined&&typeof input.leapMonth!=='boolean')fail('請確認是否指定閏月。');
 const throughYear=input.throughYear??LAST_LUNAR_YEAR;if(!Number.isInteger(throughYear)||throughYear<1901||throughYear>LAST_LUNAR_YEAR)fail('農曆換算支援 1901–2100 年。');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T00:00:00Z')))fail('請確認農曆活動的首次國曆日期。');
 const p=lunarParts(date);if(p.year<1901||p.year>throughYear||p.month!==input.month||p.day!==input.day||p.leapMonth!==(input.leapMonth??false))fail('首次日期與指定農曆月日不一致。');
 return {frequency:'YEARLY',calendar:'chinese',month:input.month,day:input.day,leapMonth:input.leapMonth??false,throughYear};
}
function lunarOccurrences(input,date){const r=normalizeLunar(input,date),first=lunarParts(date).year,dates=[];
 for(let year=first;year<=r.throughYear;year++){const value=lunarToSolar(year,r.month,r.day,r.leapMonth);if(value&&value>=date)dates.push(value);}return dates;
}
function nextLunarDate(month,day,at,leapMonth=false){const today=new Date(Number(at)+8*3600000).toISOString().slice(0,10),year=lunarParts(today).year;
 for(let y=Math.max(year,1901);y<=LAST_LUNAR_YEAR;y++){const date=lunarToSolar(y,month,day,leapMonth);if(date&&date>=today)return date;}return null;
}
function lunarLabel(r){return `每年農曆${r.leapMonth?'閏':''}${r.month}月${r.day}日（已換算至 ${r.throughYear} 年；不重複計入其他閏月，沒有指定日期的年份略過）`;}
module.exports={LAST_LUNAR_YEAR,lunarParts,lunarToSolar,normalizeLunar,lunarOccurrences,nextLunarDate,lunarLabel};

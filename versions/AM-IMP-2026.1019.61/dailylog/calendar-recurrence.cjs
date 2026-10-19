'use strict';
// Portable contract shared with the DailyLog Calendar machine API.
const DAYS=['SU','MO','TU','WE','TH','FR','SA'];
const lunar=require('./calendar-lunar.cjs');
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1900-01-01'&&value<='9999-12-31'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function invalid(message){throw Object.assign(new Error(message),{code:'INVALID_REQUEST',status:400});}
function normalizeRecurrence(input,date){
 if(!input||typeof input!=='object'||Array.isArray(input))invalid('重複規則必須是物件。');
 if(input.calendar==='chinese')return lunar.normalizeLunar(input,date);
 if(Object.keys(input).some(k=>!['frequency','interval','weekdays','until','count'].includes(k)))invalid('重複規則包含不支援的欄位。');
 if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(input.frequency))invalid('目前支援每日、每週、每月、每年及農曆每年重複。');
 if(!validDate(date))invalid('請確認重複活動的首次日期。');
 const interval=input.interval===undefined?1:input.interval;
 if(!Number.isInteger(interval)||interval<1||interval>365)invalid('重複間隔必須為 1–365 的整數。');
 const rule={frequency:input.frequency,interval};
 if(input.frequency==='WEEKLY'){
  const days=input.weekdays===undefined?[DAYS[new Date(date+'T00:00:00Z').getUTCDay()]]:input.weekdays;
  if(!Array.isArray(days)||!days.length||days.length>7||days.some(d=>!DAYS.includes(d))||new Set(days).size!==days.length)invalid('請確認每週重複的星期。');
  rule.weekdays=DAYS.filter(d=>days.includes(d));
  if(!rule.weekdays.includes(DAYS[new Date(date+'T00:00:00Z').getUTCDay()]))invalid('首次日期與重複星期不一致。');
 }else if(input.weekdays!==undefined)invalid('只有每週重複可設定星期。');
 if(input.until!==undefined&&input.count!==undefined)invalid('重複結束日期與次數請擇一提供。');
 if(input.until!==undefined){if(!validDate(input.until)||input.until<date)invalid('重複結束日期不得早於首次日期。');rule.until=input.until;}
 if(input.count!==undefined){if(!Number.isInteger(input.count)||input.count<1||input.count>10000)invalid('重複次數必須為 1–10000 的整數。');rule.count=input.count;}
 return rule;
}
function recurrenceLines(input,date,options={}){const rule=normalizeRecurrence(input,date);
 if(rule.calendar==='chinese'){const dates=lunar.lunarOccurrences(rule,date);if(options.allDay)return ['RDATE;VALUE=DATE:'+dates.map(x=>x.replaceAll('-','')).join(',')];
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time||''))invalid('農曆非全天活動需要時間。');
  return ['RDATE;TZID=Asia/Taipei:'+dates.map(x=>x.replaceAll('-','')+'T'+options.time.replace(':','')+'00').join(',')];}
 let line='RRULE:FREQ='+rule.frequency+';INTERVAL='+rule.interval;
 if(rule.weekdays)line+=';BYDAY='+rule.weekdays.join(',');
 if(rule.until)line+=';UNTIL='+rule.until.replaceAll('-','')+(options.allDay?'':'T155959Z'); // inclusive Taipei end of day
 if(rule.count)line+=';COUNT='+rule.count;
 return [line];
}
function recurrenceLabel(input,date){const r=normalizeRecurrence(input,date);if(r.calendar==='chinese')return lunar.lunarLabel(r);const unit={DAILY:'天',WEEKLY:'週',MONTHLY:'月',YEARLY:'年'}[r.frequency];
 let label=(r.interval===1?{DAILY:'每天',WEEKLY:'每週',MONTHLY:'每月',YEARLY:'每年'}[r.frequency]:'每 '+r.interval+' '+unit);
 if(r.weekdays)label+=' '+r.weekdays.map(d=>'星期'+['日','一','二','三','四','五','六'][DAYS.indexOf(d)]).join('、');
 if(r.frequency==='MONTHLY')label+=' '+Number(date.slice(8))+' 日（無此日期的月份略過）';
 return label+(r.until?'，至 '+r.until:r.count?'，共 '+r.count+' 次':'，不設結束日期');
}
module.exports={normalizeRecurrence,recurrenceLines,recurrenceLabel};

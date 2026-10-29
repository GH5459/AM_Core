// Calendar-day arithmetic independent of the machine's local time zone.
const DAY_MS=86400000;
export function explicitDateHint(text){return /今天|明天|後天|大後天|(?:下下|下|本|這|这)?(?:週|周|星期|禮拜|礼拜)[一二三四五六日天1-7]|\d{1,4}\s*[年\/.\-]\s*\d{1,2}(?:\s*[月\/.\-]\s*\d{1,2}\s*日?)?|\d{1,2}\s*月\s*\d{1,2}\s*(?:日|號|号)?/u.test(String(text));}
export function matchesExplicitDate(text,at,chosen){
 const input=String(text),today=taipeiDateOnly(at),base=Date.parse(today+'T00:00:00Z'),candidates=[];
 const iso=offset=>new Date(base+offset*DAY_MS).toISOString().slice(0,10);
 for(const m of input.matchAll(/大後天|後天|明天|今天/gu))candidates.push(iso({今天:0,明天:1,後天:2,大後天:3}[m[0]]));
 for(const m of input.matchAll(/(下下|下|本|這|这)?(?:週|周|星期|禮拜|礼拜)([一二三四五六日天1-7])/gu)){
  const weekday='一二三四五六日'.indexOf(m[2]==='天'?'日':m[2]);const target=weekday>=0?weekday+1:Number(m[2]);const current=new Date(base).getUTCDay()||7;const weeks=m[1]==='下下'?2:m[1]==='下'?1:0;candidates.push(iso(weeks*7-current+target));
 }
 for(const m of input.matchAll(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號|号)?|(?:(\d{4})[\/.-])?(\d{1,2})[\/.-](\d{1,2})/gu)){
  const year=Number(m[1]||m[4]||today.slice(0,4)),month=Number(m[2]||m[5]),day=Number(m[3]||m[6]);const value=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');candidates.push(value);
 }
 const unique=[...new Set(candidates)];return unique.length===1&&unique[0]===chosen;
}
function taipeiDateOnly(at){if(!Number.isFinite(at))throw new Error('invalid_source_timestamp');return new Date(at+8*3600000).toISOString().slice(0,10);}
export function taskDates(executionDate, sourceTimestamp) {
  if(typeof executionDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(executionDate))throw new Error('invalid_execution_date');
  const start=Date.parse(executionDate+'T00:00:00Z');
  if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==executionDate)throw new Error('invalid_execution_date');
  const today=taipeiDateOnly(sourceTimestamp);
  if(executionDate<today)throw new Error('execution_date_in_past');
  const due=new Date(start+2*DAY_MS).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new Error('invalid_due_date');
  return {executionDate,dueDate:due,dueAt:due+'T23:59:00+08:00'};
}

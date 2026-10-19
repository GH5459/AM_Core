// Self-contained so the exact same calendar calculation can run in the browser.
export function meetingDueDate(settings, fallback=''){
 const valid=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const day=d=>d.toISOString().slice(0,10);
 const s=settings||{},cycle=s.cycle;
 if(s.type!=='工作會議'||!cycle||!valid(s.date))return fallback;
 const date=new Date(s.date+'T00:00:00Z');
 if(cycle.nextDate&&valid(cycle.nextDate)&&cycle.nextDate>s.date){const next=new Date(cycle.nextDate+'T00:00:00Z');next.setUTCDate(next.getUTCDate()-1);return day(next);}
 if(cycle.frequency==='daily')return s.date;
 if(cycle.frequency==='monthly'){
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+2,0));
  const next=new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth(),Math.min(date.getUTCDate(),last.getUTCDate())));
  next.setUTCDate(next.getUTCDate()-1);return day(next);
 }
 const days=cycle.frequency==='weekly'?7:cycle.frequency==='custom'?cycle.intervalDays:0;
 if(Number.isInteger(days)&&days>=1&&days<=365){date.setUTCDate(date.getUTCDate()+days-1);return day(date);}
 return fallback;
}

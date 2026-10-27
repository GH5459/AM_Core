export const URGENCY_POLICY='uof-remaining-hours-v1';
// Also embedded in the two existing clients. Keep one calculation for all views.
export function createUrgency(){
 const H=3600000;
 function evaluate(item,now=Date.now()){
  const level=item?.urgentLevel,start=item?.nodeStartedAt;
  const valid=typeof start==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(start);
  const received=valid?Date.parse(start):NaN;
  if(![0,1,2].includes(level)||!Number.isFinite(received)||!Number.isFinite(now)||received>now)return {color:'unknown',label:'時間或等級待確認',dueAt:null,remainingMs:null,overdue:false};
  const hours=[24,48,72][level],due=received+hours*H,r=due-now;
  const duration=ms=>{const minutes=Math.ceil(Math.abs(ms)/60000);return minutes<60?minutes+' 分鐘':Math.floor(minutes/60)+' 小時'+(minutes%60?' '+minutes%60+' 分':'');};
  return {color:r<=24*H?'red':r<=48*H?'orange':'green',label:r<0?'已逾期 '+duration(r):r===0?'已到期，請立即處理':'剩餘 '+duration(r),dueAt:new Date(due).toISOString(),remainingMs:r,overdue:r<0,levelLabel:['緊急','急件','普通'][level],hours};
 }
 function counts(items,now){const r={red:0,orange:0,green:0,unknown:0,overdue:0,nearestDueAt:null};for(const item of items){if(item.uiStatus==='approved')continue;const u=evaluate(item,now);r[u.color]++;if(u.overdue)r.overdue++;if(u.dueAt&&(!r.nearestDueAt||u.dueAt<r.nearestDueAt))r.nearestDueAt=u.dueAt;}return r;}
 function compare(a,b,now){if(a.uiStatus==='approved'||b.uiStatus==='approved')return Number(a.uiStatus==='approved')-Number(b.uiStatus==='approved');const x=evaluate(a,now),y=evaluate(b,now);return (x.dueAt?Date.parse(x.dueAt):Infinity)-(y.dueAt?Date.parse(y.dueAt):Infinity)||String(a.taskId).localeCompare(String(b.taskId));}
 return {evaluate,counts,compare};
}

window.dailylogWorkTime ||= (()=>{
 const routines=new Map();let expected=null,identity=null;
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const number=n=>Number(n.toFixed(6)).toLocaleString('en-US',{maximumFractionDigits:6,useGrouping:false});
 const label=n=>valid(n)?number(n)+' mins':'未填工時';
 const html=n=>'<small class="work-time-label">'+label(n)+'</small>';
 const day=v=>v?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):null;
 const user=()=>window.DAILYLOG_AUTH?.user?.account;
 function scope(){const next=window.DAILYLOG_AUTH?.user?.id;if(identity&&next!==identity){routines.clear();expected=null;}identity=next;}
 function account(t){return t?.collaborators?.length?user():t?.lead?.account;}
 function minutes(t){return t?.workMinutesByAccount?.[account(t)]?.minutes??null;}
 function suffix(t){return t&&(t.level||1)<=1?html(minutes(t)):valid(minutes(t))?html(minutes(t)):'';}
 function completedDay(t,todo){if(t?.collaborators?.length)return day(t.participantProgress?.find(p=>p.account===user())?.completedAt);return day(t?.completedAt)||t?.legacyCompletedDate||todo?.events?.filter(e=>e.completed).at(-1)?.date||null;}
 function completedMinutes(t,todo,date){const record=t?.workTimeHistory?.filter(r=>r.account===account(t)&&r.completedDate===date).at(-1);return record?.minutes??(completedDay(t,todo)===date?minutes(t):null);}
 function expect(libraries){scope();expected=new Set(libraries.map(l=>l.id));for(const id of routines.keys())if(!expected.has(id))routines.delete(id);emit();}
 function setRoutine(id,date,items,state){scope();const value={date,items,state},old=routines.get(id);if(JSON.stringify(old)===JSON.stringify(value))return;routines.set(id,value);emit();}
 function total(normal,date){scope();let sum=0,missing=0,pending=expected===null,failed=false;const seen=new Set();for(const row of normal){if(seen.has(row.id))continue;seen.add(row.id);if(valid(row.minutes))sum+=row.minutes;else missing++;}for(const id of expected||[]){const r=routines.get(id);if(!r||r.date!==date){pending=true;continue;}if(!['ready','disabled','unlinked'].includes(r.state)){pending=true;failed ||=r.state==='failed';}for(const row of r.items){const key=row.id.startsWith('notion-')?row.id:'work:'+row.id;if(seen.has(key)||seen.has(row.id))continue;seen.add(key);if(valid(row.minutes))sum+=row.minutes;else missing++;}}
  return '總工作時數 '+(missing?'已填 ':'')+number(sum)+' mins'+(pending?failed?' · 部分讀取失敗':' · 更新中':'');}
 function emit(){window.dispatchEvent(new Event('dailylog-work-time'));}
 return {valid,label,html,minutes,suffix,completedDay,completedMinutes,expect,setRoutine,total};
})();

'use strict';

import {decisionRecordText} from './decision-record.js';
export const WORKSPACE_CONTRACT='meeting-collaboration-host-publish-v1';
export const MEETING_TYPES=[
 {name:'工作會議',prompt:'完整保留討論脈絡、工作進度、決議、未決事項與明確後續行動。'},
 {name:'電話',prompt:'整理通話目的、雙方說法、承諾、爭議與後續追蹤，不捏造未說出的承諾。'},
 {name:'討論',prompt:'按議題整理不同意見、提出的方案、利弊、共識與尚未解決的問題。'},
 {name:'主題研討',prompt:'依主題整理論點、依據、案例、共識、分歧與需要深入研究的事項。'},
];
export const failure=(status,message)=>Object.assign(Error(message),{status});
export const meetingToday=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
const bounded=(v,n)=>typeof v==='string'&&v.length<=n;
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function checkField(field,value){
 if(/^todo:[a-f0-9-]{36}$/.test(field)){
  if(value===null)return;
  if(!value||Object.keys(value).some(k=>!['content','ownerId','due','evidence'].includes(k))||!bounded(value.content,4000)||!bounded(value.ownerId,50)||value.ownerId&&!/^U[a-f0-9]{32}$/i.test(value.ownerId)||!bounded(value.due,10)||value.due&&!validDate(value.due)||!bounded(value.evidence,4000))throw failure(400,'待辦內容或日期格式不正確。');
  return;
 }
 if(field==='settings'){
  if(!value||Object.keys(value).some(k=>!['topic','type','prompt','date','speakers','projectGoal','cycle'].includes(k))||!bounded(value.topic,200)||!bounded(value.type,60)||!bounded(value.prompt,6000)||!validDate(value.date)||!bounded(value.projectGoal,2000)||!Array.isArray(value.speakers)||value.speakers.length>40||value.speakers.some(s=>!s||Object.keys(s).some(k=>!['name','gender','role'].includes(k))||!bounded(s.name,100)||!['','男','女'].includes(s.gender)||!bounded(s.role,100)))throw failure(400,'請檢查會議設定。');
  if(value.cycle!==undefined){
   const c=value.cycle;
   if(!c||Array.isArray(c)||Object.keys(c).some(k=>!['frequency','intervalDays','nextDate'].includes(k))||!['none','daily','weekly','monthly','custom'].includes(c.frequency)||!Number.isInteger(c.intervalDays)||c.intervalDays<1||c.intervalDays>365||typeof c.nextDate!=='string'||c.nextDate&&(!validDate(c.nextDate)||c.nextDate<=value.date))throw failure(400,'請檢查會議週期；自訂週期為 1–365 天，下次會議日期須晚於本次會議。');
  }
 }else if(!['record','transcript'].includes(field)||!bounded(value,300000))throw failure(400,'內容格式不正確或過長。');
}
export function todos(fields){return Object.entries(fields).filter(([k,v])=>k.startsWith('todo:')&&v).map(([id,v])=>({id,...v}));}
export function checkPublication(row){
 if(!row.fields.settings?.topic?.trim()||!row.fields.record?.trim())throw failure(409,'請先完成會議主題及會議記錄。');
 for(const t of todos(row.fields))if(!t.content.trim()||t.ownerId&&!validDate(t.due))throw failure(409,'已指定負責人的待辦必須有內容及截止日期；也可取消負責人，保留為未分派待辦。');
}
export function initialFields(event){return {settings:{topic:'',type:'工作會議',cycle:{frequency:'daily',intervalDays:7,nextDate:''},prompt:MEETING_TYPES[0].prompt,date:meetingToday(event.timestamp),projectGoal:'',speakers:Array.from({length:3},()=>({name:'',gender:'',role:''}))},record:'',transcript:''};}
export function recordText(parsed){if(parsed.topics?.length)return decisionRecordText(parsed.topics,parsed.nextMeeting);return [
 '重點摘要',...(parsed.highlights||[]).map(s=>'• '+s),'','會議內容',...(parsed.minutes||[]).flatMap(s=>[s.heading,...(s.points||[]).map(p=>'• '+p),'']),
 '結論與決議',...(parsed.conclusions||[]).map(s=>'• '+s),...(parsed.nextMeeting?['','下次會議：'+parsed.nextMeeting]:[])
 ].join('\n');}

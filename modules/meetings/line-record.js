import {parseDecisionRecord} from './decision-record.js';

export const MEETING_LINE_FORMAT='meeting-line-indented-outline-v1';
const symbols=['●','○','◦','・'];
const graphemes=new Intl.Segmenter('zh-Hant',{granularity:'grapheme'});
const words=new Intl.Segmenter('zh-Hant',{granularity:'word'});
const units=value=>[...graphemes.segment(String(value))].map(s=>s.segment);
const plain=value=>String(value||'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\s+/g,' ').trim();
const clip=(value,max)=>{const chars=units(plain(value));return chars.length>max?chars.slice(0,Math.max(1,max-1)).join('')+'…':chars.join('');};
const width=value=>units(value).reduce((n,c)=>n+(c.codePointAt(0)>255?2:1),0);

// LINE text has no hanging indent. Hard-wrap each line and repeat its indent,
// so a phone's wrapped summaries do not jump back to the main topic margin.
function bullet(value,depth=0,columns=40){
 const prefix='　'.repeat(depth)+symbols[Math.min(depth,3)]+' ',continuation='　'.repeat(depth+1)+' ';
 const capacity=columns-width(prefix),tokens=[...words.segment(plain(value))].flatMap(s=>width(s.segment)>capacity?units(s.segment):[s.segment]);
 const out=[];let lead=prefix,parts=[],size=width(lead);
 const finish=()=>{out.push((lead+parts.join('')).trimEnd());lead=continuation;parts=[];size=width(lead);};
 for(const token of tokens){
  const w=width(token);
  if(size+w>columns&&parts.length){
   if(/^[，。；：！？、）》」』】]$/u.test(token)){
    let carry=parts.pop();size-=width(carry);
    if(!parts.length){const chars=units(carry);carry=chars.pop();parts=chars;}
    finish();parts.push(carry);size+=width(carry);
   }else finish();
  }
  if(!parts.length&&!token.trim())continue;
  parts.push(token);size+=w;
 }
 if(parts.length)out.push((lead+parts.join('')).trimEnd());return out.join('\n');
}

export function meetingLineRecord(record,{maxChars=3000}={}){
 const limit=Math.max(400,Math.min(4000,Math.floor(Number(maxChars)||3000))),note='細節與對話依據，請開啟完整會議記錄。';
 const parsed=parseDecisionRecord(record);
 if(!parsed){
  // Historical prose still gets readable bullets; source text is never changed.
  const rows=[];let evidence=false;
  for(const line of String(record||'').split(/\r?\n/)){
   if(/^對話依據[（(]/.test(line)){evidence=true;continue;}
   if(/^#{1,6} /.test(line))evidence=false;if(evidence||!line.trim())continue;
   const heading=line.match(/^#{1,6} (.+)/);rows.push(bullet(clip((heading?heading[1]:line).replace(/^[-*•] /,''),240),heading?0:1));
  }
  const out=['重點與決議'];for(const row of rows){if(out.join('\n').length+row.length+note.length+4>limit)break;out.push(row);}return out.join('\n')+'\n\n'+note;
 }
 const rootLimit=Math.max(1,Math.min(24,Math.floor((limit-note.length-20)/100)));
 const roots=parsed.topics.slice(0,rootLimit),quota=Math.floor((limit-note.length-2*(roots.length+2)-10)/Math.max(1,roots.length)),out=['重點與決議'];
 const summaryLimit=Math.max(24,Math.min(240,Math.floor(quota/3)));
 for(const root of roots){
  const chunks=[];
  const walk=(t,depth)=>{
   chunks.push(bullet(clip(t.title,Math.max(6,Math.min(60,Math.floor(quota/2)))),depth));
   if(t.status)chunks.push(bullet('狀態：'+clip(t.status,70),depth+1));
   for(const sentence of t.summary.join(' ').match(/[^。；]+[。；]?/gu)||[])chunks.push(bullet(clip(sentence,summaryLimit),depth+1));
   for(const child of t.children)walk(child,depth+1);
  };walk(root,0);
  const selected=[],more=bullet('細項請見完整記錄。',1);let used=0;
  for(let i=0;i<chunks.length;i++){
   const reserve=i<chunks.length-1?more.length+1:0;
   if(used+chunks[i].length+1+reserve>quota){selected.push(more);break;}
   selected.push(chunks[i]);used+=chunks[i].length+1;
  }
  out.push(selected.join('\n'));
 }
 if(parsed.tail.length){const tail=bullet(clip(parsed.tail.join(' '),120));if(out.join('\n\n').length+tail.length+note.length+4<=limit)out.push(tail);}
 return out.join('\n\n')+'\n\n'+note;
}

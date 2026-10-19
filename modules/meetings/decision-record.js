// The editable record stays plain text. Only this explicit format becomes
// expandable; historical prose, recordings, transcripts and task fields persist.
export const DECISION_RECORD_CONTRACT='meeting-decisions-with-evidence-v1';
export const DECISION_RECORD_INSTRUCTIONS=`
會議記錄統一使用「重點與決議＋可展開的對話依據」：
- 先理解同一議題的完整討論，再把摘要、結論與下一步合成一則 topics；同題只出現一次，不逐句列發言，也不另寫重複的摘要／詳細內容／結論。
- 每則 title 是具體結果，summary 用 1–3 句說清楚決定、原因或後續安排；通常 3–10 個議題，依實際內容增減，不硬湊。
- status 明確區分已完成、方向確認、待處理、待確認或工作安排。「今天要送審／預計退款／補件」不能改寫成已送審、已退款或已核准；分歧尚未解決不能寫成共識。
- evidence 每則選 1–5 段真正支持該結論的對話摘意，保留講者、原逐字稿已有的時間標記與具體依據，刪除語助詞與重複句。text 是摘意，不能冒充逐字引用；不可捏造時間、講者或決議。來源無時間時 timestamp 留空。
- 分享或研討保留不同觀點與尚未形成共識的狀態，不強行合併成同一立場。例行進度可合併；風險、爭議、責任與未決問題須可追查。
- todos 獨立保存，維持任務內容、負責人、期限與原有判定規則；完整逐字稿及錄音獨立保留，不以摘意取代。
輸出 topics:[{title,summary,status,evidence:[{timestamp,speaker,text}]}]，不再輸出重複的 minutes、highlights、conclusions。
`;
const oneLine=(value,max)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
const seconds=value=>{const p=String(value||'').split(':').map(Number);return /^\d{1,3}:\d{2}(?::\d{2})?$/.test(value||'')&&p.slice(1).every(n=>n<60)?p.reduce((a,n)=>a*60+n,0):null;};
export function normalizeDecisionTopics(input,transcript=''){
 const source=new Map();for(const m of String(transcript).matchAll(/\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*([^：\n]+)：/g)){const key=seconds(m[1]);if(!source.has(key))source.set(key,new Set());source.get(key).add(m[2].trim());}
 const seen=new Set();return (Array.isArray(input)?input:[]).slice(0,24).flatMap(item=>{
  if(!item||typeof item!=='object')return [];const title=oneLine(item.title,140),summary=oneLine(item.summary,700),key=(title+' '+summary).replace(/\s/g,'');if(!title||!summary||seen.has(key))return [];seen.add(key);
  const evidence=(Array.isArray(item.evidence)?item.evidence:[]).slice(0,8).flatMap(e=>{if(!e||typeof e!=='object')return [];const text=oneLine(e.text,1600);if(!text)return [];let timestamp=oneLine(e.timestamp,12),speaker=oneLine(e.speaker,100);const at=seconds(timestamp),matches=name=>name===speaker||name.replace(/\([^)]*\)$/,'').trim()===speaker;const names=[...(source.get(at)||[])].filter(matches);if(at===null||names.length!==1)timestamp='';else speaker=names[0];if(source.size&&![...source.values()].some(set=>[...set].some(matches)))speaker='發言者待核對';return [{timestamp,speaker,text}];});
  return [{title,summary,status:oneLine(item.status,100)||'待確認',evidence}];
 });
}
export function decisionRecordText(topics,nextMeeting=''){
 return ['重點與決議',...topics.flatMap(t=>['','## '+oneLine(t.title,140),'摘要：'+oneLine(t.summary,700),'狀態：'+oneLine(t.status,100),'對話依據（摘意）：',...(t.evidence?.length?t.evidence.map(e=>'- '+(e.timestamp?'['+oneLine(e.timestamp,12)+'] ':'')+(oneLine(e.speaker,100)||'發言者待核對')+'：'+oneLine(e.text,1600)):['- 對話依據待補充；請對照完整逐字稿。'])]),...(nextMeeting?['','下次會議：'+oneLine(nextMeeting,500)]:[])].join('\n');
}
// Self-contained so the exact parser can also be embedded in the existing UI.
export function parseDecisionRecord(text){
 const lines=String(text||'').replace(/\r\n/g,'\n').split('\n');if(lines[0]?.trim()!=='重點與決議')return null;
 const topics=[];let topic=null,evidence=false;const tail=[];
 for(const line of lines.slice(1)){
  if(line.startsWith('## ')){topic={title:line.slice(3),summary:[],status:'',evidence:[]};topics.push(topic);evidence=false;}
  else if(line.startsWith('下次會議：')){tail.push(line);topic=null;}
  else if(topic){if(line==='對話依據（摘意）：'){evidence=true;}else if(!evidence&&line.startsWith('摘要：'))topic.summary.push(line.slice(3));else if(!evidence&&line.startsWith('狀態：'))topic.status=line.slice(3);else if(line.trim())(evidence?topic.evidence:topic.summary).push(line.replace(/^- /,''));}
  else if(line.trim())tail.push(line);
 }
 return topics.length?{topics,tail}:null;
}
export function decisionRecordHtml(text){
 const parsed=parseDecisionRecord(text);if(!parsed)return null;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return '<h3>重點與決議</h3>'+parsed.topics.map((t,i)=>'<details class="decision-topic" data-decision="'+i+'"><summary><strong>'+esc(t.title)+'</strong><span class="decision-outcome">'+t.summary.map(esc).join('<br>')+'</span>'+(t.status?'<span class="decision-status">'+esc(t.status)+'</span>':'')+'</summary><div class="decision-evidence"><h4>對話依據 · 摘意</h4>'+t.evidence.map(e=>'<p>'+esc(e)+'</p>').join('')+'</div></details>').join('')+parsed.tail.map(t=>'<p>'+esc(t)+'</p>').join('');
}
const rich=content=>[{type:'text',text:{content}}];
export function meetingNotionBlocks(lines){
 const paragraph=text=>({object:'block',type:'paragraph',paragraph:{rich_text:rich(text)}});
 const chunks=text=>{const out=[];for(let i=0;i<text.length||i===0;i+=1800)out.push(paragraph(text.slice(i,i+1800)));return out;};
 return lines.flatMap(line=>{
  const parsed=parseDecisionRecord(line);if(!parsed)return chunks(String(line));
  return [{object:'block',type:'heading_2',heading_2:{rich_text:rich('重點與決議')}},...parsed.topics.map(t=>({object:'block',type:'toggle',toggle:{rich_text:rich([t.title,...t.summary,t.status].filter(Boolean).join('\n').slice(0,1800)),children:[paragraph('對話依據 · 摘意'),...t.evidence.flatMap(chunks)]}})),...parsed.tail.flatMap(chunks)];
 });
}
// Prefix checks include nested evidence. A lost Notion reply resumes the same
// tree without duplicating a topic; an unexpected external edit stops the job.
export async function appendVerifiedMeetingBlocks(request,pageId,planned,marker=''){
 const content=block=>(block[block.type]?.rich_text||[]).map(t=>t.plain_text??t.text?.content??'').join('');
 const list=async id=>{const out=[];let cursor='';do{const data=await request('/blocks/'+id+'/children?page_size=100'+(cursor?'&start_cursor='+cursor:''));out.push(...data.results);cursor=data.has_more?data.next_cursor:'';}while(cursor);return out;};
 async function append(id,blocks,existing){
  if(existing.length>blocks.length)throw Error('notion_revision_content_changed');
  for(let i=0;i<existing.length;i++){
   if(existing[i].type!==blocks[i].type||content(existing[i])!==content(blocks[i]))throw Error('notion_revision_content_changed');
   const children=blocks[i][blocks[i].type]?.children;if(children?.length){if(!existing[i].id)throw Error('notion_evidence_id_missing');await append(existing[i].id,children,await list(existing[i].id));}
  }
  for(let i=existing.length;i<blocks.length;i+=50)await request('/blocks/'+id+'/children','PATCH',{children:blocks.slice(i,i+50)});
 }
 const existing=await list(pageId),start=marker?existing.findIndex(b=>content(b)===marker):0;
 await append(pageId,planned,marker?(start<0?[]:existing.slice(start)):existing);
}

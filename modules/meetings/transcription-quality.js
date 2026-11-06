export function transcriptionQuality(tr,speakers){
 const utterances=tr.utterances||[],observed=[...new Set(utterances.map(u=>u.speaker).filter(v=>v!=null))],expected=speakers.filter(s=>s.name.trim()).length;
 const gaps=[];let end=0;for(const u of utterances){if(u.start-end>=120000)gaps.push({start:end,end:u.start});end=Math.max(end,Number(u.end)||0);}if(tr.audio_duration*1000-end>=120000)gaps.push({start:end,end:tr.audio_duration*1000});
 const warnings=[];
 if(expected&&observed.length!==expected)warnings.push('設定 '+expected+' 位人員，但聲音辨識只分出 '+observed.length+' 位，請核對姓名與首次發言順序。');
 if(gaps.length)warnings.push('逐字稿有 '+gaps.length+' 段超過 2 分鐘的空白，最長約 '+Math.round(Math.max(...gaps.map(g=>g.end-g.start))/60000)+' 分鐘；可能是靜音或未辨識語音，請對照錄音，不能視為完整。');
 return {provider:'assemblyai',transcriptId:tr.id||null,model:tr.speech_model_used||null,expectedSpeakers:expected,detectedSpeakers:observed.length,audioDurationSeconds:tr.audio_duration||null,gaps,warnings};
}

// Preserve every source line. Long meetings are summarized in time/size parts;
// the output concatenates each part rather than compressing them a second time.
export function meetingSummaryParts(text,maxChars=10000){
 const parts=[];let lines=[],size=0,first=null;
 for(const line of text.split('\n')){const m=line.match(/^\[(\d+):(\d+)\]/),at=m?Number(m[1])*60+Number(m[2]):null;
  if(lines.length&&(size+line.length>maxChars||at!==null&&first!==null&&at-first>=1200)){parts.push(lines.join('\n'));lines=[];size=0;first=null;}
  // A single unusually long turn is split without discarding its text.
  if(line.length>maxChars){if(lines.length){parts.push(lines.join('\n'));lines=[];size=0;first=null;}for(let i=0;i<line.length;i+=maxChars)parts.push(line.slice(i,i+maxChars));continue;}
  if(first===null&&at!==null)first=at;lines.push(line);size+=line.length+1;
 }
 if(lines.length)parts.push(lines.join('\n'));return parts.length?parts:[''];
}

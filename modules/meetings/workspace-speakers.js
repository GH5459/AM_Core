// Shared by the editor and reader. Corrections touch explicit speaker labels,
// never narrative mentions, task owners, timestamps or the spoken words.
// Self-contained because the same implementation is embedded in the page.
export function meetingSpeakerTools(){
 const pattern=/^(\s*(?:-\s+)?(?:\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*)?)([^：:\r\n]{1,240}?)(\s*[：:])(.*)$/;
 function lines(text){return String(text||'').split(/(\r?\n)/);}
 function entries(text){const out=[],parts=lines(text);for(let i=0;i<parts.length;i+=2){const m=parts[i].match(pattern);if(!m)continue;const timestamp=m[2]||'',p=timestamp.split(':').map(Number);if(timestamp&&p.slice(1).some(n=>n>=60))continue;out.push({line:i/2,prefix:m[1],timestamp,start:timestamp?p.reduce((a,n)=>a*60+n,0)*1000:null,speaker:m[3].trim(),delimiter:m[4],text:m[5]});}return out;}
 function replace(text,mapping,{line=null,time=null}={}){const parts=lines(text);for(const e of entries(text)){if(line!==null&&e.line!==line||time!==null&&e.timestamp!==time||!Object.hasOwn(mapping,e.speaker))continue;parts[e.line*2]=e.prefix+mapping[e.speaker]+e.delimiter+e.text;}return parts.join('');}
 function segments(text){return entries(text).filter(e=>e.start!==null).map(({start,speaker,text})=>({start,speaker,text}));}
 return {entries,replace,segments};
}

// Shared by the editor and reader. Transcript corrections preserve spoken words.
// Whole-meeting corrections can also update names in narrative headings/summaries.
// Self-contained because the same implementation is embedded in the page.
export function meetingSpeakerTools(){
 const pattern=/^(\s*(?:-\s+)?(?:\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*)?)([^：:\r\n]{1,240}?)(\s*[：:])(.*)$/;
 function lines(text){return String(text||'').split(/(\r?\n)/);}
 function entries(text){const out=[],parts=lines(text);for(let i=0;i<parts.length;i+=2){const m=parts[i].match(pattern);if(!m)continue;const timestamp=m[2]||'',p=timestamp.split(':').map(Number);if(timestamp&&p.slice(1).some(n=>n>=60))continue;out.push({line:i/2,prefix:m[1],timestamp,start:timestamp?p.reduce((a,n)=>a*60+n,0)*1000:null,speaker:m[3].trim(),delimiter:m[4],text:m[5]});}return out;}
 function replace(text,mapping,{line=null,time=null}={}){const parts=lines(text);for(const e of entries(text)){if(line!==null&&e.line!==line||time!==null&&e.timestamp!==time||!Object.hasOwn(mapping,e.speaker))continue;parts[e.line*2]=e.prefix+mapping[e.speaker]+e.delimiter+e.text;}return parts.join('');}
 function segments(text){return entries(text).filter(e=>e.start!==null).map(({start,speaker,text})=>({start,speaker,text}));}
 function narrative(text,mapping){
  const names=Object.keys(mapping).filter(Boolean).sort((a,b)=>b.length-a.length);
  if(!names.length)return String(text||'');
  const re=new RegExp(names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  return String(text||'').replace(re,(name,offset,source)=>{
   // Do not rename a longer English account/product name (e.g. SevenAM).
   if(/[A-Za-z0-9_]/.test(name[0])&&/[A-Za-z0-9_]/.test(source[offset-1]||''))return name;
   if(/[A-Za-z0-9_]/.test(name.at(-1))&&/[A-Za-z0-9_]/.test(source[offset+name.length]||''))return name;
   return mapping[name];
  });
 }
 function record(text,mapping,{labels=true,names=true}={}){
  const parts=lines(text),quotes=new Map(entries(text).filter(e=>e.timestamp||Object.hasOwn(mapping,e.speaker)).map(e=>[e.line,e]));
  for(let i=0;i<parts.length;i+=2){const e=quotes.get(i/2);if(e){if(labels&&Object.hasOwn(mapping,e.speaker))parts[i]=e.prefix+mapping[e.speaker]+e.delimiter+e.text;}else if(names)parts[i]=narrative(parts[i],mapping);}
  return parts.join('');
 }
 return {entries,replace,segments,narrative,record};
}

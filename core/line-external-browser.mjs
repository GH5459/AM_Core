// Apply at LINE's clickable entry, before a browser or login redirect is chosen.
export function externalBrowserUrl(value){
 if(typeof value!=='string')return value;
 try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.hostname==='liff.line.me'||url.hostname==='miniapp.line.me'||url.username||url.password)return value;url.searchParams.delete('openInAppBrowser');url.searchParams.set('openExternalBrowser','1');return url.href;}catch{return value;}
}
const systemHosts=new Set(['dailylog.chatgpt-673.workers.dev','am.hozorental.com','am-platform-2ymf.onrender.com','uof-line.ghotel.tw']);
function textLinks(text){
 const changes=[];const value=text.replace(/https?:\/\/[^\s<>"'\u3000]+/gu,(match,index)=>{
  const raw=match.replace(/[，。！？、；：「」『』（）【】]+$/u,'').replace(/[)\],.!?;:]+$/u,'');
  let url;try{url=new URL(raw);}catch{return match;}if(!systemHosts.has(url.hostname))return match;
  const next=externalBrowserUrl(raw);if(next===raw)return match;changes.push({index,oldLength:raw.length,newLength:next.length});return next+match.slice(raw.length);
 });return {value,changes};
}
export function externalBrowserMessage(message){
 const clone=structuredClone(message);
 function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}
  if(node.type==='uri'&&typeof node.uri==='string'){node.uri=externalBrowserUrl(node.uri);if(node.altUri?.desktop)node.altUri.desktop=externalBrowserUrl(node.altUri.desktop);}
  for(const value of Object.values(node))if(value&&typeof value==='object')walk(value);
 }
 walk(clone);
 if(['text','textV2'].includes(clone.type)&&typeof clone.text==='string'){
  const {value,changes}=textLinks(clone.text);
  // URLs in original user quotations and mention ranges must retain their meaning.
  if(changes.length&&value.length<=5000&&!clone.emojis?.length){
   const mentions=clone.mention?.mentionees||[];
   const overlap=mentions.some(m=>changes.some(c=>m.index<c.index+c.oldLength&&m.index+m.length>c.index));
   if(!overlap){for(const m of mentions)m.index+=changes.filter(c=>c.index+c.oldLength<=m.index).reduce((n,c)=>n+c.newLength-c.oldLength,0);clone.text=value;}
  }
 }
 return clone;
}

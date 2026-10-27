import {readFileSync} from 'node:fs';

// Pinned upstream browser build; no meeting content is sent to an external renderer.
export const preparationMarkdownScript=readFileSync(new URL('./vendor/lib/marked.umd.js',import.meta.url),'utf8').replace(/<\/script/gi,'<\\/script');
export const preparationMarkdownStyle=`
#preparationPreview{font-size:17px;line-height:1.8;overflow-wrap:anywhere;min-width:0}
#preparationPreview h1,#preparationPreview h2,#preparationPreview h3{line-height:1.5;margin:20px 0 10px}
#preparationPreview h1{font-size:26px}#preparationPreview h2{font-size:23px}#preparationPreview h3{font-size:20px}
#preparationPreview p{margin:10px 0}#preparationPreview ul,#preparationPreview ol{padding-left:26px}
#preparationPreview li{margin:4px 0}#preparationPreview blockquote{border-left:3px solid #94ad9c;margin:12px 0;padding-left:16px;color:#516c5b}
#preparationPreview pre{white-space:pre;overflow:auto;background:#f2f5f3;padding:12px;border-radius:8px}
#preparationPreview code{background:#f2f5f3;padding:2px 4px}#preparationPreview pre code{padding:0}
#preparationPreview .markdown-table{overflow-x:auto;max-width:100%}#preparationPreview table{border-collapse:collapse;min-width:100%}
#preparationPreview th,#preparationPreview td{border:1px solid #dce5df;padding:8px;text-align:left}
#preparationPreview input{width:auto;display:inline;min-height:0;height:auto;padding:0;margin:0 6px 0 0;vertical-align:middle}#preparation{font-family:monospace;min-height:240px}
`;

export function renderPreparationMarkdown(text,target){
 const source=String(text||'');
 if(!source.trim()){target.textContent='尚無會前資料，可切換至「編輯 Markdown」貼上內容。';return;}
 // Parse into an inert template, then build only known safe elements and attributes.
 const template=document.createElement('template');
 template.innerHTML=window.marked.parse(source,{gfm:true,breaks:true});
 const allowed=new Set(['P','BR','H1','H2','H3','H4','H5','H6','STRONG','EM','DEL','UL','OL','LI','BLOCKQUOTE','PRE','CODE','HR','TABLE','THEAD','TBODY','TR','TH','TD','A','INPUT']);
 const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','TEMPLATE']);
 function copy(node,parent){
  if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
  if(node.nodeType!==1||blocked.has(node.tagName))return;
  if(node.tagName==='IMG'){parent.append(document.createTextNode(node.getAttribute('alt')||''));return;}
  if(!allowed.has(node.tagName)){for(const child of node.childNodes)copy(child,parent);return;}
  if(node.tagName==='INPUT'&&node.getAttribute('type')!=='checkbox')return;
  const el=document.createElement(node.tagName.toLowerCase());
  if(node.tagName==='A'){
   const href=node.getAttribute('href')||'';
   if(/^(https?:\/\/|mailto:)/i.test(href)&&!/[\u0000-\u0020\u007f]/.test(href)){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}
  }
  if(node.tagName==='OL'&&/^\d{1,9}$/.test(node.getAttribute('start')||''))el.setAttribute('start',node.getAttribute('start'));
  if(node.tagName==='INPUT'){el.type='checkbox';el.disabled=true;el.checked=node.hasAttribute('checked');}
  for(const child of node.childNodes)copy(child,el);
  if(node.tagName==='TABLE'){const wrap=document.createElement('div');wrap.className='markdown-table';wrap.append(el);parent.append(wrap);}else parent.append(el);
 }
 const fragment=document.createDocumentFragment();for(const node of template.content.childNodes)copy(node,fragment);target.replaceChildren(fragment);
}

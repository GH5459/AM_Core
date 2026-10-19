import crypto from 'node:crypto';
import {failure,checkField,checkPublication} from './workspace-model.js';

// Existing records are split without changing even a blank line. IDs become
// durable on the first explicit save; they never depend on the edited text.
export function recordBlocks(row){
 if(Array.isArray(row.record_blocks)&&row.record_blocks.map(b=>b.text).join('\n')===(row.fields.record||''))return row.record_blocks;
 return String(row.fields.record||'').split('\n').map((text,i)=>({id:crypto.createHash('sha256').update(row.id+':record:'+i+':'+text).digest('hex').slice(0,32),text}));
}
export function applyPart(row,input){
 const {field,value,version}=input;
 if(!Number.isSafeInteger(version)||version<0)throw failure(400,'修改版本不正確。');
 const versions={...row.field_versions},fields={...row.fields},blocks=recordBlocks(row).map(b=>({...b}));let before;
 if(Number(versions[field]||0)!==version)throw failure(409,'這一段或待辦已被其他人修改。請比較最新內容；你的輸入仍保留。');
 if(/^record:[a-f0-9]{32}$/.test(field)){
  if(typeof value!=='string'||value.length>300000)throw failure(400,'段落內容格式不正確。');
  const id=field.slice(7),block=blocks.find(b=>b.id===id);before=block?.text??'';
  if(block)block.text=value;
  else{const at=input.after===null?-1:blocks.findIndex(b=>b.id===input.after);if(input.after!==null&&at<0)throw failure(409,'插入位置已改變，請重新讀取。');if(!value.trim())throw failure(400,'新段落請先填寫內容。');blocks.splice(at+1,0,{id,text:value});}
  fields.record=blocks.map(b=>b.text).join('\n');if(fields.record.length>300000)throw failure(400,'會議內容過長。');versions.record=Number(versions.record||0)+1;
 }else{
  if(!/^todo:[a-f0-9-]{36}$/.test(field)&&field!=='transcript')throw failure(400,'不支援修改此內容。');
  checkField(field,value);before=fields[field]??null;if(value===null)delete fields[field];else fields[field]=value;
  if(Object.keys(fields).filter(k=>k.startsWith('todo:')).length>60)throw failure(400,'待辦最多 60 項。');
 }
 versions[field]=version+1;
 if(row.state==='published')checkPublication({...row,fields});
 return {fields,record_blocks:blocks,field_versions:versions,patch:{field,before,value,blocks,versions}};
}

// Unicode-aware, bounded comparison. Large replacements remain a readable
// deletion/addition rather than allocating an unbounded character matrix.
export function textChanges(before,after){
 const a=Array.from(String(before??'')),b=Array.from(String(after??''));let start=0,end=0;
 while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 const x=a.slice(start,a.length-end),y=b.slice(start,b.length-end),out=[];
 const add=(kind,text)=>{if(!text)return;if(out.at(-1)?.kind===kind)out.at(-1).text+=text;else out.push({kind,text});};
 add('same',a.slice(0,start).join(''));
 if(x.length*y.length<=250000){
  const rows=Array.from({length:x.length+1},()=>new Uint32Array(y.length+1));
  for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)rows[i][j]=x[i]===y[j]?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1]);
  let i=0,j=0;while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){add('same',x[i++]);j++;}else if(i<x.length&&(j===y.length||rows[i+1][j]>=rows[i][j+1]))add('delete',x[i++]);else add('add',y[j++]);}
 }else{add('delete',x.join(''));add('add',y.join(''));}
 add('same',end?a.slice(a.length-end).join(''):'');return out;
}

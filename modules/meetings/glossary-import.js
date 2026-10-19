import {failure} from './workspace-model.js';

export const IMPORT_LIMIT=500;
export function parseGlossaryImport(text,format='text'){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>1024*1024||!text.trim())throw failure(400,'請貼上詞彙或選擇 1 MB 以內的 UTF-8 文字檔。');
 if(!['text','csv','tsv'].includes(format))throw failure(400,'請選擇純文字、CSV 或 Tab 分隔格式。');
 text=text.replace(/^\uFEFF/,'');
 if(text.includes('\uFFFD')||text.includes('\u0000'))throw failure(400,'文字編碼無法辨識，請另存為 UTF-8 後重試。');
 let rows=[];
 if(format==='text')rows=text.split(/\r\n|\n|\r/).map(s=>[s]);
 else{
  const delimiter=format==='csv'?',':'\t';let row=[],cell='',quoted=false,closed=false;
  const endCell=()=>{row.push(cell);cell='';closed=false;};
  const endRow=()=>{endCell();rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
   if(c===delimiter){endCell();continue;}
   if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
   if(closed){if(c===' '||c==='\t'&&delimiter!==c)continue;throw failure(400,'引號結尾後有多餘文字，請檢查 CSV／Tab 格式。');}
   if(c==='"'){if(cell)throw failure(400,'欄位中的引號必須成對，請用試算表匯出 CSV。');quoted=true;}else cell+=c;
  }
  if(quoted)throw failure(400,'有尚未關閉的引號，請檢查匯入內容。');
  if(cell||row.length||closed)endRow();
 }
 let offset=0;
 while(rows.length&&!rows[0].some(s=>s.trim())){rows.shift();offset++;}
 if(rows[0]?.[0]?.trim()==='正確用詞'){
  const header=rows.shift().map(s=>s.trim());offset++;
  if(header.length>1&&(header[1]!=='常見錯字'&&header[1]!=='常見錯字／同音字'||header.length>2&&header[2]!=='背景說明'||header.length>3))throw failure(400,'標題列請使用：正確用詞、常見錯字、背景說明。');
 }
 const values=rows.map((r,i)=>({line:i+1+offset,cells:r})).filter(r=>r.cells.some(s=>s.trim()));
 if(!values.length||values.length>IMPORT_LIMIT)throw failure(400,'每次請匯入 1～500 筆詞條。');
 return values.map(({line,cells})=>({line,invalidColumns:cells.length>3,entry:{term:cells[0]?.trim()||'',aliases:(cells[1]||'').split(/[|｜\r\n]/).map(s=>s.trim()).filter(Boolean),note:cells[2]?.trim()||'',enabled:true}}));
}

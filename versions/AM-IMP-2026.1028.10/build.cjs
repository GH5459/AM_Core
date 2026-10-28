const assert = require('node:assert/strict');
function once(source, oldText, newText) {
  assert.equal(source.split(oldText).length, 2, 'Current work-time source differs from the reviewed baseline');
  return source.replace(oldText, newText);
}
function patchClient(source, path) {
  if (path === '/tasks.js' || path === '/hr-component.js') {
    source = once(source, 'const routines=new Map();let expected=null,identity=null;', 'const routines=new Map();let expected=null,identity=null,workTimeCacheKey=null,workTimeCacheValue=null;');
    source = once(source, 'function total(normal,date){scope();let sum=0', "function total(normal,date){scope();const key=JSON.stringify([identity,date,normal,expected===null?null:[...expected],[...routines]]);if(key===workTimeCacheKey)return workTimeCacheValue;workTimeCacheKey=key;let sum=0");
    source = once(source, "return '總工作時數 '+(missing?'已填 ':'')", "return workTimeCacheValue='總工作時數 '+(missing?'已填 ':'')");
  }
  if (path === '/hr-component.js') {
    const old = "else if(!editor&&!taskBusy&&!saving.size)void loadNotionWork();";
    const next = "else if(!editor&&!taskBusy&&!saving.size&&(notionWork.date!==date||!['ready','disabled','unlinked'].includes(notionWork.state)))void loadNotionWork();";
    source = once(source, old, next);
  }
  return source;
}
exports.patchClient = patchClient;
exports.patchModule = function(source) {
  const old = ' let source=await response.text();';
  const runtime = `\n const patchClient=${patchClient.toString()};\n const once=${once.toString().replace("assert.equal(source.split(oldText).length, 2, 'Current work-time source differs from the reviewed baseline');", "if(source.split(oldText).length!==2)throw Error('Unexpected work-time source');")};\n`;
  source = once(source, 'export async function workTimeLabelsResponse(request,response){', runtime+'\nexport async function workTimeLabelsResponse(request,response){');
  return once(source, old, old+"\n try{source=patchClient(source,route);}catch{return new Response('工作日誌正在更新，請稍後重新整理。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store'}});}");
};

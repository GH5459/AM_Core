function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error('Future navigation anchor missing or repeated: ' + from.slice(0, 100));
  return source.replace(from, () => to);
}
function journal(source) {
  const start = '<section class="form-section"><h3><span class="section-badge">4</span>未來工作</h3>';
  const end = '<section class="reference" aria-label="本週工作計畫">';
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0) throw new Error('Future section anchor');
  const section = source.slice(a, b).replace(start, '<section class="form-section"><h2>未來</h2>');
  source = source.slice(0, a) + source.slice(b);
  const insert = 'function journalWritingLabel(page,label){';
  const future = `function renderFutureWorkspace(entry){const draft=eveningFields(entry);return \`<section class="personal-card"><form id="futureWorkForm">${section}<p id="draftStatus" class="sr-only" role="status"></p><span class="work-page-status sr-only" role="status"></span></form></section>\`;}
function bindFutureWorkspace(){const form=$('#futureWorkForm');form.oninput=e=>{if(e.target.matches('[data-journal-row="next"] input'))saveDiaryDraft();};form.onclick=e=>{if(e.target.closest('[data-add-journal-row="next"]')){const id=newTaskId();$('#nextRows').insertAdjacentHTML('beforeend',simpleJournalRow('next',id));$('[data-row-id="'+id+'"] input').focus();}if(e.target.closest('[data-remove-journal-row]')){e.target.closest('[data-journal-row]').remove();saveDiaryDraft();}};form.onsubmit=e=>{e.preventDefault();saveDiaryDraft();};}
`;
  source = replaceOnce(source, insert, future + insert);
  source = replaceOnce(source, "const nextRows=$$('[data-journal-row=\"next\"]')", "const nextRows=!$('#nextRows')?oldRows:$$('[data-journal-row=\"next\"]')");
  source = replaceOnce(source, "notes:$$('[data-legacy-note]').map(input=>input.value.trim()).filter(Boolean)", "notes:personalView==='future'?eveningFields(entry).notes:$$('[data-legacy-note]').map(input=>input.value.trim()).filter(Boolean)");
  return source;
}
function index(source) {
  source = replaceOnce(source, '${personalView===\'todos\'?renderTrackingWorkspace():personalView!==\'weekly\'?renderDiary(d,w):\'\'}', '${personalView===\'todos\'?renderFutureWorkspace(d):personalView!==\'weekly\'?renderDiary(d,w):\'\'}');
  source = replaceOnce(source, "if($('#diaryDate')){", "if(personalView==='todos')bindFutureWorkspace();if($('#diaryDate')){");
  source = replaceOnce(source, "personalView=personalNav.dataset.personalView;render();return", "personalView=personalNav.dataset.personalView;if(personalView==='todos')selectedDate=dateString(new Date());render();return");
  source = replaceOnce(source, "todos:['我的追蹤表','工作待辦持續追蹤，小習慣按日期記錄。','追蹤表']", "todos:['未來','未來的待辦事項。','未來']");
  source = replaceOnce(source, "todos:['工作追蹤','未完成的事，接著往前推進。']", "todos:['未來','未來的待辦事項。']");
  source = replaceOnce(source, '<span data-icon="check"></span>追蹤表', '<span data-icon="check"></span>未來');
  source = replaceOnce(source, '   <button data-personal-view="weekly"><span data-icon="calendar"></span>本週工作計畫</button>\n   <button data-personal-view="overview"><span data-icon="grid"></span>我的工作總覽</button>\n   <button data-personal-view="todos"><span data-icon="check"></span>未來</button>', '   <button data-personal-view="todos"><span data-icon="check"></span>未來</button>\n   <button data-personal-view="weekly"><span data-icon="calendar"></span>本週工作計畫</button>\n   <button data-personal-view="overview"><span data-icon="grid"></span>我的工作總覽</button>');
  source = replaceOnce(source, 'document.body.dataset.mobileView=personalView;', "document.body.dataset.mobileView=personalView==='future'?'todos':personalView;");
  return source.replaceAll("personalView==='todos'", "personalView==='future'").replaceAll("personalView='todos'", "personalView='future'").replaceAll('data-personal-view="todos"', 'data-personal-view="future"').replaceAll('todos:[', 'future:[');
}
function mobile(source) {
  return replaceOnce(source, "[['journals','book','今日'],['weekly','calendar','本週'],['todos','check','追蹤'],['account','people','我的']]", "[['journals','book','今日'],['future','check','未來'],['weekly','calendar','本週'],['account','people','我的']]");
}
export async function futureNavResponse(request,response){
  const route=new URL(request.url).pathname;if(request.method!=='GET'||response.status!==200||!['/','/index.html','/journal.js','/mobile.js'].includes(route))return response;
  const body=await response.text();let result;try{result=route==='/journal.js'?journal(body):route==='/mobile.js'?mobile(body):index(body);}catch{return new Response('頁面更新中，請稍後重新整理。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store'}});}
  const headers=new Headers(response.headers);for(const key of ['content-length','etag','content-encoding','last-modified'])headers.delete(key);headers.set('cache-control','private, no-store');return new Response(result,{status:200,headers});
}


const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Management baseline changed: '+a.slice(0,85));return s.replace(a,b);};
function patchManagement(source){
 let s=source;
 s=once(s,'personnelSelectionPolicy: "own-active-membership",','localePolicy:"employee-single-locale-v1",experienceLocales:a.experienceLocales||{},personnelSelectionPolicy: "own-active-membership",');
 s=once(s,'employees: a.employees.map((p) => ({ ...p, units:','employees: a.employees.map((p) => ({ ...p, experienceLocale:a.experienceLocales?.[p.account]||"zh-Hant", units:');
 s=once(s,'"hrDailylogEnabled", "admin", "routineLibraryIds"]);','"hrDailylogEnabled", "admin", "routineLibraryIds", "experienceLocale"]);\n      if(c.experienceLocale!==undefined&&!["zh-Hant","en","id"].includes(c.experienceLocale))throw new AppError("INVALID_EXPERIENCE_LOCALE",400,"請選擇繁體中文、English 或 Bahasa Indonesia。");');
 s=once(s,'const active = new Set(a.employees.map((p) => p.account)), line =','a.experienceLocales={...(a.experienceLocales||{})};\n      const active = new Set(a.employees.map((p) => p.account)), line =');
 s=once(s,'for (const c of input.changes) {\n        if (!active.has(c.account))','for (const c of input.changes) {\n        if(c.experienceLocale!==undefined){if(c.experienceLocale==="zh-Hant")delete a.experienceLocales[c.account];else a.experienceLocales[c.account]=c.experienceLocale;}\n        if (!active.has(c.account))');
 const marker='var managementAssets = ',start=s.indexOf(marker),end=s.indexOf(';\n',start);assert(start>0&&end>start);
 const assets=JSON.parse(s.slice(start+marker.length,end));let js=assets.js;
 js=once(js,'kinds.some(([k])=>drafts.get(e.account)?.[k]!==e[k])','drafts.get(e.account)?.experienceLocale!==(e.experienceLocale||"zh-Hant")||kinds.some(([k])=>drafts.get(e.account)?.[k]!==e[k])');
 js=once(js,'e=>[e.account,({...Object.fromEntries','e=>[e.account,({experienceLocale:e.experienceLocale||"zh-Hant",...Object.fromEntries');
 js=once(js,'<h3>開通功能</h3>','<label class="org-locale-label">使用與顯示語言<select data-org-locale aria-label="使用與顯示語言" ${busy?\'disabled\':\'\'}>${[[\'zh-Hant\',\'繁體中文（預設）\'],[\'en\',\'English\'],[\'id\',\'Bahasa Indonesia\']].map(([v,t])=>\'<option value="\'+v+\'" \'+(draft.experienceLocale===v?\'selected\':\'\')+\'>\'+t+\'</option>\').join(\'\')}</select></label><p class="person-caption">工作日誌與會議共用此語言。英文與印尼文可閱讀、回覆及變更任務狀態；不能修改任務名稱、內容或會議正文。</p><h3>開通功能</h3>');
 js=once(js,'if(kind){if(kind===\'admin\'&&p.adminLocked)return;','if(i.matches(\'[data-org-locale]\')){if(![\'zh-Hant\',\'en\',\'id\'].includes(i.value))return;d.experienceLocale=i.value;}else if(kind){if(kind===\'admin\'&&p.adminLocked)return;');
 js=once(js,"const selector=kind?'[data-org-kind=\"'+kind+'\"]'","const selector=i.matches('[data-org-locale]')?'[data-org-locale]':kind?'[data-org-kind=\"'+kind+'\"]'");
 js=once(js,"box.querySelector('select').disabled=busy||box.querySelector('select').dataset.locked==='true';","box.querySelectorAll('select').forEach(select=>select.disabled=busy||select.dataset.locked==='true');");
 assets.js=js;assets.css+='\n.org-locale-label{display:grid;gap:8px;margin:14px 0}.org-locale-label select{min-height:44px;width:100%;max-width:100%;box-sizing:border-box}\n';
 const version=crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,20);
 s=s.slice(0,start)+marker+JSON.stringify(assets)+s.slice(end);
 s=s.replace(/var managementUiVersion = "[a-f0-9]+";/,'var managementUiVersion = '+JSON.stringify(version)+';');
 return {source:s,assets,version};
}
module.exports={patchManagement};
if(require.main===module){const folder=process.argv[2];assert(folder&&path.isAbsolute(folder));const result=patchManagement(fs.readFileSync(path.join(folder,'baseline/worker.mjs'),'utf8'));fs.writeFileSync(path.join(folder,'candidate/worker.mjs'),result.source);fs.writeFileSync(path.join(folder,'management-candidate.js'),result.assets.js);fs.writeFileSync(path.join(folder,'management-assets-candidate.json'),JSON.stringify(result.assets));console.log(JSON.stringify({built:true,uiVersion:result.version,changedModules:['worker.mjs'],settingsUnchanged:true}));}

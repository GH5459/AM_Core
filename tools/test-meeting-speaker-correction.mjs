import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
import {meetingSpeakerTools} from '../modules/meetings/workspace-speakers.js';
import {readerData} from '../modules/meetings/workspace-access.js';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createWorkspaceStore} from '../modules/meetings/workspace-store.js';
const todo='todo:11111111-1111-4111-8111-111111111111', block='a'.repeat(32),record='record:'+block;
const clone=structuredClone;
async function fixture(){
 const fields={settings:{topic:'合成版本同步測試',date:'2026-10-20',type:'工作會議',prompt:'保留結論',projectGoal:'合成目標',cycle:{frequency:'daily',intervalDays:7,nextDate:''},speakers:[{name:'甲',role:'',gender:''},{name:'乙',role:'',gender:''}]},record:'- [0:01] 甲：甲提到乙\n摘要：甲與乙需核對',transcript:'[0:01] 甲：甲提到乙\n[0:02] 乙：確認甲的說法\n[0:03] 甲：待處理',[todo]:{content:'合成待辦',ownerId:'owner-original',due:'2026-10-25',evidence:'合成依據'}};
 let state={ok:true,access:'member',host:true,canEdit:true,actor:{id:'synthetic',name:'合成主持人'},types:[],sharing:{enabled:false,people:[],version:0},workspace:{state:'review',revision:1,fields,versions:{[record]:0,[todo]:0,transcript:0},ownerNames:{}},editing:{fields,versions:{[record]:0,[todo]:0,transcript:0},blocks:[{id:block,text:fields.record}],revision:1},changes:[],presence:[],members:{people:[]}};
 const dom=new JSDOM(workspaceHtml({id:'f'.repeat(64),liffId:'synthetic'}),{url:'https://meeting.example.test/meetings/review/work/'+ 'f'.repeat(64),runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[],timers=[];let behavior=null;
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.structuredClone=clone;w.confirm=()=>true;w.setInterval=fn=>{timers.push(fn);return timers.length;};w.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic'};
 function commit(input){const v=state.editing.versions[input.field]||0;if(input.version!==v)return {status:409,error:'這一段或待辦已被其他人修改。'};state=clone(state);state.editing.fields[input.field]=input.value;if(input.field.startsWith('record:')){state.editing.blocks.find(b=>'record:'+b.id===input.field).text=input.value;state.editing.fields.record=input.value;}state.editing.versions[input.field]=v+1;state.editing.revision++;state.workspace={...state.workspace,fields:state.editing.fields,versions:state.editing.versions,revision:state.editing.revision};return {status:200};}
 w.fetch=async(url,options)=>{const input=JSON.parse(options.body);requests.push(input);const result=behavior?await behavior(input,commit):['save-part','edit'].includes(input.action)?commit(input):{status:200};if(result?.throw)throw Error(result.throw);return {ok:result.status===200,status:result.status,json:async()=>result.error?{error:result.error}:clone(result.body||state)};};
 for(const script of dom.window.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 w.initializeMeetingHub=()=>{};
 const tick=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};await tick();
 const el=key=>w.document.querySelector('[data-part="'+key+'"]'),area=key=>el(key).querySelector(key===transcript?'textarea':key.startsWith('todo:')?'[data-content]':'[contenteditable]');
 function edit(key,value){const e=area(key);e.focus();if(e.tagName==='TEXTAREA')e.value=value;else e.innerText=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
 const save=key=>el(key).querySelector('[data-save]').onclick();const transcript='transcript';
 return {w,el,edit,save,tick,requests,poll:()=>timers[0](),get state(){return state;},setBehavior:fn=>behavior=fn,commit,close:()=>dom.window.close()};
}
const tools=meetingSpeakerTools(),mapping={甲:'乙',乙:'甲'};
assert.equal(tools.replace('[0:01] 甲：乙的內容\r\n[0:02] 乙：甲的內容',mapping),'[0:01] 乙：乙的內容\r\n[0:02] 甲：甲的內容');
assert.equal(tools.replace('摘要：甲與乙\n甲方：甲\n- [0:01] 甲：內容',mapping),'摘要：甲與乙\n甲方：甲\n- [0:01] 乙：內容');
assert.equal(tools.replace('[0:01] 甲：一\n[0:02] 甲：二',mapping,{line:1}),'[0:01] 甲：一\n[0:02] 乙：二');
assert.equal(tools.replace('- [0:01] 甲：一\n- [0:02] 甲：二',mapping,{time:'0:01'}),'- [0:01] 乙：一\n- [0:02] 甲：二');
assert.deepEqual(tools.segments('[1:02:03] 甲：內容'),[{start:3723000,speaker:'甲',text:'內容'}]);
assert.equal(tools.segments('[1:99] 甲：無效時間').length,0);
assert.equal(tools.record('### Seven 對未來的看法\n摘要：Seven 分享，Kevin 回應\n- [0:01] Seven：Kevin 的看法',{Seven:'Kevin',Kevin:'Seven'}),'### Kevin 對未來的看法\n摘要：Kevin 分享，Seven 回應\n- [0:01] Kevin：Kevin 的看法');
assert.equal(tools.record('摘要：Seven 提案\n- [0:01] Kevin：Seven 的看法',{Seven:'Kevin',Kevin:'Seven'},{labels:false}),'摘要：Kevin 提案\n- [0:01] Kevin：Seven 的看法');
assert.equal(tools.narrative('SevenAM / Seven / Kevin / Kevin2',{Seven:'Kevin',Kevin:'Seven'}),'SevenAM / Kevin / Seven / Kevin2');
assert.equal(tools.narrative('### 同仁甲與同仁乙',{同仁甲:'同仁乙',同仁乙:'同仁甲'}),'### 同仁乙與同仁甲');
const view=readerData({fields:{settings:{},record:'',transcript:'[0:01] 乙：已修正'},receipt:{},result:{segments:[{start:1000,speaker:'甲',text:'舊原文'}]}});
assert.equal(view.segments[0].speaker,'乙');assert.equal(view.segments[0].text,'已修正');
{
 const f=await fixture();try{
 const $=s=>f.w.document.querySelector(s),originalTodo=clone(f.state.editing.fields[todo]);
 f.edit(record,'- [0:01] 甲：甲提到乙，人工編輯\n摘要：甲與乙需核對');
 f.edit(todo,'人工編輯的待辦甲乙');
 const todoDraft=f.el(todo).querySelector('[data-content]').innerText;
 $('#swapSpeakers').click();assert($('#speakerDialog').open);assert($('#speakerPreview').textContent.includes('甲 → 乙'));
 $('#cancelSpeaker').click();assert.equal(f.requests.filter(r=>r.action==='save-part').length,0);
 $('#swapSpeakers').click();$('#applySpeaker').click();
 assert.equal(f.el('transcript').querySelector('textarea').value,'[0:01] 乙：甲提到乙\n[0:02] 甲：確認甲的說法\n[0:03] 乙：待處理');
 assert(f.el(record).textContent.includes('乙：甲提到乙，人工編輯'));assert(f.el(record).textContent.includes('摘要：乙與甲需核對'));
 assert.equal(f.el(todo).querySelector('[data-content]').innerText,todoDraft);assert.equal(f.el(todo).querySelector('[data-owner]').value,originalTodo.ownerId);
 $('#undoSpeaker').click();assert.equal(f.el('transcript').querySelector('textarea').value,f.state.editing.fields.transcript);assert(f.el(record).classList.contains('dirty'));assert(f.el(record).textContent.includes('甲：甲提到乙，人工編輯'));
 $('#swapSpeakers').click();$('#applySpeaker').click();
 $('#backSettings').click();assert(!$('#setupPanel').hidden);assert($('#start').hidden);assert($('#recordPanel').hidden);
 $('#projectGoal').value='修正後的合成目標';$('#projectGoal').dispatchEvent(new f.w.Event('input',{bubbles:true}));
 await f.poll();assert.equal($('#projectGoal').value,'修正後的合成目標');
 $('#returnReview').click();assert(!$('#recordPanel').hidden);assert(f.el(record).textContent.includes('人工編輯'));assert(f.el(todo).textContent.includes(todoDraft));
 await $('#saveContent').onclick();assert.equal(f.state.editing.fields.settings.projectGoal,'修正後的合成目標');assert.equal(f.state.editing.fields[todo].ownerId,originalTodo.ownerId);assert.equal(f.state.editing.fields[todo].due,originalTodo.due);assert.equal(f.state.editing.fields[todo].content,todoDraft);assert.equal(f.state.editing.fields.transcript.split('\n')[0],'[0:01] 乙：甲提到乙');
 assert.equal(f.requests.filter(r=>['start','publish','sharing'].includes(r.action)).length,0);
 }finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s),original=f.state.editing.fields.transcript;
 $('#correctSpeakerLabels').checked=false;$('#swapSpeakers').click();$('#applySpeaker').click();
 assert.equal(f.el('transcript').querySelector('textarea').value,original);
 assert(f.el(record).textContent.includes('- [0:01] 甲：甲提到乙'));
 assert(f.el(record).textContent.includes('摘要：乙與甲需核對'));
 await $('#saveContent').onclick();assert.equal(f.state.editing.fields.transcript,original);
 assert(f.state.editing.fields.record.includes('摘要：乙與甲需核對'));
 }finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);$('#segmentCorrection').open=true;$('#segmentCorrection').dispatchEvent(new f.w.Event('toggle'));const rows=$('#segments').children;assert.equal(rows.length,3);rows[0].querySelector('select').value='乙';rows[0].querySelector('button:last-child').click();$('#applySpeaker').click();assert.equal(f.el('transcript').querySelector('textarea').value,'[0:01] 乙：甲提到乙\n[0:02] 乙：確認甲的說法\n[0:03] 甲：待處理');assert(f.el(record).textContent.includes('- [0:01] 乙：甲提到乙'));assert.equal(f.el(todo).querySelector('[data-owner]').value,'owner-original');await $('#saveContent').onclick();assert.equal(f.state.editing.fields.transcript.split('\n')[2],'[0:03] 甲：待處理');}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);$('#swapSpeakers').click();f.edit('transcript','[0:01] 甲：預覽期間新輸入');$('#applySpeaker').click();assert.equal(f.el('transcript').querySelector('textarea').value,'[0:01] 甲：預覽期間新輸入');assert($('#error').textContent.includes('重新預覽'));}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);$('#swapSpeakers').click();$('#applySpeaker').click();f.commit({field:'transcript',value:'[0:01] 甲：他人新內容',version:0});await f.save('transcript');assert(f.el('transcript').classList.contains('dirty'));assert(f.el('transcript').querySelector('[data-conflict]'));assert.equal(f.state.editing.fields.transcript,'[0:01] 甲：他人新內容');}finally{f.close();}
}
{
 const f=await fixture();try{const $=s=>f.w.document.querySelector(s);f.edit('transcript','[0:01] 甲：一\n[0:01] 甲：二');$('#segmentCorrection').open=true;$('#segmentCorrection').dispatchEvent(new f.w.Event('toggle'));const row=$('#segments').children[0];row.querySelector('select').value='乙';row.querySelector('button:last-child').click();assert($('#speakerPreview').textContent.includes('時間未能唯一對應'));$('#applySpeaker').click();assert.equal(f.el('transcript').querySelector('textarea').value,'[0:01] 乙：一\n[0:01] 甲：二');assert(!f.el(record).classList.contains('dirty'),'Ambiguous same-second evidence must stay unchanged');}finally{f.close();}
}
{
 const pg=new PGlite();try{
 for(const file of ['core/central-archive/schema.sql','modules/meetings/workspace.sql'])await pg.exec(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const pool={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})},store=createWorkspaceStore(pool),key='1'.repeat(64),host={id:'U'+'1'.repeat(32),name:'合成主持人'},member={id:'U'+'2'.repeat(32),name:'合成成員'};
 await pg.query('INSERT INTO central_archive.conversations(key,bot_id,source_kind,source_id) VALUES($1,$2,$3,$4)',[key,'synthetic','group','C'+'1'.repeat(32)]);
 let row=await store.create(key,{source:{type:'group',groupId:'C'+'1'.repeat(32),userId:host.id},timestamp:Date.now(),message:{id:'synthetic-speaker',type:'audio'}},'synthetic.m4a',host.name);
 const fields={...row.fields,record:'人工保留記錄',transcript:'[0:01] 甲：人工保留逐字稿',[todo]:{content:'保留待辦',ownerId:member.id,due:'2026-10-25',evidence:'原始依據'}};
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='review',fields=$2::jsonb WHERE id=$1",[row.id,JSON.stringify(fields)]);
 const value={...fields.settings,topic:'修改主題',speakers:[{name:'乙',gender:'',role:''},{name:'甲',gender:'',role:''}]};
 await assert.rejects(()=>store.edit(row.id,member,{field:'settings',value,version:0}),e=>e.status===403);
 row=await store.edit(row.id,host,{field:'settings',value,version:0});assert.equal(row.state,'review');assert.equal(row.fields.record,fields.record);assert.equal(row.fields.transcript,fields.transcript);assert.deepEqual(row.fields[todo],fields[todo]);assert.equal(row.field_versions.settings,1);
 await assert.rejects(()=>store.edit(row.id,host,{field:'settings',value,version:0}),e=>e.status===409);
 await assert.rejects(()=>store.transition(row.id,host,'start',Number(row.revision)),e=>e.status===409);
 assert.equal((await store.history(row.id))[0].field,'settings');
 await pg.query("UPDATE central_archive.meeting_workspaces SET state='published' WHERE id=$1",[row.id]);await assert.rejects(()=>store.edit(row.id,host,{field:'settings',value,version:1}),e=>e.status===409);
 }finally{await pg.close();}
}
console.log('Speaker correction: simultaneous swap, single-segment evidence, updated narrative, unchanged quotes/owners/dates, undo, settings round-trip, unsaved drafts, persisted saves, preview changes, concurrent conflict, host-only settings and audit passed.');

import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
import {decisionRecordText} from '../modules/meetings/decision-record.js';

const id='f'.repeat(64),block='a'.repeat(32);
const record=decisionRecordText([{title:'合成主題 <script>不得執行</script>',summary:'已確認原決議',status:'待處理',evidence:[{timestamp:'00:01',speaker:'甲',text:'保留原對話依據'}],children:[{title:'子議題',summary:'核對資料',evidence:[{speaker:'乙',text:'保留子議題依據'}]}]}]);
async function fixture(initial='publishing'){
 const fields={settings:{topic:'合成會議',date:'2026-10-21',speakers:[]},record,transcript:'[00:01] 甲：完整原文'};
 let state={ok:true,access:'member',host:true,canEdit:initial!=='publishing',actor:{id:'synthetic',name:'合成主持人'},types:[],presence:[],changes:[],sharing:{enabled:false,people:[],version:0},workspace:{id,state:initial,revision:1,fields,versions:{},ownerNames:{},error:initial==='publishing'?'發布尚未全部完成，正在續作':''},editing:{fields,versions:{},blocks:[{id:block,text:record}],revision:1},reader:{topic:'合成會議',date:'2026-10-21',record,transcript:fields.transcript,todos:[],segments:[]}};
 const dom=new JSDOM(workspaceHtml({id,liffId:'synthetic'}),{url:'https://meeting.example.test/meetings/review/work/'+id,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,timers=[],requests=[];
 w.structuredClone=structuredClone;w.setInterval=fn=>{timers.push(fn);return timers.length;};
 w.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic'};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>structuredClone(state)};};
 for(const script of w.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 w.initializeMeetingHub=()=>{};
 const tick=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};await tick();
 return {w,$:s=>w.document.querySelector(s),requests,tick,poll:async()=>{await timers[0]();await tick();},setState:next=>{state.workspace.state=next;state.canEdit=next!=='publishing';},close:()=>dom.window.close()};
}
function reader(f){assert(!f.$('#readerPanel').hidden);assert(f.$('#recordPanel').hidden);assert.equal(f.$('#pageHeading').textContent,'會議記錄');assert.equal(f.$('#readingRecordText').querySelectorAll('.decision-topic').length,2);assert(!f.$('#readingRecordText').querySelector('script'));assert(!/^## /m.test(f.$('#readingRecordText').textContent));assert(f.$('#readingRecordText').textContent.includes('保留原對話依據'));}
{
 const f=await fixture();try{
  reader(f);assert(f.$('#modeSwitch').hidden);assert(f.$('#notice').textContent.includes('正在續作'));assert(f.$('#connection').textContent.includes('發布處理中'));
  const topics=f.$('#readingRecordText').querySelectorAll('details');assert([...topics].every(t=>!t.open),'source dialogue and subtopics default closed');
  topics[0].open=true;topics[1].open=true;
  await f.poll();reader(f);assert(f.$('#readingRecordText details').open,'polling keeps the reader choice');
  f.setState('published');await f.poll();reader(f);assert(!f.$('#modeSwitch').hidden);assert(f.$('#readingRecordText details').open);
  f.$('#editMode').click();assert(!f.$('#recordPanel').hidden);assert(f.$('#readerPanel').hidden,'published members can still deliberately edit');
  await f.poll();assert(!f.$('#recordPanel').hidden,'published polling must retain a deliberate editing mode');
  f.$('#viewMode').click();reader(f);assert(f.requests.every(r=>['read','members'].includes(r.action)),'display changes must never save, republish or dispatch');
 }finally{f.close();}
}
{
 const f=await fixture('review');try{
  assert(!f.$('#recordPanel').hidden,'normal collaborative editing remains available');
  f.setState('publishing');await f.poll();reader(f);assert(f.$('#modeSwitch').hidden);
  await f.poll();reader(f);
 }finally{f.close();}
}
console.log('Actual meeting HTML: initial and transitioned publishing use formatted collapsed reader; retries/status retained, polling preserves expanded topics, published editing remains deliberate, escaped content and no business writes passed.');

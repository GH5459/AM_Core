import assert from 'node:assert/strict';
import {normalizeDecisionTopics,decisionRecordText,parseDecisionRecord,decisionRecordHtml,meetingNotionBlocks,appendVerifiedMeetingBlocks} from '../modules/meetings/decision-record.js';
const leaf={title:'資料缺漏仍待核對',summary:'先確認缺漏，再驗證完整月份。',status:'待確認',evidence:[{timestamp:'00:10',speaker:'同仁甲',text:'目前仍有缺漏，需要重新核對。'}]};
const topics=normalizeDecisionTopics([{title:'資料與報表',summary:'先處理正確性，再整合查詢。',children:[{title:'報表核對',summary:'追蹤新增資料。',children:[leaf]}]}],'[00:10] 同仁甲：目前仍有缺漏。');
const text=decisionRecordText(topics),parsed=parseDecisionRecord(text),html=decisionRecordHtml(text);
assert.equal(parsed.topics[0].children[0].children[0].title,leaf.title);
assert.equal(parsed.topics[0].children[0].children[0].evidence.length,1);
assert.equal(parsed.topics[0].evidence.length,0);assert(html.includes('data-decision="0.0.0.e"'));
assert.equal((html.match(/class="decision-children"/g)||[]).length,2);
assert(!html.includes('details open'));assert(text.includes('#### '+leaf.title));
// A real Notion append rejects more than two nested levels. Exercise reply loss
// after any individual write, including a partially saved subtree.
for(let failAt=1;failAt<=4;failAt++){
 const db=new Map([['page',[]]]);let seq=0,writes=0;
 const clone=blocks=>blocks.map(block=>{const b=structuredClone(block),children=b[b.type].children;b.id='id-'+(++seq);delete b[b.type].children;db.set(b.id,children?clone(children):[]);return b;});
 const depth=blocks=>Math.max(0,...blocks.map(b=>1+depth(b[b.type]?.children||[])));
 const request=async(url,method='GET',body)=>{const id=url.match(/\/blocks\/([^/]+)/)[1];if(method==='GET')return {results:structuredClone(db.get(id)),has_more:false};assert(depth(body.children)<=2,'Notion append depth limit');db.get(id).push(...clone(body.children));if(++writes===failAt)throw Error('lost_reply');return {};};
 const plan=meetingNotionBlocks(['會議修訂 3',text]);
 try{await appendVerifiedMeetingBlocks(request,'page',plan,'會議修訂 3');}catch(e){assert.match(e.message,/lost_reply/);}
 await appendVerifiedMeetingBlocks(request,'page',plan,'會議修訂 3');
 const writeCount=writes;await appendVerifiedMeetingBlocks(request,'page',plan,'會議修訂 3');assert.equal(writes,writeCount);
 const root=db.get('page').find(b=>b.type==='toggle'),child=db.get(root.id).find(b=>b.type==='toggle'),small=db.get(child.id).find(b=>b.type==='toggle');
 assert.equal(db.get(small.id).length,2);assert.equal(db.get('page').length,3);
 db.get(small.id)[1].paragraph.rich_text[0].text.content='外部已修改';await assert.rejects(()=>appendVerifiedMeetingBlocks(request,'page',plan,'會議修訂 3'),/content_changed/);
}
console.log('Three topic levels round-trip; source evidence remains on its leaf; nested rendering and Notion two-level API limit, partial-save recovery, no duplicate writes and external-edit protection passed.');

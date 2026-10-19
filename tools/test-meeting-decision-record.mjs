import assert from 'node:assert/strict';
import {normalizeDecisionTopics,decisionRecordText,parseDecisionRecord,decisionRecordHtml,meetingNotionBlocks,appendVerifiedMeetingBlocks} from '../modules/meetings/decision-record.js';
import {__test} from '../modules/meetings/index.js';
import {recordText} from '../modules/meetings/workspace-model.js';
const input={title:'先確認資料來源',summary:'同一份資料供不同報表使用，實際串接仍待核對。',status:'方向確認，實作待驗證',evidence:[{timestamp:'00:04',speaker:'同仁甲',text:'資料集中管理，尚未完成驗證。'},{timestamp:'99:59',speaker:'不存在的人',text:'這段時間與講者沒有來源。'}]};
const topics=normalizeDecisionTopics([input,input], '[0:04] 同仁甲：資料集中管理。');assert.equal(topics.length,1);assert.equal(topics[0].evidence[0].timestamp,'00:04');assert.equal(topics[0].evidence[1].timestamp,'');assert.equal(topics[0].evidence[1].speaker,'發言者待核對');
const record=decisionRecordText(topics,'下次核對時間待確認'),parsed=parseDecisionRecord(record);assert.equal(parsed.topics.length,1);assert.equal(parsed.tail.length,1);assert.equal(recordText({topics}),decisionRecordText(topics));assert.equal(parseDecisionRecord('歷史記錄\n## 原段落'),null);assert.equal(decisionRecordHtml('歷史記錄'),null);
const safe=decisionRecordHtml(decisionRecordText([{...topics[0],title:'<img onerror="alert(1)">',summary:'<script>bad()</script>'}]));assert(!safe.includes('<img'));assert(!safe.includes('<script>'));assert(safe.includes('&lt;script&gt;'));assert(safe.includes('<details'));assert(!safe.includes('<details open'));
const normalized=__test.normalizeParsed({title:'合成會議',topics,todos:[{content:'保留同一任務',owner:'同仁甲',due:'2026-10-20'}]},'[0:04] 同仁甲：資料集中管理。');assert.equal(normalized.topics.length,1);assert.equal(normalized.conclusions.length,0);assert.equal(normalized.todos[0].due,'2026-10-20');
for(const kind of ['work','share']){const prompt=__test.meetingPrompt({who:'同仁甲',today:'2026-10-19',kind});assert(prompt.includes('不逐句列發言'));assert(prompt.includes('不能改寫成已送審'));assert(!prompt.includes('寧可詳盡'));}
// Realistic Notion reply loss: persisted nested blocks are returned without
// inline children. Verify/resume both the topic and its complete evidence.
const database=new Map([['page',[]]]);let next=0,lost=true,writes=0;
const copy=blocks=>blocks.map(block=>{const b=structuredClone(block),children=b[b.type].children;b.id='block-'+(++next);b.has_children=!!children?.length;delete b[b.type].children;if(children)database.set(b.id,copy(children));return b;});
const request=async(url,method='GET',body)=>{const id=url.match(/\/blocks\/([^/]+)/)[1];if(method==='GET')return {results:structuredClone(database.get(id)||[]),has_more:false};writes++;database.get(id).push(...copy(body.children));if(lost){lost=false;throw Error('lost_reply');}return {};};
const planned=meetingNotionBlocks(['會議修訂 2',record,'逐字稿','[0:04] 同仁甲：資料集中管理。']);assert.equal(planned.filter(b=>b.type==='toggle').length,1);
await assert.rejects(()=>appendVerifiedMeetingBlocks(request,'page',planned,'會議修訂 2'),/lost_reply/);await appendVerifiedMeetingBlocks(request,'page',planned,'會議修訂 2');await appendVerifiedMeetingBlocks(request,'page',planned,'會議修訂 2');assert.equal(writes,1);assert.equal(database.get('page').filter(b=>b.type==='toggle').length,1);
const toggle=database.get('page').find(b=>b.type==='toggle');assert.equal(database.get(toggle.id).length,3);database.get(toggle.id)[1].paragraph.rich_text[0].text.content='外部修改';await assert.rejects(()=>appendVerifiedMeetingBlocks(request,'page',planned,'會議修訂 2'),/content_changed/);
console.log('Merged decisions: source timestamps/speakers, deduplication, safe expandable rendering, legacy fallback, work/share prompts, independent task dates and nested Notion lost-reply/conflict protection passed.');
// Exercise the exact maintenance path against real PostgreSQL semantics and
// the original revision worker, rather than relying only on field helpers.
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
const original=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0];
const originalTaskIds=[...f.taskIds],originalPushes=f.pages.get('fixture-page').children.length;let remoteTaskWrites=0;
f.platform.publishMeetingTasks=async()=>{remoteTaskWrites++;throw Error('Record-only revision must not write work tasks');};
await f.service.store.revise(original.id,{id:original.host_id,name:'主持人授權整理'},{...original.fields,record},Number(original.revision),original.receipt.ownerNames);
await f.service.drain();await f.service.settle();await f.service.taskDispatch.run(original.id);
const revised=await f.service.store.get(original.id);assert.equal(revised.fields.record,record);
for(const key of Object.keys(original.fields).filter(k=>k!=='record'))assert.deepEqual(revised.fields[key],original.fields[key]);
for(const key of ['filename','source','result','conversation_key','sharing_enabled','shared_people','sharing_version'])assert.deepEqual(revised[key],original[key]);
assert.equal(revised.receipt.notionId,original.receipt.notionId);assert.deepEqual([...f.taskIds],originalTaskIds);assert.equal(remoteTaskWrites,0);
const newBlocks=f.pages.get('fixture-page').children.slice(originalPushes);assert.equal(newBlocks.filter(b=>b.type==='toggle').length,1);assert(newBlocks.some(b=>b.type==='paragraph'&&b.paragraph.rich_text[0].text.content===original.fields.transcript));
assert((await f.service.store.history(original.id)).some(h=>h.field==='published_revision'&&h.before_value.record===original.fields.record));
await f.pg.close();console.log('Record-only official revision: original task IDs, owners, due dates, recording, full transcript, source, sharing, Notion page and prior audit preserved; zero remote task writes.');

import assert from 'node:assert/strict';
import {meetingLineRecord} from '../modules/meetings/line-record.js';
import {decisionRecordText} from '../modules/meetings/decision-record.js';
const child={title:'新增資料尚未驗證',summary:'同仁甲已修改設定；同仁乙仍需驗證完整月份。',status:'待驗證，尚未完成',evidence:[{speaker:'同仁甲',text:'此段來源只在完整會議記錄呈現。'}]};
const topics=[{title:'資料與報表整合',summary:'先核對資料，再整合查詢。',status:'方向確認',children:[{title:'報表核對',summary:'新增資料仍須確認。',status:'待處理',children:[child]}]},{title:'本週工作安排',summary:'先完成盤點。下一步安排檢查。',status:'工作安排'}];
const record=decisionRecordText(topics),before=structuredClone(topics),line=meetingLineRecord(record);
assert(line.includes('● 資料與報表整合'));assert(line.includes('　○ 報表核對'));assert(line.includes('　　◦ 新增資料尚未驗證'));assert(line.includes('　　　・ 狀態：待驗證，尚未完成'));assert(line.includes('● 本週工作安排'));
assert(!line.includes('##'));assert(!line.includes('此段來源只在'));assert(!line.includes('對話依據（摘意）'));assert.deepEqual(topics,before);
assert(line.includes('　○ 先完成盤點。\n　○ 下一步安排檢查。'));
const long=meetingLineRecord(decisionRecordText([{...child,title:'長主題',summary:'房間設備與備品需逐項檢查確認，English words and numbers 12345 should remain readable。'.repeat(6)}]));
assert(long.split('\n').some(l=>/^　　 /.test(l)),'Wrapped body lines keep the same hanging indent');assert(!/[\uD800-\uDBFF]$/.test(long));
for(const maxChars of [400,600,1500,3000,4000]){
 const many=Array.from({length:24},(_,i)=>({...child,title:'主題'+i+'項目'.repeat(40),summary:'待確認原始資料。'.repeat(60),children:topics}));
 const output=meetingLineRecord(decisionRecordText(many),{maxChars});assert(output.length<=maxChars,`${maxChars}: ${output.length}`);assert(output.endsWith('細節與對話依據，請開啟完整會議記錄。'));assert(!output.includes('##'));
}
const legacy=meetingLineRecord('重點摘要\n## 歷史主題\n摘要：保留原內容。\n對話依據（摘意）：\n- 逐句發言\n## 下個主題\n摘要：待確認。');assert(!legacy.includes('##'));assert(!legacy.includes('逐句發言'));assert(legacy.includes('● 下個主題'));
console.log('LINE outline: three topic levels, full-width indents, sentence bullets, hanging wrap, pending status, no Markdown/source dump, fair bounded length and unchanged source passed.');
// The original publication path still sends exactly one notification with its
// original retry key. This fixture never contacts a real LINE recipient.
process.env.MEETING_WORKSPACE_PREVIEW='1';
const {fixture:f}=await import('./test-meeting-workspace-service.mjs');f.resetMembership();
try{
 const before=(await f.pg.query("SELECT * FROM central_archive.meeting_workspaces WHERE state='published'")).rows[0];
 const notices=f.pushes.filter(p=>p.key==='workspace-published:'+before.id);assert.equal(notices.length,1);assert(/[●○]/u.test(notices[0].message));assert(notices[0].message.length<=5000);assert(notices[0].message.includes('/meetings/review/work/'+before.id));
 await f.service.drain();await f.service.settle();assert.equal(f.pushes.filter(p=>p.key==='workspace-published:'+before.id).length,1);
 const after=await f.service.store.get(before.id);assert.deepEqual(after.fields,before.fields);assert.deepEqual(after.receipt,before.receipt);assert.equal(after.revision,before.revision);
 console.log('Original publication: one same-key notification, complete meeting link, message limit and no re-send or source/task changes passed.');
}finally{await f.pg.close();}

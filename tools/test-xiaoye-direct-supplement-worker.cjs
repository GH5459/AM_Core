const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {setup} = require('./test-xiaoye-worker.cjs');

test('LINE supplement keeps the original case and archives its previous proposal and approval', async () => {
  const a = await setup();
  try {
    const initial = await a.ok(await a.intake());
    let task = (await a.propose(await a.get(initial.taskId))).task;
    task = (await a.approve(task)).task;
    const oldProposal = task.secretary.proposal, oldApproval = task.secretary.approval;
    const user = 'U'+'b'.repeat(32), bot = 'U'+'a'.repeat(32);
    const source = {botUserId:bot,type:'user',conversationId:user,userId:user,eventId:crypto.randomUUID(),messageId:crypto.randomUUID(),timestamp:Date.now()};
    const received = await a.ok(await a.intake({start:false,source,text:'隔離補充：手機仍有問題'}));
    assert.equal(received.taskId, initial.taskId);
    task = await a.get(initial.taskId);
    assert.equal(task.secretary.approval,null);
    assert.equal(task.secretary.proposal,null);
    assert.equal(task.secretary.proposalHistory.at(-1).hash,oldProposal.hash);
    assert.equal(task.secretary.approvalHistory.at(-1).hash,oldApproval.hash);
    assert(task.description.includes('手機仍有問題'));
  } finally { await a.close(); }
});

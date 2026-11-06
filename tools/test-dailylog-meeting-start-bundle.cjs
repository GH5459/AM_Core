const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {clientSource} = require('../versions/AM-IMP-2026.1028.04/build.cjs');

test('the embedded meeting client includes the start feedback controller', () => {
  const source = clientSource();
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const meetingStartFeedback=/);
  assert.match(source, /const startFeedback=meetingStartFeedback\(/);
  assert.match(source, /尚未確認整理是否已受理/);
});

test('patching a live native bundle retains Calendar entry and cancel integration', () => {
  let source=clientSource();
  source=require('../versions/AM-IMP-2026.1028.06/build.cjs').patchClient(source);
  source=require('../versions/AM-IMP-2026.1028.07/build.cjs').patchClient(source);
  const patched=require('../versions/AM-IMP-2026.1106.01/build.cjs').patchClient(source);
  assert.doesNotThrow(()=>new vm.Script(patched));
  assert(patched.includes('pendingCalendar'));assert(patched.includes('取消新增'));
  assert(patched.includes('const meetingStartFeedback='));
  assert(patched.includes('data.canStart||data.host'));
});

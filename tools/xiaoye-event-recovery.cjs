// Recovery decisions are based on the server's exact event record. A process
// marker alone cannot prove whether a desktop turn or a business write ran.
const OUTCOME_STAGES = new Set(['awaiting_approval', 'awaiting_confirmation']);

function eventMatches(active, inspected) {
  const event = inspected?.event;
  return event?.id === active.id && event?.taskId === active.taskId &&
    event?.sourceVersion === active.sourceVersion;
}

function outcomeRecorded(inspected) {
  const task = inspected?.task;
  return OUTCOME_STAGES.has(task?.stage) ||
    task?.stage === 'clarifying' && task?.waitingForReporter === true;
}
function savedFinalization(active,value){
 if(!value||!['complete','fail'].includes(value.action)||!value.input||typeof value.input!=='object'||Array.isArray(value.input))return null;
 const input=value.input,allowed=value.action==='fail'?['id','lease','operationId','reason','nextStep']:['id','lease','operationId'];
 if(Object.keys(input).some(k=>!allowed.includes(k))||input.id!==active.id||input.lease!==active.lease||typeof input.operationId!=='string'||input.operationId.length<8||input.operationId.length>180||input.reason!==undefined&&typeof input.reason!=='string'||input.nextStep!==undefined&&typeof input.nextStep!=='string')return null;
 return {action:value.action,input:{...input}};
}

/**
 * inspectEvent must be an authenticated, read-only lookup for exactly
 * (active.taskId, active.id).
 * finalizeEvent replays only the persisted operationId. autoResume is a
 * server-guarded, idempotent transition for a blocked auto-authorized case.
 */
async function reconcileInterruptedEvent({active, inspectEvent, verifyLease, finalizeEvent, autoResume, evidence = {}}) {
  if (!active?.id || !active?.lease || !active?.taskId || !Number.isSafeInteger(active.sourceVersion)) {
    throw Error('Missing exact event identity for recovery');
  }
  const inspected = await inspectEvent(active.taskId, active.id);
  if (!eventMatches(active, inspected)) return {decision:'identity-mismatch', terminal:false};
  const event = inspected.event;
  const finalization=savedFinalization(active,evidence.finalization);
  if(evidence.finalizationConflict||(evidence.finalization||evidence.uncertainFinalization)&&!finalization)return {decision:'await-finalization-readback',terminal:false};
  // A terminal state alone does not identify which operation completed it.
  // Let the DO compare the saved original body against its stored fingerprint.
  if(finalization&&['done','failed'].includes(event.state)){
    if(inspected.task?.id!==active.taskId||inspected.task?.sourceVersion!==active.sourceVersion)return {decision:'case-version-changed',terminal:false};
    const result=await finalizeEvent(finalization.action,finalization.input);
    return {decision:'finalization-replayed',terminal:['done','failed'].includes(result?.state),result};
  }
  if (event.state === 'done' && inspected.autoResumeEligible !== true) {
    if (inspected.task?.sourceVersion !== active.sourceVersion) return {decision:'finished-case-updated', terminal:true};
    return {decision:!inspected.resultNotification || inspected.resultNotification.state === 'sent' ? 'finished' : 'notification-only', terminal:true};
  }
  if (event.state === 'superseded' || event.state === 'aborted') {
    return {decision:event.state, terminal:true};
  }
  if (inspected.task?.id !== active.taskId || inspected.task?.sourceVersion !== active.sourceVersion) {
    return {decision:'case-version-changed', terminal:false};
  }
  if (event.state === 'failed' || event.state === 'done' && event.kind === 'execute') {
    const executorReady=inspected.autoResumeEligible === true &&
      (typeof evidence.executorReady === 'function' ? await evidence.executorReady(active,inspected) : evidence.executorReady === true);
    const withinBudget=executorReady &&
      (typeof evidence.failureBudgetAvailable === 'function' ? await evidence.failureBudgetAvailable(active,inspected) : evidence.failureBudgetAvailable !== false);
    if (withinBudget && typeof autoResume === 'function') {
      if (!Number.isSafeInteger(inspected.task?.version)) return {decision:'missing-current-version', terminal:false};
      const operationId = 'auto-resume-event-' + active.id;
      const result = await autoResume({id:active.taskId,version:inspected.task.version,eventId:active.id,operationId});
      return {decision:'auto-resumed', terminal:true, result};
    }
    return {decision:'failed-needs-reconciliation', terminal:true};
  }
  if (event.state !== 'running' || event.leaseActive !== true) {
    return {decision:'lease-changed', terminal:false};
  }
  if (finalization) {
    // The DO atomically checks the original lease and source as part of this
    // idempotent receipt; a generic check would grant a different capability.
    const result = await finalizeEvent(finalization.action,finalization.input);
    return {decision:'finalization-replayed', terminal:['done','failed'].includes(result?.state), result};
  }
  if (typeof verifyLease !== 'function' || await verifyLease(active) !== true) {
    return {decision:'lease-unverified', terminal:false};
  }
  if (outcomeRecorded(inspected)) {
    const result = await finalizeEvent('complete', {
      id:active.id, lease:active.lease, operationId:'event-complete-' + active.id
    });
    return {decision:'outcome-reconciled', terminal:['done','failed'].includes(result?.state), result};
  }
  if (evidence.chatDispatchInput || evidence.desktopTurnUnknown) {
    return {decision:'inspect-original-chat', terminal:false};
  }
  // No marker is not proof that a previous unrestricted executor never ran.
  // The existing runner has no separately enforced durable dispatch boundary.
  return {decision:'dispatch-evidence-incomplete', terminal:false};
}

function nextFailure(previous, {eventId, signature, now = Date.now(), maxAutomaticAttempts = 2}) {
  if (typeof eventId !== 'string' || !/^[a-f0-9]{64}$/.test(eventId)) throw Error('Invalid event identity');
  if (typeof signature !== 'string' || !signature || signature.length > 180) throw Error('Invalid failure signature');
  if (previous?.lastEventId === eventId) return previous;
  const consecutive = previous?.signature === signature ? previous.consecutive + 1 : 1;
  const automaticRetryAllowed = consecutive < maxAutomaticAttempts;
  return {lastEventId:eventId,signature, consecutive, at:now, automaticRetryAllowed,
    nextAttemptAt:automaticRetryAllowed ? now + Math.min(60000, 1000 * 2 ** (consecutive - 1)) : null};
}

module.exports = {reconcileInterruptedEvent, nextFailure};

// Private, per-case routing state. A create request may have succeeded even if
// its response was lost, so an uncertain request is never repeated silently.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const validCase = id => typeof id === 'string' && /^work-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const validThread = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{7,127}$/i.test(id);

class CaseChatRegistry {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, {recursive:true});
  }
  file(caseId) {
    if (!validCase(caseId)) throw Error('無效的案件識別');
    return path.join(this.directory, caseId + '.json');
  }
  read(caseId) {
    const file = this.file(caseId);
    if (!fs.existsSync(file)) return null;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.caseId !== caseId || !['creating','ready','moving'].includes(value.phase)) throw Error('案件聊天紀錄無法確認');
    return value;
  }
  reserve(caseId, projectId, workRoot) {
    if (!validThread(projectId)) throw Error('無效的專案識別');
    const file = this.file(caseId);
    const value = {caseId, projectId, ...(workRoot?{workRoot}:{}), phase:'creating', operationId:crypto.randomUUID()};
    try { fs.writeFileSync(file, JSON.stringify(value), {flag:'wx', mode:0o600}); }
    catch (error) { if (error.code === 'EEXIST') return null; throw error; }
    return value;
  }
  finish(caseId, operationId, threadId) {
    const prior = this.read(caseId);
    if (!prior || prior.phase !== 'creating' || prior.operationId !== operationId || !validThread(threadId)) throw Error('案件聊天建立結果不符');
    const value = {...prior, phase:'ready', threadId};
    this.replace(caseId, value);
    return value;
  }
  replace(caseId, value) {
    const file = this.file(caseId), temporary = file + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value), {flag:'wx', mode:0o600});
    fs.renameSync(temporary, file);
  }
  beginMove(caseId, projectId) {
    const prior = this.read(caseId);
    if (!prior || prior.phase !== 'ready' || !validThread(prior.threadId) || !validThread(projectId)) throw Error('案件聊天狀態無法確認');
    const value = {...prior, phase:'moving', targetProjectId:projectId, operationId:crypto.randomUUID()};
    this.replace(caseId, value);
    return value;
  }
  finishMove(caseId, operationId) {
    const prior = this.read(caseId);
    if (!prior || prior.phase !== 'moving' || prior.operationId !== operationId) throw Error('案件聊天移動結果不符');
    const {targetProjectId, ...rest} = prior;
    const value = {...rest, phase:'ready', projectId:targetProjectId};
    this.replace(caseId, value);
    return value;
  }
  cancelMove(caseId, operationId) {
    const prior = this.read(caseId);
    if (!prior || prior.phase !== 'moving' || prior.operationId !== operationId) throw Error('案件聊天移動狀態不符');
    const {targetProjectId, ...rest} = prior;
    this.replace(caseId, {...rest, phase:'ready'});
  }
  releaseUnstarted(caseId, operationId) {
    const prior = this.read(caseId);
    if (prior?.phase === 'creating' && prior.operationId === operationId) fs.unlinkSync(this.file(caseId));
  }
}

async function getOrCreateCaseChat({registry, caseId, projectId, workRoot, check, create, move}) {
  if (!validCase(caseId) || !validThread(projectId)) throw Error('案件或專案識別無效');
  const before = await check();
  if (before.caseId !== caseId || before.projectId !== projectId || !before.valid) throw Error('案件已更新或專案不符');
  let saved = registry.read(caseId);
  if (saved) {
    if (saved.phase !== 'ready') throw Error('案件聊天建立結果未確認，請先查核');
    if (saved.projectId !== projectId) {
      if (typeof move !== 'function') throw Error('案件專案已變更，請先確認原聊天');
      const current = await check();
      if (current.caseId !== caseId || current.projectId !== projectId || !current.valid) throw Error('案件已更新，停止移動聊天');
      const moving = registry.beginMove(caseId, projectId);
      // As with creation, an unknown move must be checked before retrying.
      let result;
      try {result = await move({caseId, threadId:moving.threadId, projectId, operationId:moving.operationId});}
      catch(error) {if(error.code==='confirmation_required') registry.cancelMove(caseId,moving.operationId);throw error;}
      if (!result || result.threadId !== moving.threadId || result.projectId !== projectId) throw Error('案件聊天移動結果未確認，請先查核');
      return registry.finishMove(caseId, moving.operationId);
    }
    return saved;
  }
  const reservation = registry.reserve(caseId, projectId, workRoot);
  if (!reservation) throw Error('案件聊天正在建立或結果未確認');
  // Do not repeat a call after a timeout, ambiguous response, queued creation,
  // or process crash. Recovery must locate the original chat first.
  try {
    const current = await check();
    if (current.caseId !== caseId || current.projectId !== projectId || !current.valid) throw Error('案件已更新，停止建立聊天');
  } catch (error) {
    // The desktop has not been called, so releasing this reservation is safe.
    registry.releaseUnstarted(caseId, reservation.operationId);
    throw error;
  }
  const result = await create({caseId, projectId, operationId:reservation.operationId});
  if (!result || !validThread(result.threadId)) throw Error('案件聊天建立結果未確認，請先查核');
  return registry.finish(caseId, reservation.operationId, result.threadId);
}

module.exports = {CaseChatRegistry, getOrCreateCaseChat};

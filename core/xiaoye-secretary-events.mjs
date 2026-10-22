// Only explicit business events create work. No timer scans the issue list.
import {recoveryDetails,recoveryCard,recoveryNextStep} from './xiaoye-recovery.mjs';
export const XIAOYE_EVENT_CONTRACT = 'xiaoye-event-push-v1';
const respond = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});
const eventKey = id => 'event:' + id;
const activeStates = new Set(['prepared','ready','running']);
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
const waitMs = kind => kind === 'analyze' ? 5000 : 1000;

export function eventStub(env) {
  return env.XIAOYE_EVENTS?.get(env.XIAOYE_EVENTS.idFromName('original-oa-secretary'));
}
export async function eventCall(env, route, value = {}) {
  const stub = eventStub(env);
  if (!stub) throw new Error('Event service unavailable');
  return stub.fetch(new Request('https://secretary.internal/' + route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value)}));
}
export async function prepareXiaoyeEvent(env, task, operationId, action) {
  if (!env.XIAOYE_EVENTS) return null;
  const kind = action === 'approve' ? 'execute' : ['intake','supplement','reopen','feedback','resume'].includes(action) ? 'analyze' : ['withdraw','pause','confirm'].includes(action) ? 'invalidate' : null;
  if (!kind) return null;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(operationId)));
  const id = [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  const event = {id, taskId:task.id, version:task.version, sourceVersion:task.secretary.sourceVersion, kind, createdAt:Date.now()};
  // Prepare before the D1 commit. Dispatch requires the same transaction's outbox row.
  // A crash on either side cannot create phantom work or lose a committed pointer.
  const r = await eventCall(env, 'prepare', event);
  if (!r.ok) throw new Error('Event persistence unavailable');
  return event;
}

export class XiaoyeEvents {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try { return await this.route(request); }
      catch { return respond({ok:false,error:'事件處理暫時無法完成，原案件保留。'},503); }
    });
  }
  async entries() {
    const result=[];let startAfter;
    for(;;){const page=await this.ctx.storage.list({prefix:'pending:',limit:256,...startAfter?{startAfter}:{}});result.push(...page.values());if(page.size<256)return result;startAfter=[...page.keys()].at(-1);}
  }
  send(value) {
    for (const ws of this.ctx.getWebSockets()) try { ws.send(JSON.stringify(value)); } catch {}
  }
  async task(id) {
    const row = await this.env.DB.prepare('SELECT value FROM work_items WHERE id=?').bind(id).first();
    return row ? JSON.parse(row.value) : null;
  }
  applicable(e, t) {
    const s = t?.secretary;
    if (!s || s.sourceWithdrawn || t.deletedAt || t.mergedInto || s.sourceVersion !== e.sourceVersion) return false;
    if (e.kind === 'analyze') return s.stage === 'clarifying' && !s.waitingForReporter && t.version === e.version;
    return e.kind === 'execute' && s.stage === 'approved' && t.version === e.version && s.approval && s.proposal && s.approval.hash === s.proposal.hash && s.approval.sourceVersion === s.sourceVersion;
  }
  runningValid(e, t) {
    const s = t?.secretary;
    if (!s || s.sourceWithdrawn || s.sourceVersion !== e.sourceVersion || ['paused','closed'].includes(s.stage)) return false;
    if (e.kind === 'analyze') return ['clarifying','awaiting_approval'].includes(s.stage);
    return ['approved','executing','awaiting_confirmation','blocked'].includes(s.stage) && s.approval?.hash === e.approvalHash;
  }
  async save(e) {
    await this.ctx.storage.transaction(async storage=>{
      const previous=await storage.get(eventKey(e.id)),counts=await storage.get('counts')||{};
      if(previous?.state!==e.state){if(previous)counts[previous.state]=Math.max(0,(counts[previous.state]||0)-1);counts[e.state]=(counts[e.state]||0)+1;}
      await storage.put({[eventKey(e.id)]:e,counts});
      if(activeStates.has(e.state))await storage.put('pending:'+e.id,e);else await storage.delete('pending:'+e.id);
    });
  }
  async reschedule() {
    const now = Date.now(), entries = await this.entries();
    const deadlines = entries.flatMap(e => e.state === 'prepared' ? [e.checkAt] : e.state === 'ready' && e.readyAt > now ? [e.readyAt] : e.state === 'running' ? [e.leaseUntil] : []);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(now + 50, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  async notice(e, reason, nextStep=recoveryNextStep) {
    const row = await this.env.DB.prepare("SELECT value FROM documents WHERE namespace='xiaoye-secretary' AND key='config'").first();
    const c = row && JSON.parse(row.value);
    if (!c) return;
    const id = 'event-blocked:' + e.id, url = new URL('/xiaoye?issue='+encodeURIComponent(e.taskId), this.env.PUBLIC_ORIGIN).href;
    if(await this.env.DB.prepare("SELECT key FROM documents WHERE namespace='xiaoye-notifications' AND key=?").bind(id).first())return;
    const rowTask=await this.env.DB.prepare('SELECT value,revision FROM work_items WHERE id=?').bind(e.taskId).first(),t=rowTask&&JSON.parse(rowTask.value),s=t?.secretary;
    if(!s||s.sourceVersion!==e.sourceVersion||s.sourceWithdrawn||!['clarifying','approved','executing','blocked'].includes(s.stage))return;
    const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
    const at=new Date().toISOString(),extra=[];
    if(s.stage!=='blocked'){
      s.stage='blocked';s.blocker=String(reason).slice(0,1500);s.recovery=recoveryDetails(reason,nextStep,await digest(id));s.lease=null;s.leaseUntil=0;t.status='blocked';t.version++;t.updatedAt=at;t.history=[...(t.history||[]),{id,kind:'xiaoye_event_failed',actor:{account:'ai-xiaoye',name:'葉小蝸'},at,text:s.recovery.reason+'\n下一步：'+s.recovery.nextStep,mentions:[],targets:[]}];
      extra.push(this.env.DB.prepare('INSERT INTO xiaoye_operations(id,guard,fingerprint,task_id) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_items WHERE id=? AND revision=?) THEN 1 ELSE 0 END,?,?)').bind(id,t.id,rowTask.revision,await digest(id),t.id),this.env.DB.prepare('UPDATE work_items SET value=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(t),t.version,t.id,rowTask.revision),this.env.DB.prepare('INSERT INTO work_notion_jobs(id,version) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').bind(t.id,t.version));
    }
    const message='葉小蝸處理受阻：'+t.title+'\n原因：'+(s.recovery?.reason||reason)+'\n下一步：'+(s.recovery?.nextStep||nextStep)+'\n'+url;
    const n={id,taskId:e.taskId,account:c.ownerAccount,kind:'event-blocked',message,lineMessage:recoveryCard(this.env.PUBLIC_ORIGIN,t),sourceVersion:s.sourceVersion,proposalHash:s.proposal?.hash||null,expectedUserId:null,state:'pending',attempts:0,leaseUntil:0,createdAt:Date.now()};
    const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10),entry={id,workId:e.taskId,title:t.title,action:'event_failed',text:message,at,stage:s.stage};
    await this.env.DB.batch([
      ...extra,
      this.env.DB.prepare("INSERT OR IGNORE INTO documents(namespace,key,value,revision) VALUES('xiaoye-notifications',?,?,1)").bind(id,JSON.stringify(n)),
      this.env.DB.prepare("INSERT INTO documents(namespace,key,value,revision) VALUES('xiaoye-work-journal',?,json_object('date',?,'account','ai-xiaoye','entries',json_array(json(?))),1) ON CONFLICT(namespace,key) DO UPDATE SET value=json_insert(documents.value,'$.entries[#]',json(?)),revision=documents.revision+1").bind(date,date,JSON.stringify(entry),JSON.stringify(entry))
    ]);
  }
  async pump() {
    const now = Date.now();
    for (const e of await this.entries()) {
      if (e.state === 'prepared') {
        const row = await this.env.DB.prepare('SELECT id FROM xiaoye_event_outbox WHERE id=?').bind(e.id).first();
        if (row) { e.state = e.kind === 'invalidate' ? 'done' : 'ready'; e.readyAt = Math.max(e.readyAt, now); }
        else if(e.checkAt<=now){if (++e.checks >= 6) e.state = 'aborted';else e.checkAt = now + Math.min(30000, 500 * 2 ** e.checks);}
        await this.save(e);
      }
      if (e.state === 'running') {
        const t = await this.task(e.taskId);
        if (!this.runningValid(e,t)) { e.state='superseded'; this.send({type:'invalidate',id:e.id}); await this.save(e); }
        else if (e.leaseUntil <= now) { e.state='failed'; await this.notice(e,'處理租期已到，未自動重做；請先查核是否已有動作。'); await this.save(e); this.send({type:'invalidate',id:e.id}); }
      }
      if (e.state === 'ready') {
        const t = await this.task(e.taskId);
        if (!this.applicable(e,t)) { e.state='superseded'; await this.save(e); }
      }
    }
    const entries = await this.entries(), running = entries.some(e=>e.state==='running');
    if (!running) {
      const next = entries.filter(e=>e.state==='ready'&&e.readyAt<=now).sort((a,b)=>a.createdAt-b.createdAt)[0];
      if (next) this.send({type:'work',id:next.id});
    }
    await this.reschedule();
  }
  async route(request) {
    const route = new URL(request.url).pathname;
    if (route === '/socket') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return respond({ok:false},426);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
      await this.pump();
      pair[1].send(JSON.stringify({type:'connected',contract:XIAOYE_EVENT_CONTRACT}));
      return new Response(null,{status:101,webSocket:pair[0]});
    }
    const v = await request.json();
    if (route === '/status') {
      const counts=await this.ctx.storage.get('counts')||{};
      return respond({ok:true,contract:XIAOYE_EVENT_CONTRACT,connected:this.ctx.getWebSockets().length,states:Object.fromEntries(['prepared','ready','running','done','superseded','failed'].map(s=>[s,counts[s]||0])),alarmScheduled:(await this.ctx.storage.getAlarm())!==null});
    }
    if (!validId(v.id)) return respond({ok:false,error:'事件識別無效。'},400);
    let e = await this.ctx.storage.get(eventKey(v.id));
    if (route === '/prepare') {
      if (!/^work-[a-f0-9-]{36}$/.test(v.taskId||'') || !Number.isSafeInteger(v.version) || !['analyze','execute','invalidate'].includes(v.kind)) return respond({ok:false},400);
      if (e && ['taskId','version','sourceVersion','kind'].some(k=>e[k]!==v[k])) return respond({ok:false},409);
      if (!e || e.state==='aborted') {
        e = {...v,state:'prepared',checks:0,checkAt:Date.now()+1000,readyAt:Date.now()+waitMs(v.kind)};
        await this.save(e); await this.reschedule();
      }
      return respond({ok:true});
    }
    if (!e) return respond({ok:false,error:'找不到事件。'},404);
    if (route === '/failed-proof') {
      const t=await this.task(e.taskId);
      return respond({ok:true,recoverable:e.state==='failed'&&e.taskId===v.taskId&&e.version===v.version&&e.sourceVersion===v.sourceVersion&&t?.version===v.version&&t.secretary?.stage==='approved'&&!t.secretary.lease&&t.secretary.sourceVersion===v.sourceVersion});
    }
    if (route === '/commit') { await this.pump(); return respond({ok:true}); }
    if (route === '/acquire') {
      await this.pump(); e = await this.ctx.storage.get(eventKey(v.id));
      if (typeof v.operationId!=='string'||v.operationId.length<8||v.operationId.length>180) return respond({ok:false},400);
      if (e.state==='running'&&e.acquireOperation===v.operationId&&e.leaseUntil>Date.now()) return respond({ok:true,job:e,replayed:true});
      if (e.state !== 'ready' || e.readyAt > Date.now() || (await this.entries()).some(x=>x.state==='running')) return respond({ok:true,job:null});
      const t = await this.task(e.taskId);
      if (!this.applicable(e,t)) return respond({ok:true,job:null});
      e.state='running'; e.acquireOperation=v.operationId; e.lease=crypto.randomUUID(); e.leaseUntil=Date.now()+28*60000; e.approvalHash=t.secretary.approval?.hash||null;
      await this.save(e); await this.reschedule(); return respond({ok:true,job:e});
    }
    if (route === '/check' || route === '/complete' || route === '/fail') {
      if(route!=='/check'&&e.completionOperation===v.operationId&&['done','failed'].includes(e.state))return respond({ok:true,state:e.state,replayed:true});
      if (e.state !== 'running' || e.lease !== v.lease || e.leaseUntil <= Date.now()) return respond({ok:false,error:'事件執行確認已失效。'},409);
      const t = await this.task(e.taskId);
      if (!this.runningValid(e,t)) { e.state='superseded'; await this.save(e); this.send({type:'invalidate',id:e.id}); await this.pump(); return respond({ok:false,error:'案件已有新版本，請停止。'},409); }
      if (route === '/check') return respond({ok:true,job:e});
      const completed = e.kind === 'analyze' ? t.secretary.stage==='awaiting_approval'||t.secretary.waitingForReporter : ['awaiting_confirmation','blocked'].includes(t.secretary.stage);
      e.state = route === '/complete' && completed ? 'done' : 'failed'; e.finishedAt=Date.now(); e.completionOperation=v.operationId;
      if (e.state === 'failed') await this.notice(e,typeof v.reason==='string'?v.reason.slice(0,1500):'自動處理未取得完整完成證據，已停止；需先查核已有動作。',typeof v.nextStep==='string'?v.nextStep.slice(0,500):recoveryNextStep);
      await this.save(e);
      await this.pump(); return respond({ok:true,state:e.state});
    }
    return respond({ok:false},404);
  }
  async alarm() { return this.ctx.blockConcurrencyWhile(()=>this.pump()); }
  async webSocketMessage(ws, message) { if (message==='ready') await this.ctx.blockConcurrencyWhile(()=>this.pump()); }
  async webSocketClose(ws, code, reason, wasClean) { try{ws.close(code===1006?1011:code, 'Disconnected');}catch{} }
  async webSocketError(ws) { try{ws.close(1011,'Connection error');}catch{} }
}

import assert from 'node:assert/strict';
import * as portalCommandEntry from '../core/portal-command-entry.js';
import * as workJournalEntry from '../core/work-journal-entry.js';
import * as usageGuideEntry from '../core/usage-guide-entry.js';
import * as uofSetupEntry from '../core/uof-setup-entry.js';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as directLine from '../core/direct-line.js';
import * as leafCalendar from '../core/leaf-calendar/index.js';
import * as leafTasks from '../core/leaf-tasks.js';

const source = { type: 'user', userId: 'synthetic-private-user' };
const privateEvents = [
  ...['你好', '待簽', '我的身分', '新增待辦 明天回覆', '我的今天', '請款', '請提供這個檔案給我'].map((text, i) => ({
    type: 'message', source, replyToken: `synthetic-${i}`, message: { id: `synthetic-${i}`, type: 'text', text },
  })),
  ...['image', 'file', 'audio', 'video'].map(type => ({ type: 'message', source, message: { type, id: `synthetic-${type}` } })),
  { type: 'postback', source, replyToken: 'synthetic-button', postback: { data: 'synthetic-action' } },
  { type: 'follow', source, replyToken: 'synthetic-follow' },
  { type: 'unfollow', source },
];
const forbidden = () => { throw new Error('paused private event must not reach a handler, lookup or reply'); };
assert.equal(directLine.PERSONAL_ASSISTANT_ENABLED, false);
for (const event of privateEvents) {
  assert.deepEqual(await directLine.routeDirectLineEvent({
    event, router: { resolveDirectBinding: forbidden, resolveDirectAttachmentBinding: forbidden },
    dispatcher: { dispatchDirectMessage: forbidden, dispatchDirectPostback: forbidden }, replyLineMessage: forbidden,
  }), { matched: true, routed: false, handled: true, reason: 'paused' });
}
const group = { type: 'message', source: { type: 'group', groupId: 'synthetic-group', userId: source.userId }, message: { id: 'synthetic-group-message', type: 'text', text: '群組訊息' } };
const room = { ...group, source: { type: 'room', roomId: 'synthetic-room', userId: source.userId } };
const transport = { type: 'message', source, message: { id: 'synthetic-owned-uof', type: 'text', text: '待簽' } };
for (const event of [group, room]) {
  assert.equal(directLine.isPausedDirectEvent(event), false);
  assert.deepEqual(await directLine.routeDirectLineEvent({ event }), { matched: false });
}

// Real server handler: pause before transport intake, finance, attachments and dispatch.
let handler;
const passed = { io: [], bank: [], archive: [], retrieval: [], dispatch: [] };
const calls = { io: 0, bank: 0, archive: 0, retrieval: 0, dispatch: 0 };
const logger = { log() {}, warn() {}, error(message) { throw new Error(message); } };
const tenant = { key: 'synthetic', modules: [], runtimeEnabled: true, dataSources: {} };
const router = { resolveGroupBinding: async () => ({ tenant, binding: { status: '啟用' } }) };
const platform = {
  attachmentArchive: {
    contract: 'synthetic', health: () => ({}), setTransportResolver() {},
    capture: async events => { calls.archive++; passed.archive.push(...events); return []; },
  },
};
const secret = 'synthetic-signature-secret';
const journalReads = [], journalReplies = [], journalEntries=[];
const sign = raw => crypto.createHmac('sha256', secret).update(raw).digest('base64');
const centralCaptured=[];let failCentralIntake=false, failUofNavigation=false;
const dependencies = {
  './core/usage-guide-entry.js': usageGuideEntry,
  './modules/meetings/conversation-service.js':{createConversationMeetings:()=>({enabled:false,capture:async()=>[],drain:async()=>{},handle:async()=>false,health:()=>({enabled:false})})},
  './core/central-archive/index.js': { createCentralArchive: async () => ({capture:async events=>{
    if(failCentralIntake)throw Error('synthetic_archive_outage');centralCaptured.push(...events);},health:()=>({enabled:true})}) },
  'node:http': { default: { createServer(fn) { handler = fn; return { listen() {} }; } } },
  'node:crypto': { default: crypto },
  './core/bootstrap.js': { bootstrap: async () => ({
    tenants: [tenant], line: { configured: true, isValidSignature: (raw, signature) => signature === sign(raw), replyLineMessage: forbidden,
      lineGet: async path => { journalReads.push(path);return path.startsWith('/v2/bot/user/') ? { richMenuId: 'richmenu-' + 'a'.repeat(32) } : { areas: [{ action: { type: 'uri', label: '工作日誌', uri: 'https://journal.example.com/?openExternalBrowser=1' } }] }; },
      replyLineMessages: async (token, messages) => journalReplies.push({ token, messages }),
    },
    router, dispatcher: { collectRoutes: () => [], dispatchMessage: async ({ event }) => { calls.dispatch++; passed.dispatch.push(event); } },
    portal: {}, modules: new Map(), platform, llm: { available: false, backends: [] }, logger,
  }) },
  './core/line-io/index.js': { createLineIo: async () => ({
    enabled: false, owns: event => event.message?.id === transport.message.id, handle: async () => false, capture: async events => { calls.io++; passed.io.push(...events); },
    bindingsEnabled: true, uofSetupEvents: async events => { if (failUofNavigation) throw Error('fixture_binding_outage');return events.filter(event => event.webhookEventId === 'fixture-unbound'); },
  }), readLineIoBody: async req => req.rawBody },
  './core/bank-line-reply-intake.js': { createBankLineReplyIntake: () => ({
    receive: async event => { calls.bank++; passed.bank.push(event); return false; }, drain: async () => {},
  }) },
  './core/attachment-retrieval.js': { createAttachmentRetrieval: () => ({
    deliveryReady: () => false,
    contract: 'synthetic', handle: async event => { calls.retrieval++; passed.retrieval.push(event); return false; },
  }), parseAttachmentRequest: () => null },
  './core/portal-command-entry.js': portalCommandEntry,
  './core/work-journal-entry.js': workJournalEntry,
  './core/uof-setup-entry.js': uofSetupEntry,
  './core/direct-line.js': directLine,
  './core/leaf-calendar/index.js': leafCalendar,
  './core/leaf-groups.js':{createLeafGroups:()=>({capture:async()=>[],isControl:()=>false,drain:async()=>{},health:()=>({})})},
      './core/leaf-tasks.js': {...leafTasks,createLeafTasks:options=>({...leafTasks.createLeafTasks(options),loginEntry:async(event,action)=>{assert.equal(event.source.type,'user');assert.equal(action.uri,'https://journal.example.com/?openExternalBrowser=1');journalEntries.push(event);return {type:'uri',label:'開啟工作日誌',uri:'https://journal.example.com/line-login?ticket=synthetic-private-entry&openExternalBrowser=1'};}})},
  './core/access-directory.js': { createAccessDirectory: () => ({}) },
  './core/portal-handoff.js': { safePortalHandoffLocation: () => '/' },
  './core/util.js': { readBody: async req => req.rawBody, sendJson: (res, status, body) => { res.status = status; res.body = body; }, sendText: (res, status) => { res.status = status; } },
  './core/group-onboarding.js': Object.fromEntries(['GROUP_ONBOARDING_BUILD', 'deliverGroupOnboardingReply', 'groupOnboardingProperties',
    'groupOnboardingRepairProperties', 'groupOnboardingSuccessMessage', 'parseGroupOnboardingCommand',
    'supportedGroupOnboardingExamples', 'withResolvedGroupName'].map(key => [key, () => ({ isCommand: false })])),
};
const context = vm.createContext({ URL, Buffer, console, process: { env: {AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID:"U"+"2".repeat(32)} }, setInterval: () => ({ unref() {} }) });
const module = new vm.SourceTextModule(await fs.readFile(new URL('../server.js', import.meta.url), 'utf8'), { context });
await module.link(name => new vm.SyntheticModule(Object.keys(dependencies[name]), function () {
  for (const [key, value] of Object.entries(dependencies[name])) this.setExport(key, value);
}, { context }));
await module.evaluate();
async function webhook(events, valid = true) {
  const rawBody = JSON.stringify({ events });
  const res = {};
  await handler({ method: 'POST', url: '/webhook/line', rawBody, headers: { 'x-line-signature': valid ? sign(rawBody) : 'invalid' } }, res);
  await new Promise(resolve => setImmediate(resolve));
  return res;
}
assert.equal((await webhook(privateEvents, false)).status, 401);
assert.equal(centralCaptured.length,0,'Unsigned events never reach central persistence');
assert.equal((await webhook(privateEvents)).status, 200);
assert.deepEqual(JSON.parse(JSON.stringify(centralCaptured)),privateEvents,'Central persistence precedes assistant pause');
for (const events of Object.values(passed)) assert.deepEqual(events, []);
assert.ok(Object.values(calls).every(count => count === 0), 'private-only requests must bypass the entire processing pipeline');
assert.equal((await webhook([...privateEvents, group, room, transport])).status, 200);
for (const [kind, events] of Object.entries(passed)) {
  const expected = ['io', 'archive', 'retrieval'].includes(kind) ? [group, room, transport] : [group, room];
  assert.deepEqual(JSON.parse(JSON.stringify(events)), expected);
}
const health = {};
await handler({ method: 'GET', url: '/health' }, health);
assert.equal(health.body.personalAssistant.enabled, false);
assert.equal(health.body.personalAssistant.contract, 'private-assistant-pause-v1');
assert.equal(health.body.workJournalEntry.contract, 'line-work-journal-rich-menu-entry-v1');
const journal = { type: 'message', source: { type: 'user', userId: 'U' + '1'.repeat(32) }, replyToken: 'synthetic-journal', message: { id: 'synthetic-journal', type: 'text', text: '工作日誌' } };
assert.equal((await webhook([journal], false)).status, 401);
assert.equal(journalReads.length, 0);
assert.equal((await webhook([journal])).status, 200);
assert.equal(journalReplies.length, 1);
assert.equal(journalEntries.length,1);
assert.equal(journalReplies[0].messages[0].template.actions[0].uri, 'https://journal.example.com/line-login?ticket=synthetic-private-entry&openExternalBrowser=1');
const previous = Object.fromEntries(Object.entries(passed).map(([key, events]) => [key, events.length]));
assert.equal((await webhook([journal, transport])).status, 200);
for (const [key, events] of Object.entries(passed)) assert.equal(events.length, previous[key] + (['io', 'archive', 'retrieval'].includes(key) ? 1 : 0), 'Navigation bypasses ' + key + '; mixed UOF transport still runs');
assert.equal(journalReplies.length, 2);
const postback={...journal,type:'postback',postback:{data:'dailylog.open:'+encodeURIComponent('https://journal.example.com/?openExternalBrowser=1')}};
assert.equal((await webhook([postback],false)).status,401);assert.equal(journalEntries.length,2);
assert.equal((await webhook([postback])).status,200);assert.equal(journalEntries.length,3);
assert.equal(journalReplies.length,3,'Private menu postback stays available while general assistant remains paused');
const centralCount=centralCaptured.length;
const setup = { ...journal, webhookEventId: 'fixture-unbound', replyToken: 'fixture-setup', message: { type: 'text', text: '待簽' } };
const beforeSetup = Object.fromEntries(Object.entries(passed).map(([key, events]) => [key, events.length]));
assert.equal((await webhook([setup], false)).status, 401);
assert.equal(journalReplies.length, 3);
failUofNavigation = true;
assert.equal((await webhook([setup])).status, 503);
assert.equal(journalReplies.length, 3);
failUofNavigation = false;
assert.equal((await webhook([setup])).status, 200);
assert.equal(journalReplies.length, 4);
assert.equal(journalReplies.at(-1).messages[0].template.actions[0].uri, 'https://uof-line.ghotel.tw/Line/Setup?openExternalBrowser=1');
assert.equal((await webhook([setup, transport])).status, 200);
assert.equal(journalReplies.length, 4, 'Redelivery cannot send a second setup reply');
for (const [key, events] of Object.entries(passed)) assert.equal(events.length, beforeSetup[key] + (['io', 'archive', 'retrieval'].includes(key) ? 1 : 0));
failCentralIntake=true;
assert.equal((await webhook([group])).status,503,'An archive outage must not acknowledge and lose the source');
assert.equal(centralCaptured.length,centralCount + 4);
console.log('Private assistant pause verified: private events bypass intake, lookup, dispatch and reply; groups/rooms and explicitly owned independent transport retained; live health exposes pause.');

// Public portal navigation bypasses business handlers after signature validation.
failCentralIntake=false;
for(const text of ['UOF','會議']){
 for(const source of [journal.source,{type:'group',userId:journal.source.userId,groupId:'C'+'2'.repeat(32)},{type:'room',userId:journal.source.userId,roomId:'R'+'3'.repeat(32)}]){
 const before=Object.fromEntries(Object.entries(passed).map(([k,v])=>[k,v.length]));
 const ev={...journal,source,message:{...journal.message,text},replyToken:'portal-'+text};
 const replyCount=journalReplies.length;
 assert.equal((await webhook([ev],false)).status,401);assert.equal(journalReplies.length,replyCount);
 assert.equal((await webhook([ev])).status,200);assert.equal(journalReplies.length,replyCount+1);
 for(const [k,v] of Object.entries(passed))assert.equal(v.length,before[k]);
 }
}
failCentralIntake=false;
const guide={...journal,message:{type:'text',text:'使用說明'}};
const helpBefore=Object.fromEntries(Object.entries(passed).map(([key,events])=>[key,events.length]));
const repliesBefore=journalReplies.length;
assert.equal((await webhook([guide],false)).status,401);assert.equal(journalReplies.length,repliesBefore);
assert.equal((await webhook([guide])).status,200);assert.equal(journalReplies.length,repliesBefore+1);
assert(journalReplies.at(-1).messages[0].text.includes(usageGuideEntry.USAGE_GUIDE_URL));
for(const [key,events]of Object.entries(passed))assert.equal(events.length,helpBefore[key],'Help bypasses '+key);
assert.equal((await webhook([guide,transport])).status,200);assert.equal(journalReplies.length,repliesBefore+2);
assert.equal(health.body.usageGuideEntry.contract,usageGuideEntry.USAGE_GUIDE_CONTRACT);
console.log('Signed private help navigation works during pause and mixed transport remains independent.');

const groupGuide={...guide,source:{type:'group',userId:'U'+'1'.repeat(32),groupId:'C'+'3'.repeat(32)},message:{type:'text',text:'@葉小蝸 使用說明',mention:{mentionees:[{type:'user',isSelf:true,userId:'U'+'2'.repeat(32),index:0,length:4}]}}};
const groupHelpBefore=Object.fromEntries(Object.entries(passed).map(([key,events])=>[key,events.length]));
assert.equal((await webhook([groupGuide])).status,200);assert.equal(journalReplies.length,repliesBefore+3);
for(const [key,events]of Object.entries(passed))assert.equal(events.length,groupHelpBefore[key],'Group help bypasses '+key);
console.log('Signed native group mention also bypasses business classification and replies only to its source.');


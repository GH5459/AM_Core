import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {createContractConversationSource} from '../core/central-archive/contract-source.js';
import {captureSavedContractConversation} from '../modules/construction/contract-line-archive.js';
import {synchronizeContractGroup} from '../modules/construction/contract-group-sync.js';
const groupId='C'+'a'.repeat(32),binding='binding',parent='parent',source='source';
const rt=value=>({rich_text:[{plain_text:value}]}),time='2026-10-01T01:00:00.000Z';
const rows=[{id:'message1',properties:{'LINE 對話 ID':rt(groupId),'識別碼':rt('event1'),'LINE 訊息 ID':rt('123'),
  '時間':{date:{start:time}},'內容':rt('原始工程討論'),'發送者':rt('師傅'),'訊息類型':rt('text')}},
  {id:'message2',properties:{'LINE 對話 ID':rt(groupId),'識別碼':rt('join1'),'時間':{date:{start:time}},
    '內容':rt('{"replyToken":"MUST-NOT-LEAK"}'),'訊息類型':rt('join')}}];
let pending=0,wrong=false,pageCalls=0;
const reader=createContractConversationSource({botId:'bot',parentId:parent,
  pool:{async query(sql,args){if(sql.includes('conversations')){assert.deepEqual(args,['bot',groupId]);return {rows:[{key:'key',database_id:'db',data_source_id:source}]};}return {rows:[{count:pending}]};}},
  router:{async resolveGroupBinding(){return {tenant:{key:wrong?'other':'engineering'},binding:{pageId:binding,status:'啟用'}};}},
  notion:{async request(path,method,body){if(path.startsWith('/databases'))return {parent:{page_id:parent},data_sources:[{id:source}]};
    assert.equal(body.filter.and[0].rich_text.equals,groupId);pageCalls++;
    return pageCalls%2?{results:[rows[0]],has_more:true,next_cursor:'next'}:{results:[rows[1]],has_more:false};}}});
const input={tenantKey:'engineering',groupBindingId:binding,lineGroupId:groupId,endedAt:'2026-10-28T02:00:00.000Z'};
const messages=await reader(input);assert.equal(messages.length,2);assert.equal(messages[0].content,'原始工程討論');
assert.ok(!JSON.stringify(messages).includes('MUST-NOT-LEAK'));
wrong=true;await assert.rejects(()=>reader(input));wrong=false;pending=1;await assert.rejects(()=>reader(input));pending=0;
await assert.rejects(()=>reader({...input,tenantKey:'forest'}));
let stored;
const pdf=await PDFDocument.create();pdf.addPage();const original=Buffer.from(await pdf.save());
const sha256=crypto.createHash('sha256').update(original).digest('hex');
const deps={driveRootFolderId:'root',driveConfigured:true,async ensureDriveFolder(){return 'folder';},
  async auditDrivePrivate(){return {private:true};},async downloadFromDrive(){return {buffer:original,mimeType:'application/pdf'};},
  async uploadToDrive(buffer,name){if(name.endsWith('LINE-對話封存.pdf'))stored=buffer;return {id:'saved-file'};},
  async loadCentralContractMessages(){return [{...messages[0],attachments:[{name:'報價.pdf',fileId:'original-file',sha256}]}];},
  contractStore:{async listLineConversationArchives(){return [];},async createLineConversationArchive(_tenant,input){return {
    id:'archive',version_no:1,source_manifest:input.sourceManifest,message_count:input.messageCount,pdf_sha256:input.pdfSha256,
    ...input};}}};
const archive=await captureSavedContractConversation(deps,{context:{tenant:{key:'engineering'},actor:'owner'},
  contract:{id:'contract',contractNumber:'TEST-CT-001',projectCode:'TEST'},version:{id:'version',versionNo:1},
  group:{groupBindingId:binding,lineGroupId:groupId,groupName:'測試群組'},endedAt:input.endedAt});
assert.equal(archive.messageCount,1);assert.equal(archive.originals[0].name,'報價.pdf');
assert.ok((await PDFDocument.load(stored)).getPageCount()>=2);
deps.loadCentralContractMessages=async()=>[{...messages[0],attachments:[{name:'缺少原檔',fileId:''}]}];
await assert.rejects(()=>captureSavedContractConversation(deps,{context:{tenant:{key:'engineering'}},contract:{id:'c'},
  group:{groupBindingId:binding,lineGroupId:groupId},endedAt:input.endedAt}));
// A group repair copies only the authoritative relation and preserves contract metadata.
let synced;
const contract={id:'c',projectId:'p',projectCode:'P',notionContractPageId:'notion',title:'Test',amount:100,
  trade:'trade',counterpartyName:'vendor',budget_item_notion_page_id:'budget'};
const store={async getContract(){return contract;},async listVersions(){return [];},async upsertContract(_t,input){synced=input;return {...contract,...input};}};
for(const name of ['listContracts','getVersion','createVersion','transitionVersion','freezeVersion'])store[name]=async()=>null;
const groupDeps={contractStore:store,dataSources:{contracts:'contracts',groupBindings:'groups'},
  async notionRequest(path){return path.endsWith('notion')?{parent:{data_source_id:'contracts'},properties:{'專案':{relation:[{id:'p'}]},'負責群組':{relation:[{id:binding}]}}}:
    {id:binding,parent:{data_source_id:'groups'},properties:{'專案':{relation:[{id:'p'}]},'狀態':{select:{name:'啟用'}},'LINE 群組 ID':rt(groupId)}};}};
await synchronizeContractGroup(groupDeps,{tenant:{key:'engineering'},actor:'owner',scope:null},{contractId:'c'});
assert.equal(synced.groupBindingId,binding);assert.equal(synced.amount,100);assert.equal(synced.budgetItemId,'budget');
console.log('Saved conversation: exact-group isolation, complete pagination, pending-source rejection, safe text, original PDF/hash preservation and group repair passed.');

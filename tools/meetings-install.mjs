// Project-local configuration and receipts stay outside the repository.
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {loadTenants} from '../core/tenants.js';
import {createArchiveNotion} from '../core/central-archive/notion.js';
import {resolveMeetingRolloutPolicy} from '../modules/meetings/policy.js';
import {keyFor} from '../modules/meetings/conversation-store.js';
import {createConversationMeetings} from '../modules/meetings/conversation-service.js';
const [phase,envPath,privateDir]=process.argv.slice(2);
if(!envPath||!privateDir||!path.isAbsolute(privateDir))throw Error('Usage: meetings-install.mjs inspect|migrate ENV_FILE ABSOLUTE_PRIVATE_DIR');
const env=parseEnv(fs.readFileSync(envPath,'utf8'));
const connection=new URL(env.AMCORE_MEETINGS_MIGRATION_DATABASE_URL||env.AMCORE_CENTRAL_ARCHIVE_DATABASE_URL||env.AMCORE_LINE_IO_DATABASE_URL);
if(!connection.hostname.includes('.'))connection.hostname=new URL(env.FOREST_AM_MEMORY_DATABASE_URL).hostname;
const url=connection.toString();
const pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:15000});
const notion=createArchiveNotion({token:env.NOTION_TOKEN});
const tenants=loadTenants(env,{warn:()=>{}});
const plain=(p,kind='rich_text')=>(p?.[kind]||[]).map(x=>x.plain_text||x.text?.content||'').join('');
const compact=s=>String(s||'').replaceAll('-','');
async function bindings(){const all=[];for(const tenant of tenants.filter(t=>t.runtimeEnabled!==false&&t.notionConfigured)){
  let cursor='';do{const data=await notion.request('/data_sources/'+tenant.dataSources.groupBindings+'/query','POST',{page_size:100,...cursor?{start_cursor:cursor}:{}});
    for(const p of data.results||[])all.push({tenantKey:tenant.key,pageId:p.id,sourceId:plain(p.properties['LINE 群組 ID']),name:plain(p.properties['群組名稱'],'title'),
      status:p.properties['狀態']?.select?.name||'',mode:p.properties['會議待辦模式']?.select?.name||'',
      capabilities:(p.properties['啟用功能']?.multi_select||[]).map(v=>v.name),meetingSource:plain(p.properties['會議資料庫']),properties:p.properties});
    cursor=data.has_more?data.next_cursor:'';
  }while(cursor);
}return all;}
try{
  const identity=(await pool.query("SELECT current_database() AS database,has_schema_privilege(current_user,'central_archive','CREATE') AS can_migrate")).rows[0];
  const conversations=(await pool.query('SELECT * FROM central_archive.conversations WHERE bot_id=$1',[env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID])).rows;
  const rows=await bindings();
  fs.mkdirSync(privateDir,{recursive:true});
  const inventoryPath=path.join(privateDir,fs.existsSync(path.join(privateDir,'inventory.private.json'))?'inventory.latest.private.json':'inventory.private.json');
  fs.writeFileSync(inventoryPath,JSON.stringify({at:new Date().toISOString(),identity,conversations,bindings:rows},null,2));
  console.log(JSON.stringify({phase,canMigrate:identity.can_migrate,conversations:conversations.length,types:conversations.reduce((a,r)=>(a[r.source_kind]=(a[r.source_kind]||0)+1,a),{}),bindings:rows.length,
    statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),meetingBindings:rows.filter(r=>r.meetingSource).length,tenantKeys:tenants.filter(t=>t.runtimeEnabled!==false).map(t=>t.key)}));
  if(phase==='plan'){
    const plan=[];
    for(const c of conversations.filter(c=>['user','group','room'].includes(c.source_kind))){
      const matches=rows.filter(r=>r.sourceId===c.source_id);if(matches.length>1)throw Error('ambiguous_conversation_tenant');
      const binding=matches[0],tenant=tenants.find(t=>t.key===binding?.tenantKey);
      const policy=binding?resolveMeetingRolloutPolicy({tenant,binding:{status:binding.status,capabilities:binding.capabilities,meetingMode:binding.mode}}):{enabled:false,effectiveMode:'record_only'};
      let existing=null;
      if(binding?.meetingSource){try{const ds=await notion.request('/data_sources/'+binding.meetingSource);existing={dataSource:ds.id,database:ds.parent.database_id};}
        catch{const db=await notion.request('/databases/'+binding.meetingSource);existing={dataSource:db.data_sources[0].id,database:db.id};}}
      if(existing){const db=await notion.request('/databases/'+existing.database);existing.parent=db.parent;existing.publicUrl=db.public_url;}
      plan.push({key:c.key,tenantKey:binding?.tenantKey||'',bindingPage:binding?.pageId,enabled:policy.enabled,todoMode:policy.enabled?policy.effectiveMode:'record_only',existing});
    }
    fs.writeFileSync(path.join(privateDir,'plan.private.json'),JSON.stringify(plan,null,2));
    console.log(JSON.stringify({planned:plan.length,enabled:plan.filter(x=>x.enabled).length,existingDatabases:plan.filter(x=>x.existing).length,uniqueDatabases:new Set(plan.filter(x=>x.existing).map(x=>x.existing.database)).size,bindingsMissingArchive:rows.filter(r=>!conversations.some(c=>c.source_id===r.sourceId)).length}));
  }else if(phase==='migrate'){
    const parent=env.AMCORE_MEETINGS_PARENT_PAGE_ID;if(!/^[a-f0-9-]{32,36}$/i.test(parent||''))throw Error('Parent must be deployment-local');
    const plan=JSON.parse(fs.readFileSync(path.join(privateDir,'plan.private.json'),'utf8'));
    const parentPage=await notion.request('/pages/'+parent);if(parentPage.archived||parentPage.in_trash)throw Error('Meeting parent unavailable');
    const declared=new Set(tenants.flatMap(t=>Object.values(t.dataSources)).filter(Boolean).map(compact));
    for(const item of plan.filter(p=>p.existing)){
      if(declared.has(compact(item.existing.dataSource)))throw Error('Cannot move a shared/default tenant data source');
      if(plan.filter(p=>p.existing?.database===item.existing.database).length!==1)throw Error('Cannot move a multi-conversation database');
    }
    await pool.query(fs.readFileSync(new URL('../modules/meetings/conversations.sql',import.meta.url),'utf8'));
    const service=createConversationMeetings({env:{...env,AMCORE_CONVERSATION_MEETINGS_ENABLED:'1'},archive:{pool,config:{botId:env.AMCORE_CENTRAL_ARCHIVE_BOT_USER_ID},notion},
      platform:{registerTenantDataSource:async()=>{}},tenants,meetingModule:{},router:{}});
    await service.store.seed();
    const receiptFile=path.join(privateDir,'migration.private.json');
    const receipt=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):{createdAt:new Date().toISOString(),databases:[],bindings:[],pagesBefore:{}};
    const save=()=>fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2));
    const ids=async ds=>{const all=[];let cursor='';do{const result=await notion.request('/data_sources/'+ds+'/query','POST',{page_size:100,...cursor?{start_cursor:cursor}:{}});all.push(...result.results.map(r=>r.id));cursor=result.has_more?result.next_cursor:'';}while(cursor);return all.sort();};
    for(const item of plan){
      const legacy=rows.find(r=>r.pageId===item.bindingPage);
      await pool.query(`UPDATE central_archive.meeting_settings SET enabled=$2,todo_mode=$3,tenant_key=$4,legacy_status=$5,updated_by='installation' WHERE conversation_key=$1 AND updated_by IN ('','installation')`,[item.key,item.enabled,item.todoMode,item.tenantKey,legacy?.status==='停用'?'停用':'啟用']);
      if(item.existing){
        const existing=item.existing;
        if(!receipt.pagesBefore[existing.database]){receipt.pagesBefore[existing.database]=await ids(existing.dataSource);save();}
        const before=await notion.request('/databases/'+existing.database);
        if(before.archived||before.in_trash)throw Error('Existing database unavailable');
        if(compact(before.parent.page_id)!==compact(parent))await notion.request('/databases/'+existing.database,'PATCH',{parent:{type:'page_id',page_id:parent}});
        const ds=await notion.request('/data_sources/'+existing.dataSource),extra={};
        for(const [name,type] of [['原始錄音名稱','rich_text'],['Google Drive 錄音','url'],['錄音保存狀態','rich_text'],['來源識別','rich_text']]){
          if(ds.properties[name]&&ds.properties[name].type!==type)throw Error('Existing recording field type differs');
          if(!ds.properties[name])extra[name]={[type]:{}};
        }
        if(Object.keys(extra).length)await notion.request('/data_sources/'+existing.dataSource,'PATCH',{properties:extra});
        await pool.query(`UPDATE central_archive.meeting_settings SET database_id=$2,data_source_id=$3,legacy_database_id=$2,legacy_data_source_id=$3 WHERE conversation_key=$1`,[item.key,existing.database,existing.dataSource]);
        const afterIds=await ids(existing.dataSource);if(JSON.stringify(afterIds)!==JSON.stringify(receipt.pagesBefore[existing.database]))throw Error('Meeting page identity changed during migration');
      }
      const target=await service.ensureDatabase(await service.store.get(item.key));
      const row=await service.store.get(item.key);
      if(!receipt.databases.some(d=>d.key===item.key))receipt.databases.push({key:item.key,database:row.database_id,dataSource:target.dbId,reused:Boolean(item.existing)});
      save();
    }
    for(const tenant of tenants.filter(t=>t.runtimeEnabled!==false&&t.notionConfigured)){
      const schema=await notion.request('/data_sources/'+tenant.dataSources.groupBindings);
      const properties={};for(const name of ['私人助理身分','對話輸出'])if(!schema.properties[name])properties[name]={select:{options:[{name:'啟用'},{name:'停用'}]}};
      if(Object.keys(properties).length)await notion.request('/data_sources/'+schema.id,'PATCH',{properties});
    }
    for(const binding of rows.filter(r=>r.status==='影子記錄')){
      if(receipt.bindings.includes(binding.pageId))continue;
      const fresh=await notion.request('/pages/'+binding.pageId);if(fresh.properties['狀態']?.select?.name!=='影子記錄')continue;
      await notion.request('/pages/'+binding.pageId,'PATCH',{properties:{'狀態':{select:{name:'啟用'}},'私人助理身分':{select:{name:'停用'}},'對話輸出':{select:{name:'停用'}},
        '啟用功能':{multi_select:binding.capabilities.filter(n=>!['待辦','案件狀態','提醒','請款'].includes(n)).map(name=>({name}))},
        '會議待辦模式':{select:{name:'僅記錄'}}}});
      receipt.bindings.push(binding.pageId);save();
    }
    receipt.completedAt=new Date().toISOString();receipt.status='Installed';save();
    console.log(JSON.stringify({migrated:true,databases:receipt.databases.length,reused:receipt.databases.filter(d=>d.reused).length,retainedExistingPages:Object.values(receipt.pagesBefore).reduce((n,p)=>n+p.length,0),normalizedStatuses:receipt.bindings.length,driveFilesMoved:0}));
  }else if(phase!=='inspect')throw Error('Unknown phase');
}finally{await pool.end();}

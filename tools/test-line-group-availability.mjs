import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineGroupAvailability} from '../core/line-group-availability.js';
import {__test as contracts} from '../modules/construction/contracts.js';
const group='C'+'a'.repeat(32),room='R'+'b'.repeat(32),row={source_kind:'group',source_id:group,connection_state:'active',legacy_status:'啟用'};
test('left, blocked and disabled groups cannot be listed, without touching history',async()=>{
 let calls=0;const options=createLineGroupAvailability(async()=>{calls++;return {groupId:group};});
 const rows=[row,{...row,connection_state:'left'},{...row,connection_state:'blocked'},{...row,legacy_status:'停用'}],before=structuredClone(rows);
 assert.deepEqual(await options.filter(rows),[row]);assert.equal(calls,1);assert.deepEqual(rows,before);
});
test('missing groups, temporary errors and wrong identities stay unselectable; recovery is fresh',async()=>{
 let mode='missing';const options=createLineGroupAvailability(async()=>{if(mode==='missing')throw Object.assign(Error('private'),{lineStatus:404});if(mode==='timeout')throw Error('timeout');return {groupId:mode==='wrong'?'C'+'c'.repeat(32):group};});
 for(mode of ['missing','timeout','wrong'])assert.equal(await options.available(row),false);
 mode='present';assert.equal(await options.available(row),true);
 assert.equal(await options.available({...row,connection_state:'left'}),false);
 assert.equal(await options.available({...row,connection_state:'active'}),true,'a new authoritative join can reappear');
});
test('new group and room require live confirmation; a meeting feature switch is independent',async()=>{
 const paths=[];const options=createLineGroupAvailability(async path=>{paths.push(path);return path.endsWith('/summary')?{groupId:group}:{count:2};});
 assert.equal(await options.available({...row,enabled:false}),true,'recording off does not retire a LINE group');
 assert.equal(await options.available({source_kind:'room',source_id:room}),true);
 assert.equal(await options.available({source_kind:'user',source_id:'private'}),true);
 assert.equal(await options.available({groupId:'malformed'}),false);
 assert.equal(paths.length,2);assert(paths.every(p=>!p.includes('/member/')),'member profile failure must not retire an entire group');
});
test('contract selector excludes dead options while existing contract group names remain',async()=>{
 const text=plain_text=>[{plain_text}],old='C'+'b'.repeat(32),missing='C'+'c'.repeat(32);
 const groups=[['active',group,'啟用'],['old',old,'停用'],['missing',missing,'啟用']].map(([id,g,status])=>({id,properties:{'LINE 群組 ID':{rich_text:text(g)},'群組名稱':{title:text(id)},'狀態':{select:{name:status}}}}));
 const deps={dataSources:{projects:'projects',contracts:'contracts',groupBindings:'groups'},lineGet:async path=>{if(path.includes(missing))throw Object.assign(Error('gone'),{lineStatus:404});return {groupId:path.split('/')[4]};},notionRequest:async path=>({has_more:false,results:path.includes('/projects/')?[{id:'project',properties:{'專案名稱':{title:text('project')}}}]:path.includes('/groups/')?groups:[{id:'contract',properties:{'負責群組':{relation:[{id:'old'}]}}}]})};
 const value=await contracts.buildOverview(deps,null);
 assert.deepEqual(value.projects[0].groups.map(g=>g.id),['active']);assert.equal(value.projects[0].rows[0].groupName,'old');
});

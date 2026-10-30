import assert from 'node:assert/strict';
import {currentGroupNames} from '../modules/meetings/group-names.js';

const group = n => 'C' + String(n).padStart(32, '0');
const rows = [
  {key:'renamed',source_kind:'group',source_id:group(1),connection_state:'active',display_name:'old'},
  {key:'failed',source_kind:'group',source_id:group(2),connection_state:'active',display_name:'saved'},
  {key:'wrong',source_kind:'group',source_id:group(3),connection_state:'active'},
  {key:'left',source_kind:'group',source_id:group(4),connection_state:'left'},
  {key:'private',source_kind:'user',source_id:'U'+'0'.repeat(32)},
];
const called=[];
const names=await currentGroupNames(rows,{async lineGet(path,options){
  called.push(path); assert.equal(options.timeoutMs,3000);
  if(path.includes(group(2))) throw Error('unavailable');
  if(path.includes(group(3))) return {groupId:group(4),groupName:'wrong group'};
  return {groupId:group(1),groupName:'new name'};
}});
assert.equal(names.get('renamed'),'new name');
assert.equal(names.has('failed'),false);
assert.equal(names.has('wrong'),false);
assert.equal(called.length,3);
assert.equal(rows[0].display_name,'old');
console.log('Group name resolution: passed');

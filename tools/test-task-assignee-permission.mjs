import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {patchWorker}=createRequire(import.meta.url)('../versions/AM-IMP-2026.1027.81/build.cjs');
const fixture=`
const contexts=new WeakMap();
const creator=t=>t.createdBy?.account;
const transferFormer=(t,key)=>(t.transferWatchers||[]).includes(key)&&![t.requester?.account,t.lead?.account,...(t.collaborators||[])].includes(key);
function taskCanEdit(t, account2, admin = false) {
  if(admin)return true;
  if(transferFormer(t,account2))return false;
  if(t.transferOriginalRequester&&t.history?.some(h=>h.kind==="transfer"&&h.transferScope!=="personal")&&[t.requester?.account,t.lead?.account].includes(account2))return true;
  const invited = contexts.get(t)?.invited || [];
  if (invited.includes(account2)) return creator(t) === account2;
  return [t.requester?.account, t.lead?.account, creator(t)].includes(account2);
}
function taskCanCreateChild(){return false;}
globalThis.check=(t,account,invited,admin=false)=>{contexts.set(t,{invited});return taskCanEdit(t,account,admin)};
`;
const task=()=>({requester:{account:'requester'},lead:{account:'assignee'},createdBy:{account:'creator'},collaborators:[]});
function runtime(source){const context={};vm.runInNewContext(source,context);return context.check;}
test('direct assignee retains editing and status permission when invited by a parent project',()=>{
 const t=task(),old=runtime(fixture),fixed=runtime(patchWorker(fixture));
 assert.equal(old(t,'assignee',['assignee']),false,'reproduces production failure');
 assert.equal(fixed(t,'assignee',['assignee']),true);
 assert.equal(fixed(t,'assignee',[]),true);
});
test('ordinary project collaborators and shared viewers cannot change somebody else\'s task',()=>{
 const check=runtime(patchWorker(fixture)),t=task();
 for(const person of ['collaborator','shared-viewer','stranger'])assert.equal(check(t,person,[person]),false);
 assert.equal(check(t,'creator',['creator']),true);
 assert.equal(check(t,'requester',[]),true);
 assert.equal(check(t,'requester',['requester']),false,'unrelated requester policy unchanged');
});
test('handover still removes the former assignee\'s rights and preserves the current assignee',()=>{
 const check=runtime(patchWorker(fixture)),t=task();t.transferWatchers=['former'];
 assert.equal(check(t,'former',['former']),false);
 assert.equal(check(t,'assignee',['assignee']),true);
 t.lead={account:'successor'};t.transferWatchers.push('assignee');
 assert.equal(check(t,'assignee',['assignee']),false);
 assert.equal(check(t,'successor',['successor']),true);
 assert.equal(check(t,'administrator',['administrator'],true),true);
});
test('source guard rejects duplicate application and changed or ambiguous rules',()=>{
 assert.throws(()=>patchWorker(patchWorker(fixture)),/already present/);
 assert.throws(()=>patchWorker(fixture.replace('const invited = contexts','const invitation = contexts')),/changed/);
 assert.throws(()=>patchWorker(fixture+fixture),/Unexpected/);
 assert.throws(()=>patchWorker('unrelated source'),/Unexpected/);
});

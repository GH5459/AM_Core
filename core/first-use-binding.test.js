import {test} from 'node:test';
import assert from 'node:assert/strict';
import {firstUseBindingDecision as decide, safeFirstUseReturn} from './first-use-binding.js';

const line = 'U' + 'a'.repeat(32), other = 'U' + 'b'.repeat(32);
const valid = {account:'123', permission:true, identity:{confirmed:true,account:'123',lineUserId:line}, binding:{status:'bound',account:'123',lineUserId:line,groupId:line,bindingId:'binding-1'}};
test('both verified identities and original permission are required',()=>{
  assert.equal(decide(valid).state,'continue');
  assert.equal(decide({...valid,permission:false}).state,'not-authorized');
  assert.equal(decide({...valid,permission:false,onboardingEligible:true,binding:null}).state,'bind');
  assert.equal(decide({...valid,permission:false,onboardingEligible:true}).state,'await-permission');
  assert.equal(decide({...valid,identity:null}).state,'bind');
  assert.equal(decide({...valid,binding:null}).state,'bind');
  assert.equal(decide({...valid,available:false}).state,'retry');
});
test('a conflicting, group or unconfirmed binding cannot pass',()=>{
  assert.equal(decide({...valid,identity:{...valid.identity,conflict:true}}).state,'review');
  assert.equal(decide({...valid,identity:{...valid.identity,confirmed:false}}).state,'review');
  assert.equal(decide({...valid,binding:{...valid.binding,lineUserId:other}}).state,'review');
  assert.equal(decide({...valid,binding:{...valid.binding,groupId:other}}).state,'review');
  assert.equal(decide({...valid,binding:{...valid.binding,status:'suspended'}}).state,'bind');
});
test('return paths cannot redirect to an external host',()=>{
  assert.equal(safeFirstUseReturn('/?tab=meetings#today'),'/?tab=meetings#today');
  for(const value of ['//other.example/a','https://other.example/','/\\other.example/','/\r\nX:1']) assert.equal(safeFirstUseReturn(value),'/');
});

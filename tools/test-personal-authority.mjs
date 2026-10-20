import test from 'node:test';
import assert from 'node:assert/strict';
import {personalAuthority} from '../versions/AM-IMP-2026.1020.30/dailylog/line-personal-completion.mjs';
test('stale personnel projection follows original session refresh then rechecks authority',async()=>{let reads=0,refreshes=0;const user={account:'synthetic',verify:async()=>{}};assert.equal(await personalAuthority({}, {},async()=>++reads===1?null:user,async()=>{refreshes++;}),user);assert.equal(reads,2);assert.equal(refreshes,1);});
test('ready authority does not refresh; still-stale or disabled authority is never accepted',async()=>{const user={account:'synthetic'};assert.equal(await personalAuthority({}, {},async()=>user,async()=>assert.fail()),user);await assert.rejects(()=>personalAuthority({}, {},async()=>null,async()=>{}),e=>e.status===503);await assert.rejects(()=>personalAuthority({}, {},async()=>{throw Object.assign(Error('disabled'),{status:403});},async()=>assert.fail()),e=>e.status===403);});

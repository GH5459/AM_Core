import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackgroundBackoff} from '../core/background-backoff.js';
import {createLeafTasks} from '../core/leaf-tasks.js';
import {createCalendarStore} from '../core/leaf-calendar/store.js';

test('each project and queue backs off exponentially, caps at five minutes and recovers',()=>{
  let clock=1;const logs=[],a={key:'a'},b={key:'b'},r=createBackgroundBackoff({now:()=>clock,logger:{warn:s=>logs.push(s),info:s=>logs.push(s)}});
  for(const delay of [30000,60000,120000,240000,300000,300000]){
    r.failure(a,'tasks',Object.assign(Error('postgres://private:password@host'),{code:'ECONNRESET'}));
    assert(!r.ready(a,'tasks'));assert(r.ready(b,'tasks'));assert(r.ready(a,'photos'));
    clock+=delay-1;assert(!r.ready(a,'tasks'));clock++;assert(r.ready(a,'tasks'));
  }
  r.success(a,'tasks');assert.deepEqual(r.snapshot(),[]);assert(!logs.join('').includes('password'));
});

test('real task drains skip a failing tenant during cooldown, keep others running and recover without restart',async()=>{
  let clock=1,broken=true;const reads={bad:0,good:0};
  const tasks=createLeafTasks({env:{},tenants:[{key:'bad'},{key:'good'}],platform:{},logger:{warn(){}},now:()=>clock,
    store:{service:async t=>{reads[t.key]++;if(t.key==='bad'&&broken)throw Object.assign(Error('connection terminated unexpectedly'),{code:'ECONNRESET'});return null;}}});
  await tasks.drain();await tasks.drainPhotos();const bad=reads.bad;
  for(let i=0;i<5;i++){clock+=5000;await tasks.drain();}
  assert.equal(reads.bad,bad);assert(reads.good>bad);
  broken=false;clock+=60000;await tasks.drain();await tasks.drainPhotos();assert.deepEqual(tasks.backgroundRetries(),[]);
});

test('calendar pool construction failure is not cached forever',async()=>{
  let attempts=0,releases=0;
  const store=createCalendarStore({settingsForTenant:()=>({configured:true,databaseUrl:'synthetic'}),poolFactory:async()=>{
    if(++attempts===1)throw Error('temporary factory failure');
    return {connect:async()=>({query:async()=>({rows:[]}),release:()=>releases++}),end:async()=>{}};
  }});
  await assert.rejects(store.service({tenantId:'fixture'}));
  assert.equal(await store.service({tenantId:'fixture'}),null);assert.equal(attempts,2);assert.equal(releases,1);await store.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {commonLineClient,createCommonLineEntry} from '../core/common-line-entry.js';
const destinations={dailylog:'https://work.invalid/',meetings:'/meetings/review/hub',uof:'https://uof.invalid/'};
async function run({url,app='dailylog',restoredUrl,permissions={dailylog:true,meetings:true,uof:true},navigationThrows=false,linked=true,inClient=false,externalThrows=false}={}){
 const nodes=new Map(),calls=[],navigation=[];const node=s=>{if(!nodes.has(s))nodes.set(s,{hidden:true,value:''});return nodes.get(s)};
 const location={href:url||'https://entry.invalid/meetings/review/connect?app='+app,replace(v){navigation.push(v);if(navigationThrows)throw Error('browser blocked')},reload(){}};
 const external=[];
 const context={URL,URLSearchParams,AbortSignal,setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer},clearTimeout,location,document:{querySelector:node},boot:{liffId:'fixture',destinations,requestedApp:app},liff:{init:async()=>{if(restoredUrl)location.href=restoredUrl},isLoggedIn:()=>true,getAccessToken:()=>'fixture-token',isInClient:()=>inClient,openWindow:v=>{external.push({...v});if(externalThrows)throw Error('blocked')}},fetch:async(_,opts)=>{calls.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,linked,permissions})}}};
 vm.runInNewContext('('+commonLineClient.toString()+')(boot)',context);await new Promise(r=>setImmediate(r));return {node,calls,navigation,external};
}
test('primary redirect must finish SDK secondary navigation before status or app navigation',async()=>{
 const p=await run({url:'https://entry.invalid/meetings/review?liff.state=%2Fconnect%3Fapp%3Ddailylog'});assert.deepEqual(p.calls,[]);assert.deepEqual(p.navigation,[]);
});
test('SDK query cleanup cannot switch dailylog to default meetings',async()=>{
 const p=await run({restoredUrl:'https://entry.invalid/meetings/review/connect'});assert.deepEqual(p.navigation,[destinations.dailylog]);
});
test('SDK query cleanup cannot use meetings permission to open UOF',async()=>{
 const p=await run({app:'uof',restoredUrl:'https://entry.invalid/meetings/review/connect',permissions:{dailylog:true,meetings:true,uof:false}});assert.deepEqual(p.navigation,[]);
});
test('incomplete feature permission response must not open a protected feature',async()=>{const p=await run({permissions:{}});assert.deepEqual(p.navigation,[]);assert.equal(p.node('#continue').hidden,true)});
test('browser navigation failure still gives a clear same-feature continuation without raw errors',async()=>{const p=await run({navigationThrows:true});assert.equal(p.node('#continue').href,destinations.dailylog);assert.equal(p.node('#continue').hidden,false);assert(!p.node('#status').textContent.includes('browser blocked'))});
test('server restores exact app from primary liff.state and direct request',async()=>{
 const entry=createCommonLineEntry({env:{AMCORE_MEETINGS_LIFF_ID:'fixture',AMCORE_MEETINGS_LIFF_ENDPOINT_URL:'https://entry.invalid/meetings/review'},call:async()=>{throw Error('no identity call')}});
 for(const app of ['dailylog','uof','meetings'])for(const path of ['/meetings/review/connect?app='+app,'/meetings/review?liff.state='+encodeURIComponent('/connect?app='+app)]){
 let html='';await entry.handle({method:'GET'},{setHeader(){},end(v){html=v}},new URL('https://entry.invalid'+path));assert(html.includes('"requestedApp":"'+app+'"'));
 }
});

test('meeting navigation inside LINE uses external browser, including retry, without in-app fallback',async()=>{
 for(const externalThrows of [false,true]){const p=await run({app:'meetings',inClient:true,externalThrows});assert.deepEqual(p.navigation,[]);assert.equal(p.external.length,1);assert.equal(p.external[0].external,true);assert.equal(new URL(p.external[0].url).pathname,'/meetings/review/hub');p.node('#continue').onclick({preventDefault(){}});assert.equal(p.external.length,2);assert.deepEqual(p.navigation,[]);}
 const denied=await run({app:'meetings',inClient:true,permissions:{meetings:false}});assert.equal(denied.external.length,0);
});

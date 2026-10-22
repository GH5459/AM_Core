import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {commonLineClient,commonLineHtml} from '../core/common-line-entry.js';

const destinations={dailylog:'https://work.invalid/?openExternalBrowser=1',meetings:'/meetings/review/hub',uof:'https://uof.invalid/Line/Review?openExternalBrowser=1'};
async function page(app,{linked=true,allowed=true,error=false,navigationError=false,loggedIn=true}={}){
 const nodes=new Map(),calls=[],replaced=[],logins=[];
 const node=s=>{if(!nodes.has(s))nodes.set(s,{hidden:true,value:''});return nodes.get(s);};
 const location={href:'https://entry.invalid/meetings/review/connect?app='+app,replace(url){replaced.push(url);if(navigationError)throw Error('navigation blocked');},reload(){}};
 const context={URL,AbortSignal,setTimeout,clearTimeout,location,boot:{liffId:'synthetic',destinations},document:{querySelector:node},liff:{init:async()=>{},isLoggedIn:()=>loggedIn,login:v=>logins.push(v),getAccessToken:()=> 'synthetic'},fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));if(error)throw Error('temporary error');return {ok:true,json:async()=>({ok:true,linked,permissions:{[app]:allowed}})};}};
 vm.runInNewContext('('+commonLineClient.toString()+')(boot)',context);
 await new Promise(resolve=>setImmediate(resolve));
 return {node,calls,replaced,logins};
}
for(const app of Object.keys(destinations)){
 test(app+': existing valid identity opens directly and exposes the same destination for navigation fallback',async()=>{
  const p=await page(app);assert.deepEqual(p.calls,[{action:'status'}]);assert.deepEqual(p.replaced,[destinations[app]]);
  assert.equal(p.node('#login').hidden,true);assert.equal(p.node('#confirm').hidden,true);assert.equal(p.node('#retry').hidden,true);
  assert.equal(p.node('#continue').href,destinations[app]);assert.equal(p.node('#continue').hidden,false);
 });
 test(app+': disabled permission stays on the page without a continuation link',async()=>{
  const p=await page(app,{allowed:false});assert.deepEqual(p.replaced,[]);assert.equal(p.node('#continue').hidden,true);assert.match(p.node('#status').textContent,/尚未開通/);
 });
 test(app+': unknown identity shows company login without bypassing verification',async()=>{
  const p=await page(app,{linked:false});assert.equal(p.node('#login').hidden,false);assert.deepEqual(p.replaced,[]);assert.equal(p.node('#continue').hidden,true);assert.equal(p.node('#retry').hidden,true);
 });
}
test('expired LINE session returns to original LINE login and never queries company status',async()=>{
 const p=await page('dailylog',{loggedIn:false});assert.equal(p.logins.length,1);assert.deepEqual(p.calls,[]);assert.deepEqual(p.replaced,[]);
});
test('identity conflict or network error exposes retry without opening an unverified destination',async()=>{
 const p=await page('dailylog',{error:true});assert.equal(p.node('#retry').hidden,false);assert.equal(p.node('#continue').hidden,true);assert.deepEqual(p.replaced,[]);
});
test('a blocked automatic navigation retains a usable verified original link',async()=>{
 const p=await page('dailylog',{navigationError:true});assert.equal(p.node('#continue').hidden,false);assert.equal(p.node('#continue').href,destinations.dailylog);assert.equal(p.node('#retry').hidden,false);
});
test('initial HTML hides retry and continuation while retaining the explicit first-link confirmation',()=>{
 const html=commonLineHtml({liffId:'synthetic',destinations});assert.match(html,/<button id="retry" class="secondary" hidden>重新嘗試/);assert.match(html,/<a id="continue" class="continue" hidden>/);assert.match(html,/連結並繼續/);assert(!html.includes('>重新確認</button>'));
});

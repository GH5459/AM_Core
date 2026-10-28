const assert=require('node:assert/strict');

function replaceOnce(source,before,after){
  assert.equal(source.split(before).length,2,'Private client differs from the reviewed source');
  return source.replace(before,after);
}

// Keep credential renewal and pending-write recovery. Only remove automatic
// reads that observe changes made elsewhere while this page stays open.
exports.patchPrivateClient=function(source){
  const timer="setInterval(()=>{if(context.expiresAt<Date.now()+120000&&!contextRefreshPending){contextRefreshPending=true;postParent('dailylog-vault-context-refresh');}if(authorizationBlocked||document.hidden||Date.now()-lastRemoteRead<60000)return;lastRemoteRead=Date.now();if(key)refresh().catch(()=>{});else if(!pending&&!setup)request().then(remote=>{if(remote.revision!==record.revision){record=remote;ackEnvelope=remote.envelope;cache().then(publish).catch(()=>{});}}).catch(()=>{});},60000);";
  source=replaceOnce(source,timer,"setInterval(()=>{if(context.expiresAt<Date.now()+120000&&!contextRefreshPending){contextRefreshPending=true;postParent('dailylog-vault-context-refresh');}},60000);");
  source=replaceOnce(source,"window.addEventListener('online',()=>{if(key){if(pending)flush();else refresh();}});","window.addEventListener('online',()=>{if(key&&pending)flush();});");
  source=replaceOnce(source,"const readLatest=()=>{if(key&&!document.hidden)refresh().catch(()=>{});};\n  document.addEventListener('visibilitychange',readLatest);window.addEventListener('focus',readLatest);",'');
  source=replaceOnce(source,'publish();if(pending)schedule();else await refresh();return;','publish();if(pending)schedule();return;');
  return source;
};

exports.patchModule=function(moduleSource){
  const prefix='export default ',suffix=';\n';
  assert(moduleSource.startsWith(prefix)&&moduleSource.endsWith(suffix));
  const source=JSON.parse(moduleSource.slice(prefix.length,-suffix.length));
  return prefix+JSON.stringify(exports.patchPrivateClient(source))+suffix;
};

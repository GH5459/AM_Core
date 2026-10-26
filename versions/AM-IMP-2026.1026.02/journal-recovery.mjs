// Preserve the existing outbox and acknowledgement logic. Explain a rejected
// save accurately, rather than labelling every server rejection as offline.
export async function journalRecoveryAsset(request,env,ctx,base){
 if(request.method!=='GET'||new URL(request.url).pathname!=='/notion-sync-client.js')return null;
 const headers=new Headers(request.headers);headers.delete('if-none-match');headers.delete('if-modified-since');
 const response=await base.fetch(new Request(request,{headers}),env,ctx);if(response.status!==200)return response;
 const text=await response.text(),from="state==='failed'?'暫時無法連線，內容已保留在這台裝置。':''";
 let source=text.replace(from,"state==='failed'?(message?'尚未儲存：'+message+' 原文仍保留在這台裝置。':'後台尚未確認保存，原文仍保留在這台裝置。'):''");
 // The server can turn an evening draft into the final log. Merge that
 // acknowledgement with edits typed during the request before clearing pending.
 // Otherwise rendering the unchanged local draft queues it indefinitely.
 source=source.replace('if(pending===sent)pending=null;',`if(result.snapshot&&!equal(JSON.parse(sent),ack)){
      const reconciled=merge(JSON.parse(sent),packet(data),ack);
      if(reconciled.conflicts.length){backup(packet(data));blocked=true;}
      else{install(reconciled.snapshot);pending=equal(packet(data),ack)?null:JSON.stringify(packet(data));}
    }else if(pending===sent)pending=null;`);
 source=source.replace("state=pending?'pending':result.state==='synced'?'synced':'saved';","state=blocked?'conflict':pending?'pending':result.state==='synced'?'synced':'saved';");
 const resultHeaders=new Headers(response.headers);for(const key of ['etag','content-length','content-encoding','last-modified'])resultHeaders.delete(key);resultHeaders.set('Cache-Control','private, no-store');
 return new Response(source,{status:200,headers:resultHeaders});
}

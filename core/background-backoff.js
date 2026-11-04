// Per tenant and queue: outages must not block healthy projects or replay jobs.
export function safeFailure(error) {
  const code = String(error?.code || '');
  if (/^[0-9A-Z]{5}$/.test(code) || ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND'].includes(code)) return code;
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) return 'HTTP_' + error.status;
  if (/connection terminated|connection closed/i.test(error?.message || '')) return 'DB_CONNECTION_CLOSED';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'TIMEOUT';
  return 'UNAVAILABLE';
}

export function createBackgroundBackoff({now=Date.now,logger=console,baseMs=30000,maxMs=300000}={}) {
  const states=new Map();
  const key=(tenant,queue)=>JSON.stringify([tenant.key,queue]);
  return {
    ready(tenant,queue){return now()>=(states.get(key(tenant,queue))?.nextAt||0);},
    success(tenant,queue){
      if(states.delete(key(tenant,queue))) logger.info?.('[background-retry] '+JSON.stringify({tenant:tenant.key,queue,state:'recovered'}));
    },
    failure(tenant,queue,error){
      const id=key(tenant,queue),attempts=Math.min(20,(states.get(id)?.attempts||0)+1);
      const delayMs=Math.min(maxMs,baseMs*2**(attempts-1));
      const state={attempts,nextAt:now()+delayMs,reason:safeFailure(error)};states.set(id,state);
      logger.warn?.('[background-retry] '+JSON.stringify({tenant:tenant.key,queue,...state,delayMs}));
    },
    snapshot(){return [...states].map(([id,state])=>{const [tenant,queue]=JSON.parse(id);return {tenant,queue,...state};});},
  };
}

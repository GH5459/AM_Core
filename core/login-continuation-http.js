import crypto from 'node:crypto';
import {createLoginContinuation, postgresContinuationStore} from './login-continuation.js';
import {verifyManagementRequest} from '../modules/meetings/management-auth.js';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const fail = () => Object.assign(Error('登入接續未完成，請使用原登入入口。'), {status:401});
export const continuationPaths = {
  dailylog: u => ['/', '/index.html', '/xiaoye', '/supervisor', '/tasks', '/journal'].includes(u.pathname),
  uof: u => ['/Line/Review', '/Line/Control'].includes(u.pathname),
  meetings: u => u.pathname === '/meetings/review/hub' || /^\/meetings\/review\/work\/[a-f0-9]{64}$/.test(u.pathname)
};
export function createLoginContinuationHttp({env=process.env,pool,authority,lineIdentity,fetchImpl=fetch,onError=()=>{}}) {
  const origin = new URL(env.AMCORE_MEETING_MANAGEMENT_ORIGIN || 'https://am.hozorental.com').origin;
  const origins = {dailylog:env.DAILYLOG_PUBLIC_ORIGIN || 'https://dailylog.chatgpt-673.workers.dev',uof:env.UOF_PUBLIC_ORIGIN || 'https://uof-line.ghotel.tw',meetings:origin};
  const defaults = {dailylog:'/',uof:'/Line/Review',meetings:'/meetings/review/hub'};
  const secret = env.AMCORE_MEETING_MANAGEMENT_SECRET || env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY;
  const key = secret && crypto.createHash('sha256').update('login-continuation-line-proof:'+secret).digest();
  let ready;
  const ensure = () => ready ||= (async()=>{await pool.query('SELECT key FROM central_archive.login_continuation_line_proofs LIMIT 0');await pool.query('SELECT key FROM central_archive.login_continuation_nonces LIMIT 0');})().catch(e=>{ready=null;throw e;});
  const encrypt = value => {const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);return {iv:iv.toString('base64url'),body:Buffer.concat([c.update(value,'utf8'),c.final()]).toString('base64url'),tag:c.getAuthTag().toString('base64url')};};
  const decrypt = v => {const c=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64url'));c.setAuthTag(Buffer.from(v.tag,'base64url'));return Buffer.concat([c.update(Buffer.from(v.body,'base64url')),c.final()]).toString('utf8');};
  const verifyLine = async value => {
    if(typeof value!=='string'||!value||value.length>4096)throw fail();
    const proof=await fetchImpl('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(value),{signal:AbortSignal.timeout(8000)}),p=await proof.json();
    if(!proof.ok||String(p.client_id)!==String(env.AMCORE_MEETINGS_LIFF_ID||'').split('-')[0]||!(Number(p.expires_in)>0))throw fail();
    const r=await fetchImpl('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+value},signal:AbortSignal.timeout(8000)}),profile=await r.json();
    if(!r.ok||!/^U[a-f0-9]{32}$/i.test(profile.userId||''))throw fail();
    const who=await lineIdentity(profile.userId);
    if(!who||who.userId!==profile.userId||!who.account)throw fail();
    return {who,expiresAt:Date.now()+Math.min(Number(p.expires_in)*1000,8*3600000)};
  };
  const sources = Object.fromEntries(['dailylog','uof'].map(source=>[source,{validate:reference=>authority({action:'proof',source,reference})}]));
  sources.meetings={async validate(reference){await ensure();const row=(await pool.query('SELECT value FROM central_archive.login_continuation_line_proofs WHERE key=$1',[reference])).rows[0]?.value;if(!row||row.expiresAt<=Date.now())return null;const checked=await verifyLine(decrypt(row.encrypted));if(checked.who.account!==row.account||checked.who.userId!==row.userId)return null;return {account:row.account,reference,generation:String(row.issuedAt),active:true,expiresAt:row.expiresAt};}};
  const targets=Object.fromEntries(Object.keys(origins).map(target=>[target,{origin:origins[target],ttlMs:target==='uof'?1800000:28800000,acceptsReturn:continuationPaths[target],authorize:account=>authority({action:'feature',target,account})}]));
  const broker=createLoginContinuation({store:postgresContinuationStore(pool),sources,targets});
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
  const json=(res,v,status=200)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(v));};
  const redirect=(res,url,cookie)=>{res.writeHead(303,{...headers,Location:url,...cookie?{'Set-Cookie':cookie}:{}});res.end();};
  const cookie=(value,expiresAt=0)=>'__Host-am-login-continuation='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+Math.max(0,Math.floor((expiresAt-Date.now())/1000));
  const readCookie=req=>String(req.headers.cookie||'').match(/(?:^|;\s*)__Host-am-login-continuation=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
  const validInput=v=>{if(!targets[v.target]||!(/^[a-f0-9]{64}$/).test(v.challenge||''))throw fail();const u=new URL(v.returnPath||defaults[v.target],origins[v.target]);if(u.origin!==origins[v.target]||u.hash||!continuationPaths[v.target](u))throw fail();return {...v,returnPath:u.pathname+u.search};};
  const destination=(target,code)=>origins[target]+'/login-continuation/callback?code='+encodeURIComponent(code);
  const body=async req=>{let size=0,parts=[];for await(const b of req){size+=b.length;if(size>12000)throw fail();parts.push(b);}return Buffer.concat(parts).toString();};
  const sourceUrl=(v,attempt)=>{const source=Object.keys(origins).filter(s=>s!==v.target)[attempt];if(!source){const fallback=new URL(v.target==='dailylog'?'/login':v.target==='uof'?'/Account/Login':v.returnPath,origins[v.target]);fallback.searchParams.set('continuation','skip');if(v.target!=='meetings')fallback.searchParams.set(v.target==='dailylog'?'returnTo':'ReturnUrl',v.returnPath);return fallback.href;}return origins[source]+'/login-continuation/authorize?'+new URLSearchParams({target:v.target,returnPath:v.returnPath,challenge:v.challenge,attempt:String(attempt)});};
  return {
    broker,origins,
    async actor(req){const value=readCookie(req);if(!value)return null;const g=await broker.check(value,'meetings'),p=g.permission;if(!p?.userId||!p?.tenantKey)throw fail();return {id:p.userId,name:p.name||'公司同仁',account:g.account,tenantKey:p.tenantKey};},
    async handle(req,res,url){
      if(!url.pathname.startsWith('/login-continuation/'))return false;
      let phase='ROUTE';
      try {
        if(req.method==='GET'&&url.pathname==='/login-continuation/browser.js'){
          res.writeHead(200,{...headers,'Content-Type':'text/javascript'});res.end(`window.loginContinuationSession=async()=>{try{const r=await fetch('/login-continuation/session',{credentials:'same-origin',cache:'no-store'});return r.ok&&(await r.json()).authenticated===true;}catch{return false;}};window.tryLoginContinuation=async()=>{try{const u=new URL(location.href);if(u.searchParams.get('continuation')==='skip'||Date.now()-Number(sessionStorage.getItem('login-continuation-attempt')||0)<60000)return false;sessionStorage.setItem('login-continuation-attempt',String(Date.now()));location.replace('/login-continuation/start?returnPath='+encodeURIComponent(u.pathname+u.search));return true;}catch{return false;}};`);return true;
        }
        if(url.pathname==='/login-continuation/machine'&&req.method==='POST'){
          phase='SIGNATURE';const raw=await body(req);if(!verifyManagementRequest(secret,req,raw))throw fail();const v=JSON.parse(raw);
          phase='NONCE';if(!/^[A-Za-z0-9_-]{43}$/.test(v.nonce||''))throw fail();await ensure();const accepted=await pool.query('INSERT INTO central_archive.login_continuation_nonces(key,expires_at) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key',[sha(v.nonce),Date.now()+60000]);if(!accepted.rows.length)throw fail();
          await pool.query('DELETE FROM central_archive.login_continuation_nonces WHERE key IN (SELECT key FROM central_archive.login_continuation_nonces WHERE expires_at<$1 LIMIT 100)',[Date.now()]);
          let result;
          if(v.action==='register-issue'){phase='SOURCE_PROOF';validInput(v);if(!['dailylog','uof'].includes(v.source))throw fail();const root=await broker.register(v.source,v.reference);phase='TARGET_ACCESS';result=await broker.issue(root.token,v);}
          else if(v.action==='chain-issue'){phase='SOURCE_CHAIN';validInput(v);result=await broker.issueFromChain(v.chainToken,v.source,v);}
          else if(v.action==='exchange'){phase='TICKET_EXCHANGE';if(v.target==='meetings')throw fail();result=await broker.exchange(v);}
          else if(v.action==='check'){phase='CHAIN_CHECK';result=await broker.check(v.chainToken,v.target);}
          else if(v.action==='logout'){phase='LOGOUT';result=await broker.logoutChain(v.chainToken,v.target);}
          else throw fail();json(res,{ok:true,...result});return true;
        }
        if(req.method==='GET'&&url.pathname==='/login-continuation/continue'){
          const v=validInput(Object.fromEntries(url.searchParams)),attempt=Number(url.searchParams.get('attempt')||0);if(!Number.isInteger(attempt)||attempt<0||attempt>2)throw fail();redirect(res,sourceUrl(v,attempt));return true;
        }
        if(req.method==='GET'&&url.pathname==='/login-continuation/start'){
          const returnPath=url.searchParams.get('returnPath')||defaults.meetings;validInput({target:'meetings',returnPath,challenge:'0'.repeat(64)});const verifier=token();redirect(res,origin+'/login-continuation/continue?'+new URLSearchParams({target:'meetings',returnPath,challenge:sha(verifier)}),'__Host-am-login-challenge='+verifier+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=60');return true;
        }
        if(req.method==='GET'&&url.pathname==='/login-continuation/callback'){
          const verifier=String(req.headers.cookie||'').match(/(?:^|;\s*)__Host-am-login-challenge=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1],existing=readCookie(req);let currentAccount=null;if(existing)currentAccount=(await broker.check(existing,'meetings')).account;
          const grant=await broker.exchange({code:url.searchParams.get('code'),target:'meetings',targetOrigin:origin,verifier,currentAccount});redirect(res,origin+grant.returnPath,[cookie(grant.token,grant.expiresAt),'__Host-am-login-challenge=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0']);return true;
        }
        if(req.method==='GET'&&url.pathname==='/login-continuation/session'){const actor=await this.actor(req);json(res,{authenticated:!!actor});return true;}
        if(req.method==='POST'&&url.pathname==='/login-continuation/logout'){
          if(req.headers.origin!==origin)throw fail();const value=readCookie(req);if(value)await broker.logoutChain(value,'meetings');res.setHeader('Set-Cookie',cookie('',0));json(res,{ok:true});return true;
        }
        if(req.method==='GET'&&url.pathname==='/login-continuation/authorize'){
          const v=validInput(Object.fromEntries(url.searchParams)),existing=readCookie(req);if(existing)try{const out=await broker.issueFromChain(existing,'meetings',v);redirect(res,destination(v.target,out.code));return true;}catch{}
          const boot={...v,liffId:env.AMCORE_MEETINGS_LIFF_ID,fallback:origin+'/login-continuation/continue?'+new URLSearchParams({...v,attempt:String(Number(v.attempt||0)+1)})};
          const script=`(async()=>{const b=${JSON.stringify(boot).replace(/</g,'\\u003c')};try{await liff.init({liffId:b.liffId});if(!liff.isLoggedIn()){location.replace(b.fallback);return;}const r=await fetch('/login-continuation/line-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,lineToken:liff.getAccessToken()})}),v=await r.json();location.replace(r.ok?v.url:b.fallback);}catch{location.replace(b.fallback);}})();`;
          res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width"><title>確認有效登入</title><p>正在確認有效登入…</p><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>'+script+'</script>');return true;
        }
        if(req.method==='POST'&&url.pathname==='/login-continuation/line-source'){
          if(req.headers.origin!==origin)throw fail();const v=validInput(JSON.parse(await body(req))),proof=await verifyLine(v.lineToken),reference=sha(token()),issuedAt=Date.now();await ensure();await pool.query('INSERT INTO central_archive.login_continuation_line_proofs(key,value) VALUES($1,$2::jsonb)',[reference,JSON.stringify({account:proof.who.account,userId:proof.who.userId,issuedAt,expiresAt:proof.expiresAt,encrypted:encrypt(v.lineToken)})]);const root=await broker.register('meetings',reference),out=await broker.issue(root.token,v);json(res,{url:destination(v.target,out.code)});return true;
        }
        json(res,{ok:false,error:'找不到登入接續入口。'},404);return true;
      }catch(error){error.continuationPhase=phase;onError(error);json(res,{ok:false,error:'登入接續未完成，請使用原登入入口。',code:'CONTINUATION_'+phase},401);return true;}
    }
  };
}

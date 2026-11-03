const origin='https://uof-line.ghotel.tw';
const origins=new Set([origin,'https://dailylog.chatgpt-673.workers.dev','https://am.hozorental.com','https://am-platform-2ymf.onrender.com']);
export function firstUseReturn(value){try{const u=new URL(value);if(!origins.has(u.origin)||u.username||u.password||value.length>3000||/[\r\n\\]/.test(value))return null;if(u.pathname.startsWith('/first-use'))return null;return u.href;}catch{return null;}}
export function firstUseUrl(value){const target=firstUseReturn(value);if(!target)throw Error('INVALID_FIRST_USE_RETURN');return origin+'/first-use?return='+encodeURIComponent(target);}
function blocked(request,state){const target=firstUseUrl(request.url);if(state==='inactive')return Response.json({error:'此帳號目前停用或無效。'},{status:403});if(['GET','HEAD'].includes(request.method)&&!new URL(request.url).pathname.startsWith('/api/'))return new Response(null,{status:303,headers:{Location:target,'Cache-Control':'no-store'}});return Response.json({error:'請先完成本人 LINE 與 UOF 綁定。',code:'FIRST_USE_BINDING_REQUIRED',onboardingUrl:target},{status:428,headers:{'Cache-Control':'no-store'}});}
export async function firstUseUofGate(app,request,status){
 const p=new URL(request.url).pathname;
 if(p.startsWith('/_ops/')||p.startsWith('/first-use')||['/Account/Login','/Line/Setup','/api/health','/api/uof-review/login','/api/uof-review/logout','/api/uof-review/session','/api/uof-review/bootstrap'].includes(p)||p.startsWith('/api/line-io/binding/')||p.startsWith('/login-continuation/')||/\.(js|css|png|svg|ico)$/.test(p))return null;
 const s=await app.session(request);if(!s?.account)return null;
 try{const v=await status(app,{account:s.account});return v?.ok&&v.linked?null:blocked(request,v?.reason);}catch{return Response.json({error:'綁定狀態暫時無法確認，請稍後重試。'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export async function firstUseDailyGate(request,env){
 const p=new URL(request.url).pathname;
 if(p.startsWith('/login')||['/api/auth/session','/api/auth/login','/api/auth/logout'].includes(p)||/\.(js|css|png|svg|ico|woff2?)$/.test(p))return null;
 const token=/\bdailylog_session=([a-f0-9]{64})\b/.exec(request.headers.get('Cookie')||'')?.[1];if(!token)return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 const row=await env.DB.prepare('SELECT user_json,expires_at FROM sessions WHERE token_hash=?').bind(hash).first();if(!row?.user_json||row.expires_at<=Date.now())return null;
 const user=JSON.parse(row.user_json);if(!/^\d{1,20}$/.test(user.account||''))return null;
 try{const v=await env.SHARED_ACCESS.commonLine({action:'first-use',account:user.account});if(!v?.ok)throw Error('UNAVAILABLE');return v.linked?null:blocked(request,v.reason);}catch{return Response.json({error:'綁定狀態暫時無法確認，請稍後重試。'},{status:503,headers:{'Cache-Control':'no-store'}});}
}

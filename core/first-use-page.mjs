import {firstUseReturn} from './first-use-gates.mjs';
const escape=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export async function firstUsePage(app,request,{authorize,status}){
 const u=new URL(request.url);if(!['/first-use','/first-use/status'].includes(u.pathname))return null;
 if(request.method!=='GET')return new Response(null,{status:405});
 const session=await app.session(request);
 if(!session?.account)return new Response(null,{status:303,headers:{Location:'/Account/Login?ReturnUrl='+encodeURIComponent(u.pathname+u.search),'Cache-Control':'no-store'}});
 await authorize(app,request);
 if(u.pathname==='/first-use/status')return Response.json(await status(app,{account:session.account}),{headers:{'Cache-Control':'no-store'}});
 const target=firstUseReturn(u.searchParams.get('return'))||'https://uof-line.ghotel.tw/Line/Control';
 const existing=await status(app,{account:session.account});
 if(existing.linked)return new Response(null,{status:303,headers:{Location:target,'Cache-Control':'no-store'}});
 let html=await (await app.env.ASSETS.fetch('https://assets.local/line-setup.html')).text();
 html=html.replaceAll('__CSRF__',escape(session.csrf)).replaceAll('__ACCOUNT__',escape(session.account));
 const script=`(()=>{const target=${JSON.stringify(target).replaceAll('<','\\u003c')};let busy=false;const check=async()=>{if(busy||document.hidden)return;busy=true;try{const r=await fetch('/first-use/status',{cache:'no-store'});if(r.ok&&(await r.json()).linked)location.replace(target);}catch{}finally{busy=false;}};document.querySelector('h1').textContent='首次使用：綁定 LINE 與 UOF';document.getElementById('setupIntro').textContent='完成本人綁定後，會自動回到您原本要使用的工具。';document.getElementById('completeInstructions').textContent='正在確認綁定並返回原工具…';document.querySelectorAll('details').forEach(x=>x.hidden=true);setInterval(check,4000);document.addEventListener('visibilitychange',check);check();})();`;
 html=html.replace('</body>','<script>'+script+'</script></body>');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'}});
}

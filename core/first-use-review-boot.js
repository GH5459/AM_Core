export function firstUseReviewBoot(liffId){
 const boot=JSON.stringify({liffId}).replaceAll('<','\\u003c');
 return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>確認會議使用資格</title><p id="status" role="status">正在確認本人 LINE 與 UOF 綁定…</p><button onclick="location.reload()">重新嘗試</button><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>('+firstUseReviewClient.toString()+')('+boot+');</script></html>';
}
export async function firstUseReviewClient(boot){try{
 await liff.init({liffId:boot.liffId});if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}
 const r=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'first-use-bootstrap',liffAccessToken:liff.getAccessToken()}),signal:AbortSignal.timeout(60000)}),j=await r.json();
 if(r.status===428&&j.onboardingUrl){const target=new URL('/first-use','https://uof-line.ghotel.tw');target.searchParams.set('return',location.href);location.replace(target.href);return;}
 if(!r.ok||typeof j.html!=='string')throw Error(j.error||'目前無法確認使用資格，請稍後再試。');
 document.open();document.write(j.html);document.close();
 }catch(e){document.getElementById('status').textContent=e.message||'請重新嘗試。';}}

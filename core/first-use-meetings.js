import {firstUseUrl} from './first-use-gates.mjs';
export function createFirstUseMeetingGuard(call){return async lineUserId=>{
 if(!/^U[a-f0-9]{32}$/i.test(lineUserId||''))throw Object.assign(Error('請先登入 LINE。'),{status:401,statusCode:401});
 const value=await call({action:'first-use',lineUserId});
 if(!value?.ok)throw Object.assign(Error('綁定狀態暫時無法確認，請稍後重試。'),{status:503,statusCode:503});
 if(value.linked)return;
 throw Object.assign(Error('請先完成本人 LINE 與 UOF 綁定。'),{status:428,statusCode:428,onboardingUrl:firstUseUrl('https://am.hozorental.com/meetings/review/hub')});
};}

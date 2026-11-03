import {firstUseUrl} from './first-use-gates.mjs';
export function createFirstUseMeetingGuard(call){return async lineUserId=>{
 if(!/^U[a-f0-9]{32}$/i.test(lineUserId||''))throw Object.assign(Error('請先登入 LINE。'),{status:401,statusCode:401});
 let value;try{value=await call({action:'first-use',lineUserId});}catch{throw Object.assign(Error('綁定狀態暫時無法確認，請稍後重試。'),{status:503,statusCode:503,code:'FIRST_USE_UNAVAILABLE'});}
 if(!value?.ok)throw Object.assign(Error('綁定狀態暫時無法確認，請稍後重試。'),{status:503,statusCode:503,code:'FIRST_USE_UNAVAILABLE'});
 if(value.linked)return;
 throw Object.assign(Error('請先完成本人 LINE 與 UOF 綁定。'),{status:428,statusCode:428,code:'FIRST_USE_BINDING_REQUIRED',onboardingUrl:firstUseUrl('https://am.hozorental.com/meetings/review/hub')});
};}

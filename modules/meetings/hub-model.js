import {failure} from './workspace-model.js';
export const HUB_CONTRACT='meeting-hub-plans-audio-calendar-v1';
export function planInput(v){
 if(!v||typeof v.topic!=='string'||!v.topic.trim()||v.topic.length>200||typeof v.location!=='string'||v.location.length>2000||!Array.isArray(v.accounts)||v.accounts.length>200||v.accounts.some(a=>typeof a!=='string'||!/^\d{1,20}$/.test(a))||typeof v.calendar!=='boolean'||typeof v.cancelled!=='boolean')throw failure(400,'請填寫主題、時間及有效參與者。');
 for(const t of [v.start,v.end])if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?\+08:00$/.test(t)||!Number.isFinite(Date.parse(t))||new Date(Date.parse(t)+8*3600000).toISOString().slice(0,16)!==t.slice(0,16))throw failure(400,'請填寫有效的台灣日期時間。');
 if(Date.parse(v.end)<=Date.parse(v.start))throw failure(400,'結束時間須晚於開始時間。');
 return {...v,topic:v.topic.trim(),accounts:[...new Set(v.accounts)]};
}
export function audioInput(v){
 if(!/^[a-zA-Z0-9_-]{16,80}$/.test(v.uploadId||''))throw failure(400,'錄音識別不正確。');
 if(v.action==='audio-begin'&&(!/^audio\/(webm|mp4|mpeg|wav|x-wav|ogg|aac|x-m4a)(?:;codecs=[a-z0-9., -]+)?$/i.test(v.mime||'')||typeof v.filename!=='string'||!v.filename||v.filename.length>180))throw failure(400,'請選擇支援的錄音格式。');
 if(v.action==='audio-part'&&(!Number.isSafeInteger(v.part)||v.part<0||v.part>=4096||typeof v.bytes!=='string'||v.bytes.length>2796204||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.bytes)))throw failure(400,'錄音分段格式不正確。');
 if(v.action==='audio-finish'&&(!Number.isSafeInteger(v.parts)||v.parts<1||v.parts>4096))throw failure(400,'錄音分段數量不正確。');
}

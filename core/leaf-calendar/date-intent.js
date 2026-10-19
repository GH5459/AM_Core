import lunar from './lunar.cjs';
export const normalizedDateText=text=>String(text).normalize('NFKC').replace(/(\d)\s*(年|月|日|號|号|[/.:-])\s*(?=\d)/gu,'$1$2').replace(/(\d)\s*(日|號|号)/gu,'$1$2');
export const explicitCalendarRequest=text=>/(?:請|幫我|我要|替我|協助)?\s*(?:建立|新增|設定|安排|排|加|建)(?:一個|一筆|個)?\s*(?:固定)?(?:活動|行程|紀念日|生日|忌日|會議)|(?:活動名稱|時間設定)\s*[：:]/u.test(text);
function chineseNumber(s){if(/^\d+$/.test(s))return Number(s);s=s.replace(/^初/u,'').replace(/^廿/u,'二十').replace(/^卅/u,'三十');if(s==='正')return 1;if(s==='冬')return 11;if(/^[臘腊]$/u.test(s))return 12;
 const digits='零一二三四五六七八九';if(s==='十')return 10;if(s.includes('十')){const [a,b]=s.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}return digits.indexOf(s);}
export function lunarTextEvent(text,at,existing){if(!/農曆|农历|陰曆|阴历/u.test(text)){
 if(existing?.recurrence?.calendar!=='chinese')return null;
 const event={...existing,confirmationNotes:[...(existing.confirmationNotes||[])],needsClarification:[]};let edited=false;
 for(const [key,label]of [['topic','活動名稱|名稱|主題'],['location','地點|地址'],['content','備忘|備註|內容|主要內容']]){const value=text.match(new RegExp('(?:^|\\n)(?:'+label+')(?:\\s*[：:]|改成|改為|是)\\s*([^\\n]+)','u'))?.[1];if(value!==undefined){event[key]=value.trim();edited=true;}}
 if(!edited)event.needsClarification.push('農曆活動修改日期或時間時，請重新提供農曆月日、每年重複及全天或時刻；不會改成固定國曆。');return event;
 }
 const date=text.match(/(?:農曆|农历|陰曆|阴历)\s*(閏|闰)?\s*([正冬臘腊一二三四五六七八九十\d]+)\s*月\s*([初廿卅一二三四五六七八九十\d]+)\s*(?:日|號|号)?/u);
 const field=label=>text.match(new RegExp('(?:^|\\n)'+label+'\\s*[：:]\\s*([^\\n]+)','u'))?.[1]?.trim();
 const event={...(existing||{}),topic:field('(?:活動名稱|名稱|主題)')||existing?.topic||'農曆紀念日',location:field('(?:地點|地址)')||existing?.location||'',content:field('(?:備忘|備註|內容|主要內容)')||existing?.content||text,confirmationNotes:[],needsClarification:[]};
 delete event.time;delete event.endTime;delete event.endDate;delete event.durationMinutes;delete event.recurrence;event.date='';event.allDay=true;
 if(!date){event.needsClarification.push('請提供農曆月日，例如農曆十月十七。');return event;}
 if(!/每年|每一年|每(?:個)?農曆年/u.test(text)){event.needsClarification.push('農曆活動目前支援每年重複，請確認是否每年同一農曆月日。');return event;}
 const month=chineseNumber(date[2]),day=chineseNumber(date[3]),leapMonth=Boolean(date[1]);
 if(month<1||month>12||day<1||day>30){event.needsClarification.push('請確認有效的農曆月日。');return event;}
 if(/每隔|隔年|共\s*\d+\s*次|截止|直到|至\s*\d|從|自\s*\d|\d{4}\s*年/u.test(text)){event.needsClarification.push('農曆年度活動目前從下一次日期排至2100年；指定間隔、起始年或截止條件尚不支援，請確認排程方式。');return event;}
 const clocks=[...text.matchAll(/(上午|早上|下午|晚上|中午|凌晨)?\s*(\d{1,2})\s*(?:[:：]\s*(\d{2})|[點点])/gu)];
 if(clocks.length){const clock=(c,meridiem)=>{let hour=Number(c[2]);if(/下午|晚上|中午/u.test(c[1]||meridiem||'')&&hour<12)hour+=12;return String(hour).padStart(2,'0')+':'+(c[3]||'00');};event.allDay=false;event.time=clock(clocks[0]);if(clocks[1])event.endTime=clock(clocks[1],clocks[0][1]);}
 else if(!/全天|全日|紀念日|纪念日|忌日|生日|週年|周年/u.test(text)){event.allDay=false;event.needsClarification.push('請指定活動時間，或回覆「全天」。');}
 const first=lunar.nextLunarDate(month,day,at,leapMonth);if(!first){event.needsClarification.push('農曆換算支援至2100年，找不到下一次有效日期。');return event;}
 event.date=first;event.recurrence={frequency:'YEARLY',calendar:'chinese',month,day,leapMonth,throughYear:2100};
 if(event.endTime)event.endDate=first;
 event.confirmationNotes.push('以農曆為準逐年換算，已安排至2100年；不把其他年份的國曆日期固定為同一天。');
 if(/國曆|国历|陽曆|阳历/u.test(text))event.confirmationNotes.push('原文括號中的國曆日期僅供參考；以卡片首次日期及農曆規則為準。');
 if(event.allDay&&!/全天|全日/u.test(text))event.confirmationNotes.push('未提供時刻，紀念日先設為全天；按「建立」即採用全天設定。');
 return event;
}

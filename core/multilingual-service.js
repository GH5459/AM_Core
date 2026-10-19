import {verifyManagementRequest} from '../modules/meetings/management-auth.js';
import {checkedLocale,translationInput,translationPrompt,checkedTranslations,localeError,MULTILINGUAL_CONTRACT} from './multilingual-policy.js';
export const syntheticTranslationTexts=['今天尚未完成 301 房清潔，預計明天 15:00 完成。','I finished cleaning room 302 today.','Saya belum selesai membersihkan kamar 303.'];
export async function platformTranslation({req,input,raw,platform,tasks,env,probe=false}){
 if(req.method!=='POST'||!verifyManagementRequest(env.AMCORE_MEETING_MANAGEMENT_SECRET||env.AMCORE_LINE_DIRECTORY_OWNER_API_KEY,req,raw))throw localeError('Forbidden',403);
 if(typeof input.tenantKey!=='string'||!(await tasks.groupServices()).some(t=>t.key===input.tenantKey))throw localeError('Unknown service',403);
 const actor=String(req.headers['x-meeting-actor']),experience=probe?{locale:checkedLocale(input.locale),revision:0}:await tasks.translationExperience(input.tenantKey,actor);
 if(!experience||!probe&&(experience.locale!==input.locale||experience.revision!==input.revision))throw localeError('Language setting changed',409);
 const texts=probe?syntheticTranslationTexts:translationInput(input);if(!probe&&experience.locale==='zh-Hant')return {ok:true,contract:MULTILINGUAL_CONTRACT,locale:experience.locale,translations:texts};const prompt=translationPrompt(texts,experience.locale),llm=platform.llmForTenant?.({key:input.tenantKey})||platform.llm;
 if(!llm?.completeJson)throw localeError();
 const result=await llm.completeJson({...prompt,schema:{type:'object',properties:{translations:{type:'array',items:{type:'string'}}},required:['translations']},profile:'cheap',maxTokens:Math.min(7500,Math.max(800,texts.reduce((n,s)=>n+s.length,0)*3)),timeoutMs:20000,budgetMs:25000});
 const translations=checkedTranslations(result,texts);
 if(!probe){const current=await tasks.translationExperience(input.tenantKey,actor);if(!current||current.revision!==experience.revision||current.locale!==experience.locale)throw localeError('Language setting changed',409);}
 return {ok:true,contract:MULTILINGUAL_CONTRACT,locale:experience.locale,translations,...probe?{syntheticOnly:true}:{}};
}

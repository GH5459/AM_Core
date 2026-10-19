import fs from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {createLlm} from '../core/llm.js';
import {extractSelfTask,selfTaskCard,quickCreateIntent} from '../core/group-quick-create.js';
import {extractEvents,prepareEvent,preview} from '../core/leaf-calendar/extract.js';
const folder=process.argv[2],env=parseEnv(fs.readFileSync(process.argv[3],'utf8')),llm=createLlm({env,logger:{log(){},warn(){},error(){}}}),at=Date.parse('2026-10-19T02:00:00Z');
const results=[],cards=[];
for(const [text,check]of [
 ['@葉小蝸 幫我建立任務：整理本週招募進度，10月23日下午5點前完成，成果是職缺人數清單。',p=>{assert.equal(p.draft.dueDate,'2026-10-23');assert.equal(Date.parse(p.draft.dueAt),Date.parse('2026-10-23T17:00:00+08:00'));assert.equal(p.missing.length,0);}],
 ['@葉小蝸 幫我建立任務：整理新人報到清單。',p=>{assert.equal(p.draft.dueDate,null);assert.equal(p.missing.length,0);}],
 ['@葉小蝸 幫我建立任務：處理一下。',p=>assert(p.missing.length)],
 ['@葉小蝸 幫我建立任務：整理招募資料，2月30日前完成。',p=>assert(p.missing.length)]
 ]){const p=await extractSelfTask({text,at,llm});check(p);results.push({case:results.length+1,passed:true});cards.push(selfTaskCard({id:'a'.repeat(48),revision:1,prepared:p,people:[{name:'合成同仁'}]}));}
for(const text of ['@葉小蝸 幫我們安排會議：10月22日下午2點到3點，討論招募進度，二樓會議室。','@葉小蝸 幫我安排會議：明天下午3點，討論新人報到流程。']){const events=await extractEvents({text,at,llm,groupInvitation:true});assert.equal(events.length,1);const p=prepareEvent(events[0],'synthetic');assert.equal(p.missing.length,0);cards.push(preview({request_id:'a'.repeat(48),revision:1,payload:p}));results.push({case:results.length+1,passed:true});}
// Format validation only: LINE's validate endpoint does not deliver a message.
for(const message of cards){const r=await fetch('https://api.line.me/v2/bot/message/validate/push',{method:'POST',headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messages:[message]}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'Synthetic Flex format rejected: '+await r.text());}
fs.writeFileSync(folder+'/synthetic-tests.private.json',JSON.stringify({passed:true,cases:results,lineFormatValidations:cards.length,messagesSent:false},null,2));console.log(JSON.stringify({syntheticAI:results.length,lineFormatValidations:cards.length,messagesSent:false,passed:true}));

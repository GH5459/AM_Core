import test from 'node:test';import assert from 'node:assert/strict';
import {externalBrowserUrl,externalBrowserMessage} from '../core/line-external-browser.mjs';
import {proposalCard} from '../core/xiaoye-proposal-card.mjs';
import {intakeCard} from '../core/xiaoye-intake-card.mjs';
import {createLine} from '../core/line.js';
const origin='https://dailylog.chatgpt-673.workers.dev';
test('clickable URL preserves exact case/version, fragment and ticket; conversion is idempotent',()=>{
 const input=origin+'/xiaoye?issue=work-example&review='+('a'.repeat(64))+'&action=approve&openExternalBrowser=0&openExternalBrowser=1&openInAppBrowser=0#details';
 const output=externalBrowserUrl(input),url=new URL(output);assert.equal(url.searchParams.get('issue'),'work-example');assert.equal(url.searchParams.get('review'),'a'.repeat(64));assert.equal(url.searchParams.get('action'),'approve');assert.equal(url.hash,'#details');assert.deepEqual(url.searchParams.getAll('openExternalBrowser'),['1']);assert(!url.searchParams.has('openInAppBrowser'));assert.equal(externalBrowserUrl(output),output);
 assert.equal(new URL(externalBrowserUrl(origin+'/line-login?ticket=a%2Bb%2Fc%3D')).searchParams.get('ticket'),'a+b/c=');
 for(const value of ['line://nv/chat','https://liff.line.me/123/path','https://miniapp.line.me/123','javascript:alert(1)','invalid'])assert.equal(externalBrowserUrl(value),value);
});
test('both proposal buttons and intake history use external browser without changing postbacks',()=>{
 const task={id:'work-example',title:'測試',description:'原文',secretary:{reporters:[{name:'同仁'}],proposal:{hash:'a'.repeat(64),version:2,summary:'說明',steps:'步驟',systems:['dailylog'],deploy:false}}};
 for(const button of proposalCard(origin,task).contents.footer.contents){assert.equal(button.action.type,'postback');assert(button.action.data.endsWith(task.secretary.proposal.hash));assert(!button.action.uri);}
 const draft='draft-'+'a'.repeat(64),buttons=intakeCard('原文',{draft:true,draftId:draft}).contents.footer.contents;assert.equal(buttons[0].action.data,'xiaoye:finish:'+draft);assert.equal(new URL(buttons[2].action.uri).searchParams.get('openExternalBrowser'),'1');
});
test('outgoing system text links preserve UTF16 mention positions; media, source, postback and third-party text stay unchanged',()=>{
 const url=origin+'/xiaoye?issue=example',text='😀 '+url+'\n@同仁';const msg={type:'text',text,mention:{mentionees:[{index:text.indexOf('@'),length:3,userId:'synthetic'}]}};
 const changed=externalBrowserMessage(msg);assert.equal(changed.text.slice(changed.mention.mentionees[0].index),'@同仁');assert(changed.text.includes('openExternalBrowser=1'));assert.equal(msg.text,text);
 const card={type:'flex',contents:{type:'bubble',body:{type:'image',url:'https://example.test/image.png'},footer:{type:'box',contents:[{type:'button',action:{type:'uri',uri:origin+'/xiaoye',altUri:{desktop:origin+'/xiaoye'}}},{type:'button',action:{type:'postback',data:'url='+origin+'/xiaoye'}}]}}};const next=externalBrowserMessage(card);assert.equal(next.contents.body.url,card.contents.body.url);assert.equal(next.contents.footer.contents[1].action.data,card.contents.footer.contents[1].action.data);assert(next.contents.footer.contents[0].action.altUri.desktop.includes('openExternalBrowser=1'));
 const third={type:'text',text:'原第三方文件 https://example.test/signed?token=a'};assert.deepEqual(externalBrowserMessage(third),third);
});
test('actual reply and push transports normalize URI buttons and system text before sending and archiving',async()=>{
 const original=globalThis.fetch,sent=[],archive=[];globalThis.fetch=async(_,options)=>{sent.push(JSON.parse(options.body));return Response.json({sentMessages:[]});};
 try{const line=createLine({channelAccessToken:'synthetic',logger:{info(){},warn(){},error(){}}});line.setArchiveObserver({before:async v=>{archive.push(v);return 'synthetic';},after:async()=>{}});await line.replyLineMessages('synthetic',{type:'template',altText:'開啟',template:{type:'buttons',text:'開啟',actions:[{type:'uri',label:'案件',uri:origin+'/xiaoye'}]}});await line.pushLineMessage('synthetic',origin+'/xiaoye\n同仁',{name:'同仁',userId:'synthetic'}, {additionalMessages:[intakeCard('查看')]});assert.equal(new URL(sent[0].messages[0].template.actions[0].uri).searchParams.get('openExternalBrowser'),'1');assert.equal(sent[1].messages[0].type,'textV2');assert(sent[1].messages[0].text.includes('{who}'));assert(sent[1].messages[0].text.includes('openExternalBrowser=1'));assert.deepEqual(archive[1].messages,sent[1].messages);}finally{globalThis.fetch=original;}
});

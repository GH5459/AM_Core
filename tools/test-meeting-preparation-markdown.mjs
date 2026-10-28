import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {preparationMarkdownScript,renderPreparationMarkdown} from '../modules/meetings/preparation-markdown.js';
import {workspaceHtml} from '../modules/meetings/workspace-ui.js';
const dom=new JSDOM('<div id="preview"></div>',{runScripts:'outside-only'});
const {window}=dom;window.eval(preparationMarkdownScript);window.eval('window.render='+renderPreparationMarkdown.toString());
const target=window.document.querySelector('#preview');
const original='# 議程\n\n## 討論項目\n\n**重點**與*補充*\n\n1. 第一項\n   - 子項\n2. 第二項\n\n- [ ] 尚未完成\n- [x] 完成\n\n| 項目 | 負責人 |\n| --- | --- |\n| A | B |\n\n> 背景\n\n```js\nconst a = 1 < 2;\n```\n\n[參考](https://example.test/a?b=1&c=2)';
window.render(original,target);
assert.equal(target.querySelector('h1').textContent,'議程');assert.equal(target.querySelector('strong').textContent,'重點');
assert(target.querySelector('ol li ul li'));assert.equal(target.querySelectorAll('input:disabled').length,2);assert(target.querySelectorAll('input')[1].checked);
assert.equal(target.querySelector('table tbody td').textContent,'A');assert.equal(target.querySelector('blockquote').textContent.trim(),'背景');
assert.equal(target.querySelector('pre code').textContent.trim(),'const a = 1 < 2;');assert.equal(target.querySelector('a').getAttribute('rel'),'noopener noreferrer');
for(const source of ['<script>alert(1)</script>','<svg onload="alert(1)"></svg>','<img src="https://tracker.test/x" onerror="alert(1)">','[bad](javascript:alert%281%29)','<a href="java&#10;script:alert(1)" onclick="alert(1)">bad</a>','<iframe src="https://tracker.test"></iframe>','<form><input name="secret"></form>']){
 window.render(source,target);assert.equal(target.querySelectorAll('script,svg,img,iframe,form,[onclick],[onerror],[onload],a[href^="javascript"]').length,0);
 assert.equal(target.querySelectorAll('[src]').length,0);
}
window.render('一般文字\n第二行\n\n第三段',target);assert.equal(target.querySelectorAll('p').length,2);assert(target.querySelector('br'));
window.render('',target);assert(target.textContent.includes('尚無會前資料'));
const html=workspaceHtml({id:'synthetic'});const page=new JSDOM(html,{runScripts:'outside-only'});
// Validate serialized scripts as shipped, including pinned parser and initializer.
for(const script of page.window.document.querySelectorAll('script:not([src]):not([type="application/json"])'))new Function(script.textContent);
assert(html.includes('window.renderPreparationMarkdown='));assert(html.includes('#preparationPreview'));
console.log('PASS: Markdown structure, nested lists, tables, task checks, plain text, unsafe markup, no external images, serialized page scripts.');

// Apply the normal workspace render without detaching its unchanged upper
// calendar and private frames. A date, layout or view change uses a full render.
window.dailylogApplyWorkspace=function(html){
 const workspace=document.getElementById('personalWorkspace');
 const key=[role,personalView,selectedDate,typeof mobileLayout==='function'&&mobileLayout()].join('|');
 const template=document.createElement('template');template.innerHTML=html;
 const oldBook=workspace.querySelector('.journal-book'),newBook=template.content.querySelector('.journal-book');
 const oldChildren=[...workspace.children],newChildren=[...template.content.children];
 const oldIndex=oldChildren.indexOf(oldBook),newIndex=newChildren.indexOf(newBook);
 const oldPanel=oldBook?.querySelector('#diary-tab-panel'),newPanel=newBook?.querySelector('#diary-tab-panel');
 const oldTabs=oldBook?.querySelector('.journal-tabs'),newTabs=newBook?.querySelector('.journal-tabs');
 if(workspace.dataset.stableWorkspaceKey!==key||oldIndex<0||oldIndex!==newIndex||oldChildren.length!==newChildren.length||!oldPanel||!newPanel||!oldTabs||!newTabs){
  workspace.innerHTML=html;workspace.dataset.stableWorkspaceKey=key;return;
 }
 const oldPrivate=oldBook.querySelector('.web-private-panel'),newPrivate=newBook.querySelector('.web-private-panel');
 const oldMode=oldPrivate?.querySelector('[data-vault-mode]')?.dataset.vaultMode||'';
 const newMode=newPrivate?.querySelector('[data-vault-mode]')?.dataset.vaultMode||'';
 if(oldMode!==newMode){
  const status=oldBook.querySelector('.work-page-status');
  if(newPrivate&&!status){workspace.innerHTML=html;workspace.dataset.stableWorkspaceKey=key;return;}
  oldPrivate?.remove();if(newPrivate)status.before(newPrivate);
 }
 for(const button of oldBook.querySelectorAll('[data-web-private]')){
  const next=newBook.querySelector('[data-web-private="'+button.dataset.webPrivate+'"]');
  if(next){button.innerHTML=next.innerHTML;button.setAttribute('aria-expanded',next.getAttribute('aria-expanded'));}
 }
 oldTabs.replaceChildren(...newTabs.childNodes);
 oldPanel.replaceChildren(...newPanel.childNodes);
 oldPanel.setAttribute('aria-labelledby',newPanel.getAttribute('aria-labelledby'));
 for(let i=0;i<oldChildren.length;i++)if(i!==oldIndex)oldChildren[i].replaceWith(newChildren[i]);
};

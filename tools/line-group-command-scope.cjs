const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const exact=new Set([
 '.github/workflows/validate-bank-mention.yml',
 'core/group-command.js','core/group-quick-create.js','core/leaf-groups.js','core/leaf-tasks.js',
 'core/line-self-task-worker.mjs','core/line-task-dates.mjs','modules/meetings/conversation-service.js',
 'tools/fixtures/leaf-groups.mjs','tools/line-group-command-scope.cjs','tools/test-line-group-command-scope.cjs',
 'tools/test-group-command-policy.mjs','tools/test-group-quick-create.mjs','tools/test-leaf-groups.mjs',
 'tools/test-leaf-tasks.mjs','tools/test-line-task-dates.mjs','tools/test-conversation-meetings.mjs',
 'tools/test-group-quick-create-worker.cjs','tools/test-leaf-task-edit.mjs','tools/test-line-work-login.mjs',
 'docs/LINE_QUICK_CREATE_GUIDE.md','docs/upgrades/line-group-commands-20261102.md',
 'docs/tenants/green-hotel/project-improvement-manifest.md'
]);
function affectedOnly(files){return files.length>0&&files.every(f=>exact.has(f)||/^versions\/AM-IMP-2026\.1102\.02\/(?:README\.md|INSTALL\.md|VERIFY\.md|ROLLBACK\.md|upgrade\.json|build\.cjs)$/.test(f));}
module.exports={affectedOnly};
if(require.main===module){
 let scoped=false;
 try{
  const base=process.env.PR_BASE_SHA,head=process.env.PR_HEAD_SHA;
  if(/^[a-f0-9]{40}$/.test(base||'')&&/^[a-f0-9]{40}$/.test(head||'')){
   const files=execFileSync('git',['diff','--name-only','-z',base,head],{encoding:'utf8'}).split('\0').filter(Boolean);
   scoped=affectedOnly(files);
  }
 }catch{/* Unknown comparisons always retain the existing full validation. */}
 fs.appendFileSync(process.env.GITHUB_OUTPUT,`affected_only=${scoped}\n`);
}

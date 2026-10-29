// Prepare an isolated candidate from a freshly retrieved complete Worker.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));
const baseline=fs.readFileSync(path.join(folder,'baseline','worker.mjs'),'utf8');
function replaceOnce(source,oldValue,newValue){assert.equal(source.split(oldValue).length,2,'Expected exactly one matching Worker anchor');return source.replace(oldValue,newValue);}
let next=baseline;
next=replaceOnce(next,'selfTaskContract:"line-group-bot-quick-create-v1", speedPolicy:', 'selfTaskContract:"line-group-bot-quick-create-v1", directTaskContract:"line-group-bot-direct-v2", speedPolicy:');
next=replaceOnce(next,'async function assignmentMachine(request, env, { now = Date.now, directory, permission: permission2, makeService, publish } = {})','async function assignmentMachine(request, env, { now = Date.now, directory, permission: permission2, makeService, makeEditor, publish } = {})');
const original='if (route.endsWith("/self-create")) return response(await createLineSelfTask(value,env,{now,directory,permission:permission2,makeService,publish}));';
const replacement='if (route.endsWith("/direct-read")) return response(await readLineDirectTask(value,env,{directory,permission:permission2,makeEditor}));\n    if (route.endsWith("/direct-update")) return response(await updateLineDirectTask(value,env,{now,directory,permission:permission2,makeEditor,publish}));\n    if (route.endsWith("/self-create")) return response(await createLineSelfTask(value,env,{now,directory,permission:permission2,makeService,publish,trustedInputs,assignmentContract:ASSIGNMENT_CONTRACT}));';
next=replaceOnce(next,original,replacement);
const service='makeService: /* @__PURE__ */ __name222222((members22) => memoryTaskService(dailylogExecutionRelease.core, members22.people, now, (account2) => permission(env, account2, machineState).enabled), "makeService"), publish:';
const editor='makeService: /* @__PURE__ */ __name222222((members22) => memoryTaskService(dailylogExecutionRelease.core, members22.people, now, (account2) => permission(env, account2, machineState).enabled), "makeService"), makeEditor: (members22) => dailylogAllFieldsRelease.createUnifiedCloudTasks(env, async account2 => permission(env,account2,machineState).enabled, now, members22, dailylogAllFieldsRelease.core, {canManage: async account2 => permission(env,account2,machineState).admin, assertCurrent: members22.assertCurrent}), publish:';
next=replaceOnce(next,service,editor);
fs.writeFileSync(path.join(folder,'candidate','worker.mjs'),"import {readLineDirectTask,updateLineDirectTask} from './line-task-reply-worker.mjs';\n"+next);
for(const [from,to] of [['line-self-task-worker.mjs','line-self-task.mjs'],['line-task-reply-worker.mjs','line-task-reply-worker.mjs'],['line-task-dates.mjs','line-task-dates.mjs']])fs.copyFileSync(path.resolve(__dirname,'../core',from),path.join(folder,'candidate',to));
console.log('Prepared isolated Worker candidate from exact baseline.');

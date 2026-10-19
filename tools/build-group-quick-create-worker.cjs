const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const folder=process.argv[2];assert(path.isAbsolute(folder||''));
const baseline=fs.readFileSync(folder+'/baseline/worker.mjs','utf8');
assert.equal(baseline.split('contract: ASSIGNMENT_CONTRACT, speedPolicy:').length,2,'Current task health marker must match once');
const anchor="if(route.endsWith('/meeting-publish'))";
assert.equal(baseline.split(anchor).length,2,'Locate original authenticated machine route once');
// These identifiers belong to the existing authenticated assignmentMachine scope.
const replacement="if (route.endsWith(\"/self-create\")) return response(await createLineSelfTask(value,env,{now,directory,permission:permission2,makeService,publish}));\n  "+anchor;
assert(baseline.includes('permission: permission2')||baseline.includes('permission:permission2'));
fs.writeFileSync(folder+'/candidate/worker.mjs',"import {createLineSelfTask} from './line-self-task.mjs';\n"+baseline.replace(anchor,replacement).replace('contract: ASSIGNMENT_CONTRACT, speedPolicy:', 'contract: ASSIGNMENT_CONTRACT, selfTaskContract:"line-group-bot-quick-create-v1", speedPolicy:'));
fs.copyFileSync(path.resolve(__dirname,'../core/line-self-task-worker.mjs'),folder+'/candidate/line-self-task.mjs');
console.log('Extended exact current task-service route; all other modules and Assets retained.');

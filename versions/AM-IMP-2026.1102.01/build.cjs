const assert=require('node:assert/strict');
exports.patchWorker=source=>{
 const needle='    if (route.endsWith("/direct-read")) return response(await readLineDirectTask(value,env,{directory,permission:permission2,makeEditor}));';
 assert.equal(source.split(needle).length,2,'Live Worker has changed; inspect before patching');
 assert(!source.includes('line-quoted-progress-worker.mjs'),'Patch already applied');
 return 'import {recordQuotedProgress} from "./line-quoted-progress-worker.mjs";\n'+source.replace(needle,needle+'\n    if (route.endsWith("/quoted-progress")) return response(await recordQuotedProgress(value,env,{now,directory,permission:permission2,makeEditor,publish}));');
};

const assert=require('node:assert/strict');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Live source changed: '+a.slice(0,100));return s.replace(a,b);};
exports.patchWorker=function(source){
 // Sharing checks need ancestor identity/role/version fields, never its full
 // journal, attachment or edit history. Return the original task objects.
 // Preserve the original JavaScript `createdBy.account || history creator`.
 // SQL COALESCE alone does not fall back for empty strings, false or numeric 0.
 const creator=`json(CASE WHEN json_type(w.value,'$.createdBy.account') IS NULL
 OR json_type(w.value,'$.createdBy.account') IN ('null','false')
 OR (json_type(w.value,'$.createdBy.account') IN ('integer','real') AND json_extract(w.value,'$.createdBy.account')=0)
 OR (json_type(w.value,'$.createdBy.account')='text' AND json_extract(w.value,'$.createdBy.account')='')
 THEN (SELECT h.value -> '$.actor.account' FROM json_each(w.value,'$.history') h WHERE json_extract(h.value,'$.kind')='created' LIMIT 1)
 ELSE w.value -> '$.createdBy.account' END)`;
 const fields=`json_object('id',w.id,'version',json(w.value -> '$.version'),
 'primaryParentId',json_extract(w.value,'$.primaryParentId'),'workScope',json_extract(w.value,'$.workScope'),
 'mergedInto',json_extract(w.value,'$.mergedInto'),'status',json_extract(w.value,'$.status'),
 'level',json_extract(w.value,'$.level'),'requester',json_extract(w.value,'$.requester'),
 'lead',json_extract(w.value,'$.lead'),'collaborators',json_extract(w.value,'$.collaborators'),
 'sharedWith',json_extract(w.value,'$.sharedWith'),
 'createdBy',json_object('account',${creator}))`;
 // An absent version is undefined in the old parsed task, not JSON null.
 // Keep JSON booleans distinct from SQLite integer 0/1 as well.
 const projection=`CASE WHEN json_type(w.value,'$.version') IS NULL THEN json_remove(${fields},'$.version') ELSE ${fields} END AS value`;
 source=once(source,') SELECT w.value FROM work_items w JOIN ancestry a ON a.id=w.id',') SELECT '+projection+' FROM work_items w JOIN ancestry a ON a.id=w.id');
 const original='const rows2 = await db.prepare("SELECT id,value FROM work_items WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify([...versions.keys()])).all();\n  if (rows2.results.length !== versions.size || rows2.results.some((r) => JSON.parse(r.value).version !== versions.get(r.id))) throw fail();';
 const replacement='const rows2 = await db.prepare("SELECT id,json_extract(value,\'$.version\') AS version,json_type(value,\'$.version\') AS version_type FROM work_items WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify([...versions.keys()])).all();\n  if (rows2.results.length !== versions.size || rows2.results.some((r) => (r.version_type===null?undefined:r.version_type===\'true\'?true:r.version_type===\'false\'?false:r.version) !== versions.get(r.id))) throw fail();';
 source=once(source,original,replacement);
 const defaults=[...source.matchAll(/\b([A-Za-z_$][\w$]*)\s+as\s+default\b/g)];assert.equal(defaults.length,1);assert(!source.includes('operation_speed_worker'));
 const previous=defaults[0][1];source=once(source,previous+' as default','operation_speed_worker as default');
 return "import {operationSpeedResponse} from './operation-speed.mjs';\n"+source+`\nconst operation_speed_worker={...${previous},async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await ${previous}.fetch(request,env,ctx),env,start);}};\n`;
};
exports.patchOrigins=function(source){
 const start=source.indexOf('  for (let offset = 0; offset < ids.length; offset += 70) {');
 const end=source.indexOf('  const meetingIds = ',start);assert(start>=0&&end>start,'Origin read baseline changed');
 const block=source.slice(start,end);
 const sql=block.match(/env\.DB\.prepare\(`([\s\S]+?)`\)\.bind\(env\.LEAF_TASK_TENANT \|\| '', \.\.\.batch\)\.all\(\)/);assert(sql,'Original tenant-scoped origin query missing');
 const query=sql[1].replace('WHERE w.id IN (${batch.map(() => \'?\').join(\',\')})','WHERE w.id IN (SELECT value FROM json_each(?))');assert(!query.includes('${'),'Unexpected SQL interpolation');
 return source.slice(0,start)+`  if(ids.length){\n    const result=await env.DB.prepare(\`${query}\`).bind(env.LEAF_TASK_TENANT||'',JSON.stringify(ids)).all();\n    rows.push(...result.results);\n  }\n`+source.slice(end);
};

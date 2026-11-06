import crypto from 'node:crypto';

export const WORKSPACE_REFRESH_CONTRACT='authorized-workspace-sections-v1';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('base64url');

// This is transport compaction, not a permission/content cache. Call only after
// reading current access and current section values. Changed job/task status,
// sharing and language are observed even when the document revision is equal.
export function workspaceResponse(result,input,audience=result.actor?.id||result.actor?.name){
 const scope=digest([result.workspace.id,result.access,audience,result.host,result.experience?.locale]);
 const keys=Object.fromEntries(Object.entries(result).filter(([key])=>key!=='audioUrl').map(([key,value])=>[key,digest(value)]));
 const refresh={contract:WORKSPACE_REFRESH_CONTRACT,scope,keys};
 const known=input.action==='read'&&input.known;
 if(!known||known.contract!==refresh.contract||known.scope!==scope||!known.keys||typeof known.keys!=='object'||Array.isArray(known.keys)||Object.keys(known.keys).length>50)return {...result,refresh};
 const values=Object.fromEntries(Object.entries(result).filter(([key])=>key==='audioUrl'||known.keys[key]!==keys[key]));
 return {ok:true,delta:true,base:scope,values,removed:Object.keys(known.keys).filter(key=>!Object.hasOwn(keys,key)),refresh};
}

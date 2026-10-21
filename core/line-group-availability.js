// Availability for selecting a current LINE destination. Historical records
// are retained; a failed read never rewrites a group's saved state.
export const LINE_GROUP_OPTIONS_POLICY='current-available-line-groups-v1';
const disabled=new Set(['停用','已停用','disabled','inactive','left','blocked','deleted']);
export function groupOptionEnabled(row){
 return !!row&&!disabled.has(String(row.status||row.legacy_status||'').trim().toLowerCase())
  &&!disabled.has(String(row.connection_state||row.presence||'').trim().toLowerCase());
}
export function createLineGroupAvailability(lineGet){
 async function available(row){
  const kind=row?.source_kind||row?.kind||'group',id=row?.source_id||row?.groupId;
  if(kind==='user')return true; // Personal conversations keep their original rules.
  if(!groupOptionEnabled(row))return false;
  if(!['group','room'].includes(kind)||!new RegExp('^'+(kind==='group'?'C':'R')+'[a-f0-9]{32}$','i').test(id||''))return false;
  try{
   const result=await lineGet(`/v2/bot/${kind}/${id}/${kind==='group'?'summary':'members/count'}`,{timeoutMs:2000});
   return kind==='group'?result?.groupId===id:Number.isSafeInteger(result?.count)&&result.count>=0;
  }catch{return false;}
 }
 async function filter(rows,model=r=>r){
  const keep=new Array(rows.length).fill(false);let next=0;
  await Promise.all(Array.from({length:Math.min(5,rows.length)},async()=>{while(next<rows.length){const i=next++;keep[i]=await available(model(rows[i]));}}));
  return rows.filter((_,i)=>keep[i]);
 }
 return {available,filter};
}

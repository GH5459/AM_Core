export const UOF_READ_SPEED_POLICY='request-scoped-display-reads-v1';

// Display metadata only: submission/ticket verification still uses the original
// fresh canApprove(account,snapshot). Nothing survives this list operation.
export async function displayItems(app,account,values){
 if(values.some(snapshot=>snapshot.account!==account))throw Object.assign(Error('案件身分無法確認。'),{status:403,code:'CASE_OWNER_MISMATCH'});
 if(values.length<3)return Promise.all(values.map(snapshot=>app.item(snapshot)));
 const allowed=await app.canApprove(account),context={account,allowed};
 const items=await Promise.all(values.map(snapshot=>app.item(snapshot,false,false,context)));
 // Preserve revocation during rendering; this flag never grants signing rights.
 if(allowed&&!await app.canApprove(account))for(const item of items)item.approvalEnabled=false;
 return items;
}

export function displayApproval(app,snapshot,context){
 if(!context)return app.canApprove(snapshot.account,snapshot);
 if(context.account!==snapshot.account)throw Object.assign(Error('案件身分無法確認。'),{status:403,code:'CASE_OWNER_MISMATCH'});
 return !!context.allowed&&(snapshot.signerGuid.toLowerCase()===snapshot.actualSignerGuid.toLowerCase()||(app.env.DELEGATED_ACCOUNTS||'').split(',').includes(snapshot.account));
}

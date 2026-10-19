export const GROUP_INVITE_TIMEOUT_MS=10*60*1000;
export const GROUP_INVITE_TIMEOUT_POLICY='group-invite-silent-timeout-10m-v1';
// A replacement card does not renew the original invitation window. Old cards
// without a delivery timestamp use source time, so deployment cannot revive them.
export function invitationDeadline(row,p=row.dispatch){
  if(!['meeting','selftask'].includes(p.mode)||!['preview','confirmation'].includes(p.phase))return null;
  if(p.phase==='preview'&&p.revision===1&&p.confirmationStartedAt===undefined)return null;
  const started=p.confirmationStartedAt??row.event.timestamp;
  return Number.isFinite(started)?started+GROUP_INVITE_TIMEOUT_MS:0;
}
export function invitationTimedOut(row,p,at){const deadline=invitationDeadline(row,p);return deadline!==null&&deadline<=at;}
export function cancelTimedOutInvitation(p,at){return {...p,phase:'cancelled',closedReason:GROUP_INVITE_TIMEOUT_POLICY,cancelledAt:at,
  history:[...(p.history||[]),{action:'auto_cancel',reason:GROUP_INVITE_TIMEOUT_POLICY,timestamp:at}]};}

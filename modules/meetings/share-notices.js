// Retired: meeting shares are discovered inside the recipient's Rich Menu hub.
// Keep the former interface safe for callers from older packages. No network,
// queue creation, retry or message transmission is allowed through this facade.
export function meetingShareNotices(){return {status:async()=>[],drain:async()=>{}};}

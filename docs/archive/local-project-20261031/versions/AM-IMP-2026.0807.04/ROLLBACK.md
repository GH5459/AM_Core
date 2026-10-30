# Rollback

1. Hide new Portal navigation entries.
2. Disable `amIdentity.bindingIssueEnabled` and `googleCalendar.connectionEnabled`.
3. Leave existing sessions and legacy Portal route intact.
4. Preserve audit rows and connection metadata.
5. Revert UI code by normal revert PR if needed.

Do not delete tenant members, binding rows, Google credential references or sync failure records during UI rollback.

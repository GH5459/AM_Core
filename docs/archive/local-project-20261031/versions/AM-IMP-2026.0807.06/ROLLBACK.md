# Rollback

1. Disable `googleCalendar.projectionEnabled`.
2. Disable `googleCalendar.companyCalendarsEnabled` and `googleCalendar.personalCalendarsEnabled` if needed.
3. Stop outbox leasing/sending.
4. Keep credential reference, target rows, event links and failure records.
5. Do not delete AM/Rental Calendar source records.
6. Do not use Google as a reverse source during rollback.

If token or ACL security is suspected, revoke the credential in the provider/admin console and record the revocation in the tenant audit log.

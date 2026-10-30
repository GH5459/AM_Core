# Rollback

1. Disable `calendarHub.enabled`.
2. Disable backend-specific write flags.
3. Keep read-only legacy Calendar path available where it exists.
4. Preserve Calendar items, event links, outbox and failure records.
5. Revert adapter code by normal revert PR if needed.

Do not delete Calendar source records or event mappings during rollback.

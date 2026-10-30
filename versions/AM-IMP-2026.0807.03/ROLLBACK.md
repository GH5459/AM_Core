# Rollback

Rollback is flag-first and data-preserving.

1. Disable `personalAssistant.proactivePushEnabled`.
2. Disable binding issue and consume.
3. Set `amIdentity.authority=compare` or `legacy`.
4. Hide the Portal binding entry if needed.
5. Keep identity rows, binding rows, challenge audit, revocation audit and legacy refs.
6. Reconcile mirror/outbox lag before deciding whether legacy should remain the operational authority.

Do not delete identity or audit rows during rollback. They are needed to avoid losing new bindings and to explain previous access decisions.

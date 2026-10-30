# Rollback

Rollback is additive and non-destructive.

1. Set `lineConversationReadSource=legacy`.
2. Disable direct capture, dual write, projection repair, storage, and registry in that order.
3. Keep all created Conversation, Message, attachment, member, binding-period, and route-audit records.
4. Do not delete, merge, copy, or move tenant history.
5. Do not revoke identity or group bindings as part of this rollback.
6. Record the rollback in the target project's upgrade record and manifest.

If a projection is corrupt, stop reads from it and produce an auditable repair plan. Deletion or Conversation merging requires a separate, explicit owner-approved data-repair procedure.

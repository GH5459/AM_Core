# Rollback

This package is read-only and flags-off by default.

Rollback steps:

1. Remove the npm readiness scripts from the target project.
2. Remove `src/line-conversation-readiness.js`.
3. Remove `scripts/verify-line-conversation-readiness.mjs`.
4. Remove the `lineConversationStorage` field from `/health`.
5. Keep all `AM-IMP-2026.0808.01` feature flags off.

No tenant data should be deleted because this package does not create or mutate
tenant records.

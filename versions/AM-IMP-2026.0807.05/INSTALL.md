# Install

1. Install identity context from `AM-IMP-2026.0807.03`.
2. Add backend registry and Calendar tables with additive migrations.
3. Implement a backend adapter for the project: Rental Calendar V2 for HOZO, AM Calendar Core for new tenants unless otherwise decided.
4. Keep `calendarHub.enabled=false` until tests pass.
5. Enable read-only query before writes.
6. Enable writes only after idempotency and action-policy tests pass.

Do not migrate HOZO Rental Calendar in one step. Use adapter, dual-read and reconciliation.

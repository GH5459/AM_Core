# Install

1. Install `AM-IMP-2026.0807.05` first.
2. Add tenant-scoped projection tables with additive migrations.
3. Configure OAuth callback with exact redirect allowlist and state validation.
4. Store OAuth client secret and refresh token only in production secret storage.
5. Register credential reference in the tenant-local configuration.
6. Keep `googleCalendar.projectionEnabled=false` until manual OAuth and smoke tests pass.
7. Create or register secondary calendars before event projection.

Suggested enablement order:

1. connection enabled, projection disabled;
2. company calendar target only;
3. one canary person target;
4. idempotent create/update/cancel smoke;
5. small HOZO canary;
6. tenant-by-tenant rollout.

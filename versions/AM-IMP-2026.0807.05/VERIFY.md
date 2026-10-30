# Verify

Run from AMCore:

```powershell
node tools/check-upgrade-package.js AM-IMP-2026.0807.05
node tools/verify-am-platform-standardization.mjs
```

Project-local verification:

- one contract can create/query/update/cancel items through HOZO Rental adapter and one non-HOZO test backend;
- private items are visible only to owner;
- company items are visible according to tenant membership;
- due date does not change when planned date changes;
- all-day and timed items preserve `Asia/Taipei`;
- idempotent upsert replays do not create duplicates;
- missing tenant context and cross-tenant access are denied;
- backend unavailable creates a failure record and does not fallback across tenant.

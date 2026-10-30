# Verify

Run from AMCore:

```powershell
node tools/check-upgrade-package.js AM-IMP-2026.0807.03
node tools/verify-am-platform-standardization.mjs
```

Project-local verification must cover:

- binding code success, wrong code, expiry, replay and concurrent consume;
- already-bound LINE, already-bound person, conflict and revoke/rebind;
- one person with multiple tenant memberships;
- one tenant with multiple LINE official account connections;
- different LINE connections with the same external subject namespace safely separated;
- private active workspace routing;
- group binding routing independent of private workspace;
- wrong channel secret rejected;
- LINE event retry idempotency;
- RLS denial when tenant context is missing or different.

# Verify

Run from AMCore:

```powershell
node tools/check-upgrade-package.js AM-IMP-2026.0807.04
node tools/verify-am-platform-standardization.mjs
```

Project-local verification:

- unauthenticated users cannot see Portal identity pages;
- inactive membership cannot issue a binding code;
- member cannot manage tenant LINE connections;
- tenant admin can create/revoke group binding without seeing channel secret;
- CSRF failure rejects mutation;
- request ID appears in safe error output;
- secrets, raw external subjects and full Google credential details do not appear in HTML or JSON responses;
- legacy Rental Portal route still works while compatibility flag is on.

# Verify

Run from AMCore:

```powershell
node tools/check-upgrade-package.js AM-IMP-2026.0807.06
node tools/verify-am-platform-standardization.mjs
```

Project-local verification:

- OAuth `state` rejects tenant/session/nonce mismatch;
- refresh token is absent from DB rows, logs, health output and Git;
- company item projects only to company calendar;
- private item projects only to that person's work calendar;
- one item replayed ten times still has one Google event;
- update/move updates the same event;
- cancel updates or deletes the same event according to policy;
- 401, 403, 429, 5xx, timeout and token revoke create failure records;
- disabling projection does not stop AM/Rental Calendar source writes;
- Google event description excludes private note, raw LINE user ID, source evidence text and sensitive financial data.

# Task read identity

GET `/api/tasks` and its existing detail/people routes previously requested a complete internal auth-session response for multilingual identity. That response calculated supervisor availability even though these reads only needed the verified account. The normal list then calculated supervisor availability again while taking only `profile`.

`task-read-identity.mjs` transfers the verified identity through a capability on the exact internal `Request`. It still uses the original session route, including current access synchronization, session expiry and reinstatement rules, registration status, and the original first-registration wait. The internal response has no JSON body. Public session requests retain the complete original response. No public route or request header grants this capability; state is removed in `finally` and cannot be shared across requests.

The task GET profile still reads the current profile and original permissions, but omits unused supervisor availability. Writes, HEAD and unrelated routes keep the default complete profile. All original task authorization, sharing, alias, directory and final fresh checks remain in place. There is no time-based permission cache or additional background request.

To apply to an independently downloaded, complete current deployment:

1. Load `patch-worker.cjs` and call `patchWorker` on `worker.mjs`.
2. Call `patchMultilingual` on `multilingual-dailylog.mjs`.
3. Add `task-read-identity.mjs` beside those modules and retain every other original module and deployment setting.

The patches require each anchor exactly once and reject source drift or repeated application. Reconcile against a fresh deployment before releasing.

Portable CI: `node --test task-read-identity.test.cjs` (12 tests). These are synthetic unit and patch-guard tests, not a complete Worker test. The separate private full-Worker/D1 evidence covers matching response bytes, registration, multilingual/HR/library/shared/alias access, revocation and reinstatement, stale directory synchronization, final-check races, original write protection and ancestry sharing. Synthetic delayed-dependency timing demonstrates removed work; it is not a production or physical-phone speed claim.

# Verify

Run `node --test tools/test-login-continuation.mjs tools/test-login-continuation-authority.mjs` for candidate logic only. Current tests use isolated authorities and in-memory storage; the PostgreSQL adapter test checks emitted SQL, not a live database.

Still required: actual PostgreSQL race tests; latest complete DailyLog Worker/D1 and encrypted UOF storage; server-to-server authentication and replay defense; same-browser and separated browser flows; URL cleanup and cookie boundaries; logout and source expiry across all sites; full existing regressions and current-head CI. New feature must remain disconnected until these pass.

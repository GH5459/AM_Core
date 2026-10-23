# Verify

Run `node --test tools/test-login-continuation.mjs tools/test-login-continuation-authority.mjs tools/test-login-continuation-postgres.mjs` for candidate logic. Authorities are isolated fixtures. The PostgreSQL adapter is additionally exercised in a real isolated PGlite engine, including 12 concurrent exchanges and preservation of a separate fixture business table. This does not test the deployed PostgreSQL service or any production data.

Still required: actual broker with authenticated source proof adapters; latest complete DailyLog Worker/D1 and encrypted UOF storage integration; server-to-server authentication and replay defense; same-browser and separated browser flows; URL cleanup and cookie boundaries; logout and source expiry across all sites; full existing regressions and current-head CI. New feature must remain disconnected until these pass.

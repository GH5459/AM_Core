# Verification

Run `node --test tools/test-line-work-login.mjs tools/test-work-journal-entry.mjs tools/test-leaf-tasks.mjs`. Check shared package structure and cross-project alignment, recording warnings about unrelated targets separately.

At DailyLog run local synthetic SQLite tests, original compiled worker/session plus D1 tests, login UI tests and six widths. Unknown native identity with a stale browser cookie must stay at login. Fresh successful company login with work-only access must confirm the mapping; bad password, disabled access, expired ticket, wrong account or native reverse conflict must fail. Replays must not overwrite identities. Live membership and current target access still protect assignment.

Verify both deployed module/version and preserved latest full assets/bindings/cron. Root purpose login-health checks the contract without issuing tickets or changing identities. Real coworker login and subsequent mention are natural acceptance, not a deployment test.

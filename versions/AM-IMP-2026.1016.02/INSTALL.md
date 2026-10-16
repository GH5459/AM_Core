# Install

1. Recheck current AM main and live commit. Use an isolated clean worktree; merge reviewed PR with passing CI before AM deployment.
2. Fetch the original DailyLog active immutable version, all modules, settings and schedules into original private storage. Refuse stale source or a newer uploaded etag. Preserve current Assets with keep_assets; never build the dirty checkout or publish the test public directory.
3. Apply only worker export wrapper, line-task-edit-entry.mjs and the new quoted endpoints in line-task-photos.mjs. No schema changes. Run tests before upload; preserve original services, secrets, vars, compatibility and cron.
4. Release DailyLog first, then AM, and verify both. Retain the original authorized group pilot hash and activation time; no expansion to other OAs/groups or account changes.
5. Do not replay real conversations or create tasks for deployment tests. Leave existing cancelled session expired.

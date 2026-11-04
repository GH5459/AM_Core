# Verify
Run node --test tools/test-leaf-tasks.mjs tools/test-leaf-task-edit.mjs and the existing full CI. Check the protected /portal/admin/leaf-tasks/service-health endpoint; it only reads configuration and remote health, never next/claim/intake. Observe sanitized scheduler warnings in production. Fix the observed cause and verify no warning recurrence before claiming recovery.

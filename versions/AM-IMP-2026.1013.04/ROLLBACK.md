# Rollback

Revert only this PR on AM Platform main and verify both health origins. Deploy the project-local saved previous DailyLog version after verifying no subsequent release would be overwritten. Existing Google event series and source evidence must remain intact. No schema migration or business data restoration is required. Previously confirmed recurrence payloads require the recurrence-capable API to complete, so pause/review them before reverting that adapter; do not convert them to single events.

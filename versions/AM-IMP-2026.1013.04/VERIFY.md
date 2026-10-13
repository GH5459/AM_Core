# Verification

- node --test tools/test-calendar-recurrence.mjs
- node --experimental-vm-modules --test tools/test-leaf-calendar.mjs tools/test-leaf-groups.mjs
- DailyLog: node scripts/release-weekly-calendar.cjs validate (native RRULE, complete production Worker with isolated SQLite and Google stub; permissions and sharing regression).
- Match deployed DailyLog module hash; assets, bindings and schedules remain identical. Use an invalid frequency with a synthetic absent account to prove production recurrence validation without any Google write.
- Root health must show v3 contract and DAILY/WEEKLY/MONTHLY.
- Confirm a recurring draft is not written before the original owner click; repeated confirmation/retry writes one series. Invalid weekdays, contradictory start date, invalid until/count and raw RRULE are rejected.
- No claim of real handset or real recurring event acceptance until a person submits and confirms an actual request.

# Lunar calendar release

Status: Deployed (root OA and configured original DailyLog only).

- PR373 final head fd90963 passed the complete workflow in4m12s and merged as28bf2aea827382da24466c460d9b9dac23c79f2e. Exact commit manually deployed via Render dep-dbb26b8m7kps73aou2tg, Live45.4s. Both production health origins confirm v4, lunarYearly/allDay and2100 horizon; original configured tenant retained.
- DailyLog version5faa7cfc-74ad-42cb-969b-687677ad857f at100% from fresh concurrent baseline e6b72e23-880f-4321-a475-3b116bb95dc4. Only calendar core in worker.mjs replaced; other50 modules, assets, secrets/bindings, settings and cron preserved. Complete Worker test rerun against latest full51 modules.
- 32 root calendar checks and12 DailyLog checks passed, including PostgreSQL isolation, owner confirmation, replay, exact native all-day payload, leap-month behavior and actual workerd Chinese calendar conversion. Fictional lunar10/17 yields2026-11-25 and2027-11-14,75 occurrences through2100. Live malformed lunar request returned400 INVALID_REQUEST before account resolution/Google access.
- Package check passed. Legacy alignment audit and manifest comparison ran; historical standalone alignment remains incomplete and is not claimed by this root-only release. No standalone HOZO/Seven installation.
- No original messages replayed, no real LINE test messages sent, and no real Google Calendar events created by verification. Existing source evidence and real business data were not migrated. User can resend the original request and confirm its card.
- Private deployment receipts, module hashes and screenshot remain outside tracked shared sources.

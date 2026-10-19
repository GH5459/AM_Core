# Meeting Calendar recovery — 2026-10-19

AM-IMP-2026.1019.71 repairs the original meeting Calendar service and keeps today's ended events available for later explicit filing and recording upload.

The active full DailyLog main module retained the `/calendar/events/meetings` route, but its lunar-capable replacement factory returned only key/authorize/createEvent. Authenticated requests therefore failed with `TypeError: bot.meetingEvent is not a function` before Google was called. The repair adds its original database dependency and meeting adapter to that same factory; all lunar logic remains byte-identical. The complete Worker integration test includes .js dependencies added by recent unrelated releases.

Calendar list queries now use the selected window start. Single-event reads allow events ending after today's Taiwan midnight; cancelled, declined, prior-day and changed-binding records remain blocked. The hub keeps ended saved meetings in today's selected calendar and retains the existing pending/history sections. Opening an unfiled event only previews the original title/time and asks for a source; explicit confirmation is required to create a workspace. It does not create another Google event.

Status: Ready. Production receipts will be recorded after exact deployment verification. Private event titles, accounts, recordings, credentials, snapshots and screenshots stay outside Git. HOZO_AM and SevenAM are separate projects and are not deployed by this release.

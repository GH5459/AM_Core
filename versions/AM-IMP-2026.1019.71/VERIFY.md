# Verify

- `node tools/test-meeting-calendar-recovery.mjs`: Taiwan day boundary, ended-today list/read, changed bindings, cancelled and declined events, no Google writes.
- `node tools/test-meeting-calendar-factory.cjs <baseline-worker> <candidate-worker>`: actual complete latest lunar factory exposes the meeting method, unchanged lunar recurrence through 2100 and all other main-module bytes.
- `node tools/test-meeting-hub-worker.cjs <candidate-dir> <miniflare-path>`: full Worker with actual D1, service auth, read/write boundary, replay, frozen targets and original invitation preservation.
- `node tools/test-meeting-calendar-week-browser.mjs <playwright-path>`: ended-today entry opens filing form, day/week navigation, one original meeting link and mobile layout.
- `node --test tools/test-lunar-calendar.mjs tools/test-calendar-recurrence.mjs` and `node tools/test-meeting-hub.mjs`.
- Package check, alignment audit, manifest comparison and full PR CI. Preserve live business data and verify both AM origins and original DailyLog active modules/settings.
- Authenticated production UI must show the requested original event; do not claim real audio upload without the user's own upload.

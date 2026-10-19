# Install

1. Start from latest origin/main and read the actual active original DailyLog deployment. Save its complete modules, settings, immutable version and schedules privately.
2. Run `node tools/build-meeting-hub-worker.cjs <private-release-root>` against that full baseline. It repairs only the two adapter anchors in the current lunar factory and refreshes meeting-hub-calendar.mjs. Never replace the factory with older non-lunar code.
3. Verify all tests and that only worker.mjs and meeting-hub-calendar.mjs changed; all other modules, assets, secret bindings and settings remain.
4. Deploy the reviewed full DailyLog candidate under its original service and the AM hub UI from a passing PR. Check no newer version appeared before each deployment.
5. Open the original authenticated meeting hub, verify today's ended event and its explicit filing form without saving real test data.

Install other projects separately only when requested. No project-local values belong in this package.

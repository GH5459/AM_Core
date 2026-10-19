# Install

Merge reviewed root source through GitHub main after CI. Install core/leaf-calendar helpers together. Apply dailylog/calendar-bot-core.cjs, calendar-recurrence.cjs and calendar-lunar.cjs to the target DailyLog. Bundle only the calendar core into a fresh complete production module snapshot; preserve every unrelated module, assets, bindings, settings and schedules. Guard against concurrent deployment before upload and activation. No database migration or new secrets. Deploy DailyLog before the root OA. Install into other projects separately only when requested.

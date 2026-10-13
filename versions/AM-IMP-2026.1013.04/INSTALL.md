# Installation

1. Prepare the DailyLog adapter from the exact latest verified complete production module; patch only the existing calendar-bot-core function scope and preserve all assets, secret bindings, vars, services and cron. Do not build the dirty DailyLog checkout. Install adapters/dailylog/calendar-recurrence.cjs beside calendar-bot-core.cjs for future source builds.
2. Run source and full Worker/D1 tests with isolated Google transport. Upload then deploy the DailyLog version, compare production module hash, bindings and cron, and run a validation-only authenticated probe.
3. Install AM Platform root source through a reviewed main PR after CI. Keep database schema, tenant and UOF identity bindings unchanged. Verify both production health origins identify structured-recurrence-v1.
4. Record project-local deployment versions and run alignment audit. Existing old unhandled messages are not replayed automatically.

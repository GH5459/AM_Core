# AM-IMP-2026.0807.05 AM Calendar Hub

This package defines the shared Calendar Hub contract for AM Platform.

HOZO can continue through the Rental Calendar V2 adapter. New tenants can use AM Calendar Core. Both must expose the same canonical DTO and action policy rules.

Google Calendar is not part of this package as a source of truth. It is handled by `AM-IMP-2026.0807.06` as a projection provider.

## Included Files

- `config/am-calendar-hub-contract.json`
- `contracts/calendar-backend-adapter-interface.json`
- `schemas/am-calendar-hub-postgres.sql`

## Non-Negotiables

- `dueAt` and `plannedStartAt` are separate.
- `carried_over` is an audit/log action, not a stored status.
- `overdue` is computed, not stored as a status.
- AM source items can remain `view_only` until write-back is separately approved.

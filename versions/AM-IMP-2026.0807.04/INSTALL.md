# Install

1. Install `AM-IMP-2026.0807.03` first.
2. Add Portal routes behind existing session authentication.
3. Add CSRF protection to all mutations.
4. Add pages in two sections: personal area and tenant/platform management area.
5. Keep new navigation entries hidden until feature flags are enabled.
6. Keep the legacy Rental Portal entry during compatibility period.

Required flags:

- `amIdentity.enabled`
- `amIdentity.bindingIssueEnabled`
- `lineConnections.enabled`
- `calendarHub.enabled`
- `googleCalendar.connectionEnabled`

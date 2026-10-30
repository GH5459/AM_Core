# AM-IMP-2026.0807.04 AM Portal Identity and Connection Management

This package defines AM Portal as the control surface for identity, LINE and Calendar setup.

The Portal labels should use:

- `LINE official account and AI assistant`
- `My LINE binding`
- `LINE group management`
- `Calendar backend`
- `Google Calendar connection`
- `Sync failures and audit`

Avoid wording that suggests a human customer-service contact window.

## Included Files

- `config/am-portal-connection-management-contract.json`
- `contracts/am-portal-routes.json`
- package lifecycle documents

## Security Baseline

- Browser requests may choose an active workspace only among memberships already tied to the authenticated person.
- Browser requests cannot supply another person's ID to read private Calendar or binding data.
- Tenant admin actions require tenant admin or narrower delegated admin capabilities.
- Portal must display request ID, build marker and safe repair steps when errors occur.

# AM Platform Identity, LINE and Calendar Standardization M0 ADR

Date: 2026-08-07  
Status: Accepted for implementation baseline  
Owner: Control Tower session  
Scope: AMCore shared contracts and upgrade packages

## Decision

AMCore remains the shared architecture, package and verification center. The short-term AM Platform production source remains the existing `sevenchen611/AM_Core` deployment path recorded by the HOZO Calendar passdown, with the explicit label "transition architecture." Creating a separate `AM_Platform` repository is deferred to a later project because repo migration and identity-platform rebuilding should not happen in the same release train.

AM Portal is the user-facing control entry for identity, tenant membership, LINE official account and AI assistant connections, group routing, Calendar backend settings, Google Calendar projection settings, sync status and audit review.

LINE identity binds to an AM person through a namespaced external identity. A LINE user ID is never the tenant identity by itself. Tenant access comes from active membership, private chats use active workspace routing, and group chats use group binding.

Google Calendar is a one-way projection provider. Rental Calendar or AM Calendar remains the source of truth. Google refresh tokens and client secrets live only in production secret storage. AMCore may store only credential reference rules, contracts and non-secret setup instructions.

## Context

The handoff file says the previous HOZO-specific LINE binding and Rental Calendar work must become a reusable AM Platform foundation for HOZO AM 2.0, Forest AM, Green Hotel AM and Seven AM.

The HOZO Calendar passdown records:

- AM Platform production URL: `https://am.hozorental.com`
- AM Platform Render service: `am-platform`
- AM Platform GitHub repo: `sevenchen611/AM_Core`
- Rental Calendar production URL: `https://rental.hozorental.com`
- Rental GitHub repo: `sevenchen611/rental-management-blueprint`
- Google Calendar OAuth, secondary calendars, ACL and event projection are not complete.

This session could confirm the local `origin/main` points at `f261d0c`, matching the passdown. A fresh `git fetch origin --prune` timed out and is tracked as a blocker, so all production source claims remain "recorded by passdown, pending live verification."

## Consequences

- New packages are published as AMCore shared packages and remain `Ready`, not `Deployed`.
- No production secret, raw LINE user ID, Google refresh token, person ID or tenant live data is stored in AMCore.
- All schema guidance is additive and rollback-preserving.
- New runtime behavior must default to feature flags off.
- Production proof is required per tenant before any tenant manifest can be marked `Deployed`.

## Package Allocation

| Package | Purpose |
| --- | --- |
| `AM-IMP-2026.0807.03` | AM Identity and LINE Connection Registry |
| `AM-IMP-2026.0807.04` | AM Portal Identity and Connection Management |
| `AM-IMP-2026.0807.05` | AM Calendar Hub |
| `AM-IMP-2026.0807.06` | Google Calendar Projection Provider |

## Open Verification

- Re-run `git fetch origin --prune` from a stable network state.
- Verify current GitHub main, PR status, Render deployment, Cloudflare deployment and `/health` build marker.
- Confirm whether Forest and Green Hotel are still shadow tenants before enabling formal identity/calendar features.
- Establish Seven AM platform tenant UUID, membership registry and migration/adapter decision before onboarding.

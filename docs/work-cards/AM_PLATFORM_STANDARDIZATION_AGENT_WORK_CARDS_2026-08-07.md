# AM Platform Standardization Work Cards

Date: 2026-08-07
Control Tower branch: `codex/am-platform-identity-calendar-standardization`
Worktree: `C:\Users\seven\CodexWorktrees\AM_Core-calendar-binding`

## Agent A: AM Identity and LINE Core

Goal: Implement the AM Identity and LINE Connection package after the M1 contract is accepted.

Repository: AMCore, then project-local installs for HOZO AM 2.0, Forest, Green Hotel and Seven AM.
Branch: `codex/am-identity-line-core` in each target repo/worktree.
Allowed files: identity modules, LINE connection registry modules, additive migration files, identity/LINE tests, package `AM-IMP-2026.0807.03`.
Forbidden files: production secrets, tenant live data, `docs/HOZO_UNIFIED_CALENDAR_RULES.md`, shared routing hotspots unless Control Tower assigns the integration.
Input contract: `versions/AM-IMP-2026.0807.03/config/am-identity-line-contract.json`.
Outputs: additive schema, binding challenge service, direct/group routing helpers, tests and rollback notes.
Tests: package check, standardization verifier, binding success/failure/expiry/replay/concurrency tests, cross-tenant denial tests.
Rollback: flags off, authority back to `legacy` or `compare`, keep audit/binding rows.
Production/OAuth/database permissions: database migration approval required; no OAuth.

## Agent B: AM Portal, Rental Adapter and Migration

Goal: Add Portal identity/connection management screens and legacy adapter/migration tooling.

Repository: AMCore and Rental project-local repo.
Branch: `codex/am-portal-connection-management`.
Allowed files: Portal routes/pages, Rental adapter modules, migration inventory tools, package `AM-IMP-2026.0807.04`.
Forbidden files: raw LINE user IDs, person IDs in docs, `_worker.js` changes outside assigned Rental worktree, production secrets.
Input contract: `versions/AM-IMP-2026.0807.04/config/am-portal-connection-management-contract.json`.
Outputs: personal identity page, tenant connection admin page, CSRF/role checks, legacy inventory/report scripts.
Tests: Portal authorization tests, CSRF tests, legacy compare/mirror dry run, existing Rich Menu regression.
Rollback: hide Portal entries, disable binding issue/consume, keep legacy endpoint as source during compare phase.
Production/OAuth/database permissions: Portal deployment and database migration approval required.

## Agent C: Calendar Hub, Google and Quality

Goal: Build Calendar Hub contracts, Google projection provider interface and security proof scripts.

Repository: AMCore and project-local Calendar service repo.
Branch: `codex/am-calendar-hub-google-projection`.
Allowed files: Calendar Hub package `AM-IMP-2026.0807.05`, Google package `AM-IMP-2026.0807.06`, adapter/provider modules and verification scripts.
Forbidden files: Google refresh token, OAuth client secret, raw event payload with private notes or source evidence text.
Input contracts: `versions/AM-IMP-2026.0807.05/config/am-calendar-hub-contract.json`, `versions/AM-IMP-2026.0807.06/config/google-calendar-projection-contract.json`.
Outputs: backend registry, canonical DTO, Rental adapter, AM Calendar Core, projection outbox, ACL/event-link/failure tests.
Tests: idempotent upsert/cancel, due/planned separation, RLS denial, OAuth state tenant mismatch, 401/403/429/5xx failure logging.
Rollback: disable projection, keep event links/failure logs, leave source records untouched.
Production/OAuth/database permissions: database migration and Google OAuth admin approval required.

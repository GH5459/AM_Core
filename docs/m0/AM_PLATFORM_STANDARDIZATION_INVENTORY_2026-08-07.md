# AM Platform Standardization Inventory

Date: 2026-08-07  
Mode: Read-only inventory plus shared package preparation

## Local Repository State

Primary Google Drive workspace:

- Path: `G:\我的雲端硬碟\Codex 共用\AM_Core`
- Branch observed: `codex/hozo-unified-calendar-spec`
- Dirty/untracked items observed before work: `M docs/HOZO_UNIFIED_CALENDAR_RULES.md`, `?? assets/`, `?? docs/AM_PLATFORM_IDENTITY_LINE_CALENDAR_STANDARDIZATION_EXECUTION_HANDOFF_2026-08-07.md`, `?? docs/HOZO_CALENDAR_PASSDOWN_2026-08-07.md`
- Handling: preserved and not modified by this execution.

Implementation worktree:

- Path: `C:\Users\seven\CodexWorktrees\AM_Core-calendar-binding`
- Starting commit: `f261d0c` (`Merge pull request #12 from sevenchen611/codex/calendar-line-deployed`)
- Branch created: `codex/am-platform-identity-calendar-standardization`
- Reason: non-Google-Drive, clean worktree from local `origin/main`.

## Recorded Production Sources

These values are recorded from `docs/HOZO_CALENDAR_PASSDOWN_2026-08-07.md` and still require live verification before production rollout:

| Area | Recorded value |
| --- | --- |
| AM Platform URL | `https://am.hozorental.com` |
| AM Platform Render service | `am-platform` |
| AM Platform Render service ID | `srv-d97s94utrd3s739lin30` |
| AM Platform GitHub repo | `sevenchen611/AM_Core` |
| Rental Calendar URL | `https://rental.hozorental.com` |
| Rental GitHub repo | `sevenchen611/rental-management-blueprint` |

## Tenant Inventory

| Tenant | Key | UUID | Current rollout reading |
| --- | --- | --- | --- |
| HOZO AM 2.0 | `hozo-am-2-0` | `a72c78d7-5035-4e6e-8caf-9ec4d58c914f` | Deployed operational memory/full workflow/claims; Calendar LINE operations recorded as deployed in passdown. |
| Forest AM | `forest` | `aac8949f-0625-44d6-b655-57162f97143d` | Shadow operational memory deployed; formal feature enablement needs authorization gate confirmation. |
| Green Hotel AM | `green-hotel` | `6c421e02-7ef7-4f98-8acb-758224689b58` | Shadow operational memory deployed; formal feature enablement needs isolated tenant setup and proof. |
| Seven AM | pending platform tenant confirmation | pending | No local platform tenant manifest found in this repository; onboarding is blocked until tenant registry and migration/adapter decision are made. |

## Secret Reference Boundaries

- Existing platform Notion/Drive fixed identities remain governed by `docs/PLATFORM_CONNECTION_IDENTITIES.md`.
- Google Calendar projection must not reuse or assume the platform Google Drive refresh token.
- Calendar projection credentials are tenant-scoped credential references only.
- Refresh tokens, client secrets, LINE raw user IDs and machine tokens stay out of Git, health responses, logs and package files.

## Tooling Notes

- `git fetch origin --prune` from the Google Drive clone timed out.
- The root clone temporarily produced stale Git lock files while the timed-out commands were still alive; lock cleanup was not performed after local policy blocked direct removal.
- Work continued from the existing clean non-cloud worktree instead.

# Group invitation timeout

Status: Deployed. Ten-minute silence expiry for unconfirmed group activity/meeting invitations, including old cards. Original evidence is retained and expired actions cannot revive invitations. Timely confirmed fanout and task assignments retain existing behavior. Scope is this root Leaf OA across all its groups; production verified on both original service origins.

## Production verification — 2026-10-17

- Reviewed change: https://github.com/GH5459/AM_Core/pull/314; full CI run 38986872171 passed and 39 isolated group/calendar checks passed.
- Render service am-platform: deploy dep-db9dse61egvs73et22d0, selected main commit a44bb04799580fcef573eaf3307a60d18e0435bb. Previous live commit a1651c5dc055e589992d199e183b6c008b85d4c0.
- Both https://am.hozorental.com/health and https://am-platform-2ymf.onrender.com/health returned HTTP200/ok with the selected commit, lineGroupMentions enabled, confirmationTimeoutSeconds=600 and confirmationTimeoutPolicy=group-invite-silent-timeout-10m-v1. Existing recurring calendar service remains enabled/configured.
- Auto-deploy was already disabled by prior manual-specific-commit deployment; this release used the existing manual deployment flow and did not change that setting.
- No synthetic or real LINE invitations were sent to user groups and no calendar events were created as tests. Existing unanswered legacy cards are subject to quiet timeout; real handset acceptance remains separate from isolated checks. No other OA deployment claimed.
- Shared alignment audit ran and still reports legacy manifest/path gaps; no blanket alignment completion claimed. Private detailed receipt stays local.

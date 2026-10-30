# AM-IMP-2026.0808.02 LINE Conversation Activation Readiness

This package closes the engineering gap after `AM-IMP-2026.0808.01`.

`0808.01` defined the shared contract, schemas, routing rules, fixtures, and
reference storage behavior. This package installs the project-local readiness
surface needed before a production cutover:

- runtime health visibility for LINE Conversation Storage;
- project-local readiness verification scripts;
- fail-closed feature flag inspection;
- live Notion schema accessibility checks when project secrets are present;
- explicit blocking status when secrets, data source IDs, or owner-approved
  deployment proof are missing.

No production data, Notion IDs, LINE IDs, tokens, or customer messages are stored
in this package.

## Installed Project Files

Each target project receives:

- `src/line-conversation-readiness.js`
- `scripts/verify-line-conversation-readiness.mjs`
- npm scripts:
  - `line:conversation-readiness`
  - `line:conversation-readiness:strict`
- `/health` field:
  - `lineConversationStorage`

## Status

This package may be marked `Installed` after local scripts and health wiring pass.
It must not be marked `Deployed` until each project has its own production
Notion schema, Render deployment, canary routing, dual-write comparison, and
tenant isolation proof.

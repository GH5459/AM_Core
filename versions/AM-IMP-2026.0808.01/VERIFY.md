# Verify

## AMCore Package

```text
node tools/check-upgrade-package.js AM-IMP-2026.0808.01
node versions/AM-IMP-2026.0808.01/tools/verify-line-conversation-routing.mjs
node versions/AM-IMP-2026.0808.01/tools/backfill-conversations.mjs --input versions/AM-IMP-2026.0808.01/fixtures/backfill-input.example.json
node versions/AM-IMP-2026.0808.01/tools/repair-conversation-projections.mjs --input versions/AM-IMP-2026.0808.01/fixtures/projection-state.example.json
```

Expected results:

- package check reports complete;
- all 15 routing/storage cases pass;
- backfill reports one safe Conversation assignment and one `missing-verifiable-source-key` manual-review item;
- projection repair reports exactly one missing projection and never creates or deletes a Message;
- no command contacts Notion, LINE, Render, or another project.

## Project-Local Static Verification

- Project config identifies this package and keeps all six feature flags off.
- Conversations, Messages, Attachments, and Conversation Members data-source names use the project's own environment prefix.
- No raw LINE ID, Notion token, channel secret, message content, or another project's database ID is committed.
- Project manifest and `docs/upgrades/` record exist.

## Production Verification Before `Deployed`

Run all 15 cases from the fixture against a canary tenant, then verify:

- every Message has exactly one Tenant Conversation relation;
- same external ID under a different LINE Connection remains separate;
- group and room never share a key space;
- unbound content does not enter any tenant database;
- rebinding preserves the old tenant's history and starts a new Conversation;
- Notion tenant guard blocks cross-tenant query/create/update;
- retries do not duplicate Messages or page blocks;
- projection repair reconstructs missing read-model blocks;
- task reconciliation reads a single Conversation window and operation commands create no task.

Do not mark `Deployed` based only on local fixtures.

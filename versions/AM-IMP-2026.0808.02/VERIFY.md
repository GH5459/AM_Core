# Verify

Local verification is complete when:

- both project verifier scripts return JSON with `ok: true`;
- both helper files pass `node --check`;
- both project `/health` responses can expose `lineConversationStorage`;
- package completeness passes;
- AMCore alignment audit has no new package errors.

Strict production verification additionally requires:

- `NOTION_TOKEN`;
- project-local Conversations, Messages, Attachments, Conversation Members data
  source IDs;
- project-local LINE connection ID;
- project-local conversation hash secret;
- Notion data source accessibility checks;
- owner-approved Render deployment and canary proof.

Never mark `Deployed` from local fixture or config-only checks.

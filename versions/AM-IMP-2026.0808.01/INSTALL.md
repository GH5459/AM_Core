# Install

Install separately in each active project. Never copy project data or secret values between projects.

## Phase 0: Inventory

1. Confirm the project-local Conversations, Messages, Attachments, Group Bindings, Members, Tasks, identities, memberships, and judgment-rules data sources.
2. Confirm whether authorized direct messages are currently persisted. Do not assume historical direct content exists.
3. Confirm every configured Notion data source belongs to the target tenant's parent boundary.

## Phase 1: Contract and Additive Schema

1. Copy `config/line-conversation-storage-contract.json` into the target project as a project-local config.
2. Add the four generic data-source keys: `conversations`, `messages`, `attachments`, and `conversationMembers`.
3. Apply `schemas/notion-conversations.schema.json` and the Messages/member additive patches. Add missing fields only; stop on type mismatch.
4. Install the Platform Conversation/binding-period metadata schema in the platform routing store, not in AMCore.
5. Deploy code with every feature flag off.

## Phase 2: Dry Run and Historical Plan

1. Run the 15-case verifier in this package.
2. Export project-local historical message metadata without secrets.
3. Run `tools/backfill-conversations.mjs` in dry-run mode.
4. Review every `manualReview` item. Never merge by display name.
5. Use a project-local adapter for actual Notion writes only after the plan is approved.

## Phase 3: Safe Enablement

Enable in this order:

1. `lineConversationRegistry.enabled=true`
2. `lineConversationDualWrite.enabled=true`
3. verify idempotency, relations, attachments, tenant isolation, and projection repair
4. `lineConversationDirectCapture.enabled=true` for already-authorized direct conversations
5. `lineConversationReadSource=conversation` for task judgment and User UI
6. stop obsolete legacy projection only after production comparison succeeds

`lineConversationStorage.enabled=true` requires both project-local Conversations and Messages data sources. Missing configuration must fail closed with an explicit health warning.

## Project Status

- Use `Installed` after project-local config/records and local verification are complete with flags off.
- Use `Deployed` only after the target project's own production service and live tenant-isolation checks pass.

# AM-IMP-2026.0808.01 LINE Conversation Storage and Tenant Routing

This package implements the shared contract from `docs/AM_PLATFORM_LINE_CONVERSATION_STORAGE_AND_TENANT_ROUTING_DESIGN_2026-08-08.md`.

It standardizes one tenant-local Conversation page per authorized LINE direct, group, or room, while keeping each tenant's Messages database centralized and physically isolated from every other tenant.

## Delivered Behavior

- Platform Conversation identity is namespaced by LINE Connection and source type, and stores only routing metadata.
- Direct routing uses external identity, membership, and active workspace; group and room routing use their active binding.
- Unbound events fail closed and never enter a tenant content database.
- Rebinding closes the old binding period and creates a new tenant-local Conversation without copying history.
- Incoming and outgoing messages share the same Tenant Conversation and use an idempotency key.
- Projection failure preserves the Message and creates a repair item.
- Group and room senders can update a tenant-local member index.
- Assistant operation commands remain auditable but are marked ineligible for task creation.
- AI and hourly reconciliation read one Conversation and its latest 20 messages by default.

## Package Contents

- `config/line-conversation-storage-contract.json`
- `schemas/notion-conversations.schema.json`
- `schemas/notion-messages-patch.schema.json`
- `schemas/notion-conversation-members.schema.json`
- `schemas/platform-conversation-binding-period.schema.json`
- `runtime/conversation-routing.mjs`
- `runtime/conversation-storage.mjs`
- `fixtures/line-conversation-cases.json`
- `fixtures/backfill-input.example.json`
- `fixtures/projection-state.example.json`
- `tools/verify-line-conversation-routing.mjs`
- `tools/backfill-conversations.mjs`
- `tools/repair-conversation-projections.mjs`

## Safety Boundary

This package contains no real LINE ID, Notion ID, message, token, tenant record, or attachment. The reference runtime receives identity and storage adapters through dependency injection. All feature flags default to off.

Project-local installation is complete when the contract/config is present, local verification passes, and the project manifest records `Installed`. It is not `Deployed` until that project's Notion schema, secrets, Render service, canary routing, dual-write comparison, and production isolation tests are verified.

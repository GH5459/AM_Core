# AM-IMP-2026.0807.03 AM Identity and LINE Connection Registry

This package freezes the shared AM Platform identity and LINE connection contract.

It turns the HOZO-specific binding behavior into a tenant-safe platform pattern:

- one person can belong to many tenants;
- LINE external identities are namespaced by provider and LINE connection;
- access comes from active tenant membership;
- private chats route by active workspace;
- groups route by group binding;
- every binding, revoke, conflict and failed consume attempt is audited.

The package does not install production secrets and does not contain raw LINE user IDs.

## Included Files

- `config/am-identity-line-contract.json`
- `schemas/am-identity-line-postgres.sql`
- `README.md`, `INSTALL.md`, `VERIFY.md`, `ROLLBACK.md`, `upgrade.json`

## Default Flags

All runtime behavior must default to off:

- `amIdentity.enabled=false`
- `amIdentity.authority=legacy`
- `amIdentity.bindingIssueEnabled=false`
- `amIdentity.bindingConsumeEnabled=false`
- `amIdentity.legacyMirrorEnabled=false`
- `lineConnections.enabled=false`
- `personalAssistant.workspaceSelectionEnabled=false`

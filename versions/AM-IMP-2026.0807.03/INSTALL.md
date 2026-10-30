# Install

Install separately in each project-local runtime. Do not install from the Google Drive AMCore clone.

1. Copy the contract and schema into the project-local implementation branch.
2. Create additive tables only. Do not drop or rewrite legacy identity tables.
3. Store hash/encryption/OA secrets only in the target project's production secret store.
4. Deploy code with all identity and LINE flags off.
5. Run schema/RLS tests and legacy compare tests before enabling binding issue or consume.

Minimum feature-flag sequence:

1. `amIdentity.enabled=true`, `amIdentity.authority=legacy`
2. `lineConnections.enabled=true` for connection lookup and signature verification only
3. `amIdentity.authority=compare`
4. enable one canary binding issue/consume
5. switch a tenant to `am` authority only after compare differences are resolved

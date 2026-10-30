# Install

1. Confirm `AM-IMP-2026.0808.01` is already installed in the target project.
2. Copy the project-local readiness helper and verifier into the target project.
3. Add npm scripts for readiness verification.
4. Add `lineConversationStorage` to the project `/health` response.
5. Keep all feature flags off unless the target project owner has approved the
   production cutover.
6. Run local checks:

```text
npm run line:conversation-readiness
node --check src/line-conversation-readiness.js
node --check scripts/verify-line-conversation-readiness.mjs
```

7. Run AMCore checks:

```text
node tools/check-upgrade-package.js AM-IMP-2026.0808.02
node tools/compare-project-manifests.js
node tools/audit-alignment.js
```

## Production Gate

After production secrets are available inside the project runtime, run:

```text
npm run line:conversation-readiness:strict
```

The strict check is expected to fail until all required environment variables
and Notion data sources are present.

# Local project snapshot integration — 2026-10-31

The uploaded snapshot is `a9db3d1df52eab43f6b82d4c16a487caa3fd035e` on `codex/project-upload-20261031`. It is based on an older checkout; integration uses main `56409dca25ee2e52386d37e6c4dbd41a73d6fbb5`.

The current main runtime, configuration, package dependencies, tenant settings, environment example, manifests and existing upgrade-package files take precedence wherever both branches changed. No production data, credential, identity, binding or schedule is restored from the snapshot.

Source-only historical documentation and static Rich Menu assets are retained at their original paths. Historical package support files with reused package IDs, the unused attachment-recovery implementation, its old integration test and its old standardization verifier are preserved under this archive instead of being activated. These are reference files, not current install instructions or additional runtime features. The complete original snapshot remains available through its original Git commit, including files superseded on main.

No schema or data migration is introduced by this merge. Deployment must use a reviewed merge on main, with exact commit and health verification.

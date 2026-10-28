# Verify

- `node --check core/group-onboarding.js`
- `node --check server.js`
- `node --experimental-vm-modules tools/dryrun-core.mjs`
- `node --test tools/test-engineering-simple-binding.mjs`
- Run package checker and alignment audit with their CommonJS loader.
- Check bare/native-mention commands, name failure, direct chat denial,
  cross-tenant/duplicate denial and repeat-binding preservation.
- Before calling Deployed, production health must show the reviewed commit and
  build `engineering-simple-group-binding-2026-10-28`.
- Actual LINE bare/native-mention commands remain production acceptance checks;
  local tests send no messages and create no production records.

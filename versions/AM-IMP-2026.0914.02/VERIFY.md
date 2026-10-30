# Verify

Run from the AMCore / AM Platform repository:

```text
node --check modules/collect/index.js
node tools/dryrun-collect-attachment-archive.mjs
node tools/dryrun-core.mjs
node tools/check-upgrade-package.js AM-IMP-2026.0914.02
node tools/audit-alignment.js
```

The attachment archive dry run must prove:

- `*.dwg` bypasses Notion upload and streams into Google Drive;
- the attachment row contains the Drive link and original file size;
- a supported small PDF is stored in Drive and also receives a Notion preview;
- a native LINE video receives a stable `.mp4` fallback filename and streams to
  Drive;
- direct chats do not activate the forced LINE-group archive policy;
- files larger than 20 MiB do not use Notion's single-part direct upload path.

Production verification must additionally prove that the Drive file opens and
that its attachment record relates to the correct Engineering AM message,
project, and group. Local mocks do not justify `Deployed` status.

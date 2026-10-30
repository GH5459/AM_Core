# AM-IMP-2026.0914.02 — Engineering LINE attachment Drive archive

This package makes Google Drive the source of truth for every binary attachment
received in an active Engineering AM LINE group.

## Runtime contract

- Images, ordinary files, CAD files, archives, and videos are archived below the
  engineering tenant's own Drive root in `未歸檔/YYYY-MM-DD/`.
- Meeting audio keeps using the existing large-file-safe stream archive below
  `會議錄音/YYYY-MM-DD/`; collect does not create a duplicate copy.
- Unsupported Notion formats such as DWG and files that exceed Notion's direct
  upload limit stream from LINE directly into Google Drive without first loading
  the entire file into application memory.
- Notion remains the attachment metadata and relation index. A Notion file
  preview is added only when the extension and direct-upload size are supported.
- The policy applies only when the event comes from a LINE group or room. Direct
  chats do not enter the forced group archive policy.
- All Drive and Notion writes remain inside the resolved engineering tenant.

## Why this is needed

Previously, ordinary LINE files depended on Notion upload success. The attachment
row was still created when Notion rejected a format, while Google Drive backup
was limited to images. That left records such as
`明義街套房cad20260812.dwg` with a filename but no retrievable file.

This package removes Notion format support from the preservation decision.
Notion preview failure no longer prevents the original file from being retained
in Google Drive.

## Data boundary

The package contains code, tenant policy, tests, and documentation only. It does
not contain LINE content, files, Drive IDs, Notion IDs, project records, or
credentials. It does not recover attachments that were already missed before
deployment; those originals must be obtained again from their source.

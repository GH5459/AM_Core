# Install

Install this package into AM Platform for the Engineering AM tenant only.

1. Deploy the updated `modules/collect/index.js` and
   `tenants/engineering.json` together.
2. Confirm these production values are configured for the engineering tenant:
   `ENG_ATTACHMENTS_DATA_SOURCE_ID`, `ENG_DRIVE_ROOT_FOLDER_ID`,
   `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
   `GOOGLE_OAUTH_REFRESH_TOKEN`.
3. Confirm the engineering tenant policy contains:

```json
{
  "attachments": {
    "archiveAllLineGroupAttachmentsToDrive": true,
    "driveRole": "source-of-truth",
    "notionRole": "metadata-and-supported-preview"
  }
}
```

4. Run the local verification commands from `VERIFY.md`.
5. After deployment, send one small PDF, one DWG, one image, and one short video
   into a designated Engineering AM canary LINE group. Verify each attachment
   row has a valid `Drive 連結`. The PDF and image may also have a Notion file
   preview; the DWG is expected to rely on Drive.
6. Mark the package `Deployed` only after production Drive files can be opened
   and their attachment rows trace back to the correct Engineering AM messages.

Do not copy production data, folder IDs, database IDs, or files into AMCore.

# Rollback

1. Set the engineering tenant's
   `config.attachments.archiveAllLineGroupAttachmentsToDrive` to `false` or
   remove the attachment policy block.
2. Restore the previous collect module if the new video or stream path must also
   be removed.
3. Run the core dry run and an Engineering AM image canary to confirm the legacy
   photo archive behavior still works.
4. Update the package status to `Deprecated` or the appropriate project-local
   rollback state.

Rollback must not delete Drive files, Notion attachment rows, LINE messages, or
project records already created by this package.

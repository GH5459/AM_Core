# Task card inline images

Images attached to a task appear below its main description, outside collapsed attachment controls. All images retain their original download and management controls. Initial image loads eagerly, subsequent images lazily, with explicit retry on failure. The gallery also supports authorized read-only viewers.

Reference implementation targets DailyLog only; no AM runtime or other OA deployment is needed. No schema or stored task changes. Reference builder requires the target's private current-release snapshot and dependencies; it is not a generic one-command installer.

The user confirmed the preceding LINE mention/quoted-image task was created with an attachment. This package addresses visibility, not task extraction. Production receipts and private settings stay in the target project.

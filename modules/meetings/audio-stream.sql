-- Additive upload receipts only. Existing recordings and legacy chunks stay intact.
CREATE TABLE IF NOT EXISTS central_archive.meeting_audio_streams (
 workspace_id text NOT NULL, upload_id text NOT NULL,
 total_bytes bigint NOT NULL CHECK(total_bytes>0 AND total_bytes<=536870912),
 manifest_hash text NOT NULL, folder_id text NOT NULL, drive_id text NOT NULL,
 base_file_id text NOT NULL DEFAULT '', session_url text,
 bytes_saved bigint NOT NULL DEFAULT 0, uncertain boolean NOT NULL DEFAULT false,
 pending_offset bigint, pending_length integer, pending_hash text,
 receipts jsonb NOT NULL DEFAULT '{}', lease_token text, lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,upload_id),
 FOREIGN KEY(workspace_id,upload_id) REFERENCES central_archive.meeting_audio_uploads(workspace_id,upload_id)
);

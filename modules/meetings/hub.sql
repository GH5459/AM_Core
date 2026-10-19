CREATE TABLE IF NOT EXISTS central_archive.meeting_plans (
 workspace_id text PRIMARY KEY REFERENCES central_archive.meeting_workspaces(id),
 tenant_key text NOT NULL, topic text NOT NULL DEFAULT '', participants jsonb NOT NULL DEFAULT '[]',
 start_at timestamptz, end_at timestamptz, location text NOT NULL DEFAULT '',
 preparation text NOT NULL DEFAULT '', preparation_version bigint NOT NULL DEFAULT 1,
 version bigint NOT NULL DEFAULT 1, calendar_enabled boolean NOT NULL DEFAULT false,
 cancelled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_calendar_links (
 workspace_id text NOT NULL REFERENCES central_archive.meeting_workspaces(id),
 account text NOT NULL, tenant_key text NOT NULL, state text NOT NULL DEFAULT 'pending',
 desired_revision bigint NOT NULL, calendar_id text, event_id text, google_account text,
 applied_revision bigint NOT NULL DEFAULT 0, error_code text NOT NULL DEFAULT '',
 lease_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,account)
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_audio_uploads (
 workspace_id text NOT NULL REFERENCES central_archive.meeting_workspaces(id),
 upload_id text NOT NULL, actor_id text NOT NULL, mime text NOT NULL, filename text NOT NULL,
 state text NOT NULL DEFAULT 'receiving', drive_file jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,upload_id)
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_audio_chunks (
 workspace_id text NOT NULL, upload_id text NOT NULL, part integer NOT NULL CHECK(part>=0 AND part<4096),
 bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152), hash text NOT NULL,
 PRIMARY KEY(workspace_id,upload_id,part),
 FOREIGN KEY(workspace_id,upload_id) REFERENCES central_archive.meeting_audio_uploads(workspace_id,upload_id)
);

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

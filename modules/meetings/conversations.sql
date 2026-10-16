CREATE TABLE IF NOT EXISTS central_archive.meeting_settings (
  conversation_key text PRIMARY KEY REFERENCES central_archive.conversations(key),
  enabled boolean NOT NULL DEFAULT false,
  todo_mode text NOT NULL DEFAULT 'record_only'
    CHECK(todo_mode IN ('record_only','review_only','review_and_create')),
  tenant_key text NOT NULL DEFAULT '',
  legacy_status text NOT NULL DEFAULT '啟用',
  connection_state text NOT NULL DEFAULT 'unknown'
    CHECK(connection_state IN ('unknown','active','left','blocked')),
  database_id text, data_source_id text,
  legacy_database_id text, legacy_data_source_id text,
  version bigint NOT NULL DEFAULT 1,
  updated_by text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_changes (
  operation_id text PRIMARY KEY, conversation_key text NOT NULL,
  actor text NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_events (
  event_key text PRIMARY KEY, conversation_key text NOT NULL,
  event_at timestamptz NOT NULL, payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending', error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_pending (
  conversation_key text PRIMARY KEY, payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'waiting', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_events_pending ON central_archive.meeting_events(state,event_at);
CREATE INDEX IF NOT EXISTS meeting_archive_activity ON central_archive.jobs(conversation_key,event_at DESC);

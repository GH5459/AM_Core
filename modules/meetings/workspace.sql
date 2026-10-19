CREATE TABLE IF NOT EXISTS central_archive.meeting_workspaces (
 id text PRIMARY KEY, conversation_key text NOT NULL REFERENCES central_archive.conversations(key),
 message_id text NOT NULL, host_id text NOT NULL, host_name text NOT NULL,
 source jsonb NOT NULL, filename text NOT NULL, state text NOT NULL DEFAULT 'offered',
 revision bigint NOT NULL DEFAULT 1, fields jsonb NOT NULL DEFAULT '{}', field_versions jsonb NOT NULL DEFAULT '{}',
 result jsonb NOT NULL DEFAULT '{}', receipt jsonb NOT NULL DEFAULT '{}',
 error_code text NOT NULL DEFAULT '', lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conversation_key,message_id),
 CHECK(state IN ('offered','declined','setup','processing','review','failed','publishing','published'))
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_workspace_edits (
 workspace_id text NOT NULL REFERENCES central_archive.meeting_workspaces(id), revision bigint NOT NULL,
 actor_id text NOT NULL, actor_name text NOT NULL, field text NOT NULL, before_value jsonb, after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,revision)
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_workspace_presence (
 workspace_id text NOT NULL REFERENCES central_archive.meeting_workspaces(id), actor_id text NOT NULL,
 actor_name text NOT NULL, field text NOT NULL DEFAULT '', seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,actor_id)
);
CREATE INDEX IF NOT EXISTS meeting_workspace_recovery ON central_archive.meeting_workspaces(state,lease_until);
CREATE TABLE IF NOT EXISTS central_archive.meeting_workspace_templates (
 conversation_key text NOT NULL REFERENCES central_archive.conversations(key), name text NOT NULL,
 prompt text NOT NULL, version bigint NOT NULL DEFAULT 1, updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_key,name)
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_workspace_release (
 contract text PRIMARY KEY, cutover_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO central_archive.meeting_workspace_release(contract) VALUES('meeting-collaboration-host-publish-v1') ON CONFLICT DO NOTHING;

ALTER TABLE central_archive.meeting_workspaces ADD COLUMN IF NOT EXISTS sharing_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE central_archive.meeting_workspaces ADD COLUMN IF NOT EXISTS sharing_version bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS central_archive.meeting_workspace_access_changes (
 workspace_id text NOT NULL REFERENCES central_archive.meeting_workspaces(id), version bigint NOT NULL,
 actor_id text NOT NULL, actor_name text NOT NULL, before_enabled boolean NOT NULL, enabled boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,version)
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_workspace_revisions (
 workspace_id text NOT NULL REFERENCES central_archive.meeting_workspaces(id), revision bigint NOT NULL,
 base_revision bigint NOT NULL, fields jsonb NOT NULL, owner_names jsonb NOT NULL DEFAULT '{}',
 actor_id text NOT NULL, actor_name text NOT NULL, state text NOT NULL DEFAULT 'pending',
 receipt jsonb NOT NULL DEFAULT '{}', error_code text NOT NULL DEFAULT '', lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz,
 PRIMARY KEY(workspace_id,revision), CHECK(state IN ('pending','applied'))
);
CREATE UNIQUE INDEX IF NOT EXISTS meeting_workspace_one_revision ON central_archive.meeting_workspace_revisions(workspace_id) WHERE state='pending';

-- Shared vocabulary is scoped to this service/OA, without conversation content.
CREATE TABLE IF NOT EXISTS central_archive.meeting_glossary (
 bot_id text NOT NULL, id uuid NOT NULL, term text NOT NULL,
 aliases jsonb NOT NULL DEFAULT '[]', note text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
 version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(bot_id,id), UNIQUE(bot_id,term)
);
CREATE TABLE IF NOT EXISTS central_archive.meeting_glossary_changes (
 bot_id text NOT NULL, term_id uuid NOT NULL, version bigint NOT NULL, actor_id text NOT NULL,
 before_value jsonb, after_value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(bot_id,term_id,version)
);

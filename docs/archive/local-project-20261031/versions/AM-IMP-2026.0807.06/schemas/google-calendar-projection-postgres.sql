-- Google Calendar projection additive schema sketch.

create table if not exists am_calendar_projection_connections (
  id uuid primary key,
  tenant_id uuid not null,
  provider text not null default 'google_calendar',
  credential_ref text not null,
  status text not null check (status in ('active', 'reauth_required', 'revoked', 'inactive')),
  authorized_subject_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, credential_ref)
);

create table if not exists am_calendar_targets (
  id uuid primary key,
  tenant_id uuid not null,
  projection_connection_id uuid not null references am_calendar_projection_connections(id),
  target_type text not null check (target_type in ('company', 'person', 'team', 'role')),
  person_id uuid,
  external_calendar_id text not null,
  timezone text not null default 'Asia/Taipei',
  status text not null check (status in ('active', 'inactive', 'revoked')),
  created_at timestamptz not null default now(),
  unique (tenant_id, target_type, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

create table if not exists am_calendar_grants (
  id uuid primary key,
  tenant_id uuid not null,
  target_id uuid not null references am_calendar_targets(id),
  principal_ref text not null,
  role text not null,
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now()
);

create table if not exists am_calendar_event_links (
  id uuid primary key,
  tenant_id uuid not null,
  calendar_item_id uuid not null,
  target_id uuid not null references am_calendar_targets(id),
  external_event_id text,
  source_version text,
  payload_hash text,
  sync_status text not null,
  last_success_at timestamptz,
  last_error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, calendar_item_id, target_id)
);

create table if not exists am_calendar_outbox (
  id uuid primary key,
  tenant_id uuid not null,
  calendar_item_id uuid not null,
  target_id uuid not null references am_calendar_targets(id),
  operation text not null check (operation in ('upsert', 'cancel', 'acl')),
  idempotency_key text not null,
  status text not null check (status in ('pending', 'leased', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

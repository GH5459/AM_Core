-- AM Calendar Hub additive schema sketch.

create table if not exists am_calendar_backend_connections (
  id uuid primary key,
  tenant_id uuid not null,
  backend_type text not null,
  connection_ref text not null,
  status text not null check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (tenant_id, backend_type)
);

create table if not exists am_calendar_items (
  id uuid primary key,
  tenant_id uuid not null,
  title text not null,
  source_system text not null,
  source_type text not null,
  source_id text not null,
  source_version text,
  source_url text,
  owner_person_id uuid,
  visibility text not null,
  action_policy text not null,
  status text not null,
  scheduled_date date,
  planned_date date,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  due_at timestamptz,
  timezone text not null default 'Asia/Taipei',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_system, source_type, source_id)
);

create table if not exists am_calendar_audit_events (
  id uuid primary key,
  tenant_id uuid not null,
  calendar_item_id uuid,
  actor_context jsonb not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  request_id text not null,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table if not exists am_calendar_sync_failures (
  id uuid primary key,
  tenant_id uuid not null,
  backend_type text not null,
  operation text not null,
  request_id text not null,
  error_code text not null,
  retryable boolean not null,
  error_summary text,
  created_at timestamptz not null default now()
);

-- AM Identity and LINE Connection additive schema sketch.
-- Project-local installers must adapt naming and migration wrappers.

create table if not exists am_people (
  id uuid primary key,
  display_name text not null,
  status text not null check (status in ('active', 'inactive', 'merged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists am_tenant_memberships (
  id uuid primary key,
  tenant_id uuid not null,
  person_id uuid not null references am_people(id),
  role text not null,
  capabilities jsonb not null default '[]'::jsonb,
  status text not null check (status in ('active', 'inactive', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_id)
);

create table if not exists am_line_connections (
  id uuid primary key,
  provider text not null default 'line',
  connection_key text not null,
  secret_ref text not null,
  status text not null check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (provider, connection_key)
);

create table if not exists am_external_identities (
  id uuid primary key,
  provider text not null,
  connection_id uuid not null references am_line_connections(id),
  external_subject_hash text not null,
  external_subject_ciphertext_ref text,
  person_id uuid not null references am_people(id),
  status text not null check (status in ('active', 'revoked')),
  verified_method text not null,
  verified_at timestamptz not null,
  revoked_at timestamptz,
  unique (provider, connection_id, external_subject_hash)
);

create table if not exists am_binding_challenges (
  id uuid primary key,
  tenant_id uuid not null,
  person_id uuid not null references am_people(id),
  challenge_hash text not null,
  status text not null check (status in ('issued', 'consumed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists am_identity_audit_events (
  id uuid primary key,
  tenant_id uuid,
  person_id uuid,
  action text not null,
  request_id text not null,
  actor_ref text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

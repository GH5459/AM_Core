-- Install with the database owner before deploying the login continuation runtime.
-- Original business tables and runtime schema privileges are unchanged.
CREATE TABLE IF NOT EXISTS central_archive.login_continuation (
  kind text NOT NULL CHECK (kind IN ('root','ticket','chain')),
  key text NOT NULL CHECK (length(key)=64), value jsonb NOT NULL,
  expires_at bigint NOT NULL, PRIMARY KEY(kind,key)
);
CREATE TABLE IF NOT EXISTS central_archive.login_continuation_line_proofs (
  key text PRIMARY KEY, value jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS central_archive.login_continuation_nonces (
  key text PRIMARY KEY, expires_at bigint NOT NULL
);

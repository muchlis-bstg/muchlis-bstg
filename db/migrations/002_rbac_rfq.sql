ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'SALES';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','MANAGER','SALES','OPERATIONS','FINANCE','VIEWER'));

CREATE INDEX IF NOT EXISTS rfqs_buyer_created_idx ON rfqs(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_user_expires_idx ON sessions(user_id, expires_at);

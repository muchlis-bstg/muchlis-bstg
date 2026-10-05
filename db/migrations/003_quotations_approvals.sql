CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  rfq_id TEXT NOT NULL REFERENCES rfqs(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED')),
  currency TEXT NOT NULL,
  total_value NUMERIC(18,2) NOT NULL CHECK(total_value >= 0),
  valid_until DATE,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfq_id, version)
);

CREATE TABLE IF NOT EXISTS quotation_approvals (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(quotation_id, approver_user_id)
);

CREATE INDEX IF NOT EXISTS quotations_rfq_created_idx ON quotations(rfq_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotation_approvals_quotation_idx ON quotation_approvals(quotation_id, decided_at DESC);

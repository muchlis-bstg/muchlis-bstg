CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL UNIQUE REFERENCES quotations(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED')),
  currency TEXT NOT NULL,
  total_value NUMERIC(18,2) NOT NULL CHECK(total_value >= 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  tracking_number TEXT UNIQUE,
  carrier TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('BOOKED','IN_TRANSIT','ARRIVED','DELIVERED','EXCEPTION')),
  etd DATE,
  eta DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_orders_status_created_idx ON sales_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_order_status_idx ON shipments(sales_order_id, status, created_at DESC);

CREATE TABLE principals (
 id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('customer','admin')),
 name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL,
 UNIQUE(role,email)
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, principal_id TEXT NOT NULL REFERENCES principals(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE products (
 id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE COLLATE NOCASE, price INTEGER NOT NULL CHECK(price >= 0),
 stock INTEGER NOT NULL CHECK(stock >= 0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= stock),
 archived INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE shopping (
 customer_id TEXT PRIMARY KEY REFERENCES principals(id), version INTEGER NOT NULL DEFAULT 0,
 cart TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cart)), wishlist TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(wishlist))
);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, customer_id TEXT REFERENCES principals(id), access_hash TEXT,
 data TEXT NOT NULL CHECK(json_valid(data)), items TEXT NOT NULL CHECK(json_valid(items)),
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), delivery_fee INTEGER NOT NULL CHECK(delivery_fee >= 0), total INTEGER NOT NULL CHECK(total = subtotal + delivery_fee),
 status TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED')),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('PENDING','SUCCESSFUL','FAILED','REFUNDED')),
 environment TEXT NOT NULL CHECK(environment IN ('test','live')), payment_method TEXT NOT NULL DEFAULT '', transaction_reference TEXT NOT NULL DEFAULT '',
 reservation_state TEXT NOT NULL CHECK(reservation_state IN ('ACTIVE','COMMITTED','RELEASED')),
 expires_at TEXT NOT NULL, review_required INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX orders_customer_date ON orders(customer_id,created_at DESC);
CREATE INDEX orders_expiry ON orders(reservation_state,expires_at);
CREATE TABLE order_timeline (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id), status TEXT NOT NULL,
 timestamp TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL
);
CREATE TABLE reservations (
 order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 PRIMARY KEY(order_id,product_id)
);
CREATE TABLE stock_movements (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), delta INTEGER NOT NULL, reason TEXT NOT NULL,
 actor_id TEXT, operation_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE idempotency (
 scope TEXT NOT NULL, key_hash TEXT NOT NULL, request_hash TEXT NOT NULL, result_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(scope,key_hash)
);
CREATE TABLE payments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), reference TEXT NOT NULL UNIQUE, provider_id TEXT UNIQUE,
 method TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('test','live')), amount INTEGER NOT NULL CHECK(amount > 0), currency TEXT NOT NULL DEFAULT 'RWF',
 status TEXT NOT NULL CHECK(status IN ('INITIATING','PENDING','SUCCESSFUL','FAILED','UNKNOWN')),
 checkout_url TEXT, verified_at TEXT, failure_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, checked_at TEXT
);
CREATE UNIQUE INDEX one_active_payment ON payments(order_id) WHERE status IN ('INITIATING','PENDING','UNKNOWN');
CREATE TABLE refunds (
 id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id), provider_id TEXT UNIQUE,
 amount INTEGER NOT NULL CHECK(amount > 0), reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('INITIATING','PENDING','SUCCESSFUL','FAILED','UNKNOWN')),
 provider_status TEXT, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE provider_events (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL, transaction_id TEXT, kind TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'PENDING',
 attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE media (
 id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, purpose TEXT NOT NULL CHECK(purpose IN ('product','custom')),
 owner_id TEXT REFERENCES principals(id), upload_hash TEXT, mime TEXT NOT NULL, bytes INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 created_at TEXT NOT NULL, attached_at TEXT
);
CREATE TABLE custom_requests (
 id TEXT PRIMARY KEY, request_number TEXT NOT NULL UNIQUE COLLATE NOCASE, customer_id TEXT REFERENCES principals(id), access_hash TEXT,
 media_id TEXT REFERENCES media(id), data TEXT NOT NULL CHECK(json_valid(data)),
 status TEXT NOT NULL CHECK(status IN ('NEW','CONTACTED','DESIGNING','APPROVED','IN PRODUCTION','READY','COMPLETED','CANCELLED')),
 notes TEXT NOT NULL DEFAULT '', internal_notes TEXT NOT NULL DEFAULT '', estimated_price INTEGER CHECK(estimated_price >= 0),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX custom_owner_date ON custom_requests(customer_id,created_at DESC);
CREATE TABLE custom_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL REFERENCES custom_requests(id), status TEXT NOT NULL,
 actor_id TEXT, timestamp TEXT NOT NULL, notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, entity_id TEXT NOT NULL, audience TEXT NOT NULL, customer_id TEXT,
 version INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX event_audience ON events(audience,customer_id,id);

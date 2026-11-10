CREATE TABLE outbound_emails (
 id TEXT PRIMARY KEY,
 admin_id TEXT NOT NULL REFERENCES principals(id),
 customer_id TEXT NOT NULL REFERENCES principals(id),
 recipient_email TEXT NOT NULL,
 subject TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SENDING','SENT','FAILED','UNKNOWN')),
 provider_message_id TEXT,
 failure_code TEXT,
 created_at TEXT NOT NULL,
 sent_at TEXT
);
CREATE INDEX outbound_emails_created ON outbound_emails(created_at DESC);

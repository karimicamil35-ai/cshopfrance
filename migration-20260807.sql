-- Migration C-Shop.fr du 07/08/2026
-- À exécuter UNE FOIS sur la base D1 déjà en production.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT 'Client',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blacklist (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  reason TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  order_id INTEGER PRIMARY KEY,
  amount_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reported','confirmed')),
  reported_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS order_archive (
  order_id INTEGER PRIMARY KEY,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_by TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL,
  order_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(customer_email COLLATE NOCASE, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_order ON audit_log(order_id, id DESC);

CREATE TABLE IF NOT EXISTS email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  customer_email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider_id TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_notifications_order ON email_notifications(order_id, id DESC);

CREATE TABLE IF NOT EXISTS order_message_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (message_id) REFERENCES order_messages(id)
);
CREATE INDEX IF NOT EXISTS idx_order_message_files_order_id ON order_message_files(order_id, id);

-- Convertit les anciens statuts vers la nouvelle timeline.
UPDATE orders SET status='proposal' WHERE status='product_to_pay';
UPDATE orders SET status='ordered' WHERE status IN ('product_paid','shipping_to_pay');
UPDATE orders SET status='delivered' WHERE status='receipt_confirmation';

-- Les anciennes commandes archivées restent terminées mais sont masquées du tableau principal.
INSERT OR IGNORE INTO order_archive(order_id, archived_by, archived_at)
SELECT id, 'migration', COALESCE(updated_at, created_at) FROM orders WHERE status='archived';
UPDATE orders SET status='closed' WHERE status='archived';

-- Conserve les anciens clients déjà présents dans les commandes.
INSERT OR IGNORE INTO clients(email, name, first_seen_at, last_seen_at)
SELECT customer_email, trim(first_name || ' ' || last_name), MIN(created_at), MAX(COALESCE(updated_at, created_at))
FROM orders
GROUP BY lower(customer_email);

-- EMS 5 — initial schema (Cloudflare D1 / SQLite).
--
-- For a NEW, empty D1 database only. Tables are created without IF NOT EXISTS,
-- so running this against a database that already has EMS tables fails before
-- anything is changed. Apply with:  npx wrangler d1 migrations apply DB --remote
-- Ids, verification tokens and timestamps are set by the application
-- (src/server/db); money is REAL rounded to 2 decimals by the application.

-- ───────────────────────────── identity & tenancy ─────────────────────────────

CREATE TABLE platform_owners (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  admin_code    TEXT NOT NULL UNIQUE CHECK (admin_code GLOB '[0-9][0-9][0-9][0-9]'),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  phone         TEXT NOT NULL,
  address       TEXT,
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE shops (
  id                  TEXT PRIMARY KEY,
  admin_id            TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  shop_code           TEXT NOT NULL UNIQUE CHECK (shop_code GLOB '[0-9][0-9][0-9][0-9]'),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'General Store',
  address             TEXT,
  phone               TEXT,
  phone2              TEXT,
  email               TEXT,
  website             TEXT,
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX shops_admin_idx on shops(admin_id, created_at);

CREATE TABLE staff (
  id            TEXT PRIMARY KEY,
  shop_id       TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL CHECK (user_id = lower(user_id) and length(user_id) between 3 and 40),
  full_name     TEXT NOT NULL,
  position      TEXT,
  phone         TEXT,
  email         TEXT,
  password_hash TEXT NOT NULL,
  basic_salary  REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  permissions   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(permissions)),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, user_id)
);

CREATE TABLE shop_devices (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id     TEXT REFERENCES staff(id) ON DELETE CASCADE,
  fingerprint  TEXT NOT NULL,
  user_agent   TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, fingerprint)
);

CREATE TABLE auth_attempts (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX auth_attempts_lookup_idx on auth_attempts(scope, subject, created_at desc);

-- ───────────────────────────── licensing & add-ons ─────────────────────────────

CREATE TABLE license_plans (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months > 0),
  max_shops       INTEGER NOT NULL CHECK (max_shops > 0),
  price           REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  benefits        TEXT,
  payment_details TEXT,
  modules         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(modules)),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE licenses (
  id              TEXT PRIMARY KEY,
  admin_id        TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  plan_id         TEXT REFERENCES license_plans(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL DEFAULT 'new' CHECK (kind in ('new','renewal','upgrade','downgrade')),
  title           TEXT NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months > 0),
  max_shops       INTEGER NOT NULL CHECK (max_shops > 0),
  modules         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(modules)),
  amount          REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method  TEXT NOT NULL CHECK (payment_method in ('bkash','nagad','bank','other')),
  payment_number  TEXT,
  transaction_id  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status in ('pending','active','rejected','expired')),
  starts_at       TEXT,
  expires_at      TEXT,
  reviewed_at     TEXT,
  reviewed_by     TEXT REFERENCES platform_owners(id) ON DELETE SET NULL,
  review_note     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (status <> 'active' or (starts_at is not null and expires_at is not null and expires_at > starts_at))
);
CREATE INDEX licenses_admin_idx on licenses(admin_id, status, expires_at desc);

CREATE TABLE addons (
  key        TEXT PRIMARY KEY CHECK (key in ('connectx','zudo','business_health','truebill','vaultium')),
  enabled    INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  title      TEXT NOT NULL,
  details    TEXT,
  unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  min_days   INTEGER NOT NULL DEFAULT 30 CHECK (min_days > 0),
  max_days   INTEGER NOT NULL DEFAULT 365 CHECK (max_days >= min_days),
  min_limit  INTEGER NOT NULL DEFAULT 1 CHECK (min_limit >= 0),
  max_limit  INTEGER NOT NULL DEFAULT 100 CHECK (max_limit >= min_limit),
  image_url  TEXT,
  url        TEXT,
  updated_by TEXT REFERENCES platform_owners(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE coupons (
  code        TEXT PRIMARY KEY CHECK (code = upper(code) and length(code) between 3 and 32),
  percent_off INTEGER NOT NULL CHECK (percent_off between 1 and 100),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE addon_purchases (
  id              TEXT PRIMARY KEY,
  admin_id        TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  addon_key       TEXT NOT NULL REFERENCES addons(key),
  days            INTEGER NOT NULL CHECK (days > 0),
  daily_limit     INTEGER NOT NULL DEFAULT 0 CHECK (daily_limit >= 0),
  unit_price      REAL NOT NULL DEFAULT 0,
  amount          REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  coupon_code     TEXT,
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  payment_method  TEXT NOT NULL CHECK (payment_method in ('bkash','nagad','bank','other')),
  payment_number  TEXT,
  transaction_id  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status in ('pending','active','rejected','expired')),
  starts_at       TEXT,
  expires_at      TEXT,
  reviewed_at     TEXT,
  reviewed_by     TEXT REFERENCES platform_owners(id) ON DELETE SET NULL,
  review_note     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX addon_purchases_admin_idx on addon_purchases(admin_id, addon_key, status);

-- ───────────────────────────── shop records ─────────────────────────────

CREATE TABLE customers (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT,
  phone2     TEXT,
  email      TEXT,
  address    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, code)
);
CREATE INDEX customers_shop_name_idx on customers(shop_id, name);

CREATE TABLE suppliers (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT,
  phone2     TEXT,
  email      TEXT,
  address    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, code)
);
CREATE INDEX suppliers_shop_name_idx on suppliers(shop_id, name);

CREATE TABLE products (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  category   TEXT,
  unit       TEXT NOT NULL DEFAULT 'pcs',
  sale_price REAL NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  stock      REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, code)
);
CREATE INDEX products_shop_name_idx on products(shop_id, name);

CREATE TABLE invoices (
  id                 TEXT PRIMARY KEY,
  shop_id            TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind in ('sale','purchase')),
  number             TEXT NOT NULL,
  customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id        TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  party_name         TEXT,
  party_phone        TEXT,
  party_address      TEXT,
  invoice_date       TEXT NOT NULL DEFAULT (date('now')),
  payment_method     TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method in ('cash','bank','bkash','nagad','other')),
  transaction_id     TEXT,
  notes              TEXT,
  subtotal           REAL NOT NULL DEFAULT 0,
  line_tax           REAL NOT NULL DEFAULT 0,
  line_discount      REAL NOT NULL DEFAULT 0,
  tax_percent        REAL NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
  tax_amount         REAL NOT NULL DEFAULT 0,
  discount           REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total              REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid               REAL NOT NULL DEFAULT 0,
  due                REAL GENERATED ALWAYS AS (total - paid) STORED,
  created_by         TEXT,
  verification_token TEXT NOT NULL UNIQUE,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, kind, number),
  check (paid >= 0 and paid <= total),
  check (kind = 'sale' or customer_id is null),
  check (kind = 'purchase' or supplier_id is null)
);
CREATE INDEX invoices_shop_kind_date_idx on invoices(shop_id, kind, invoice_date desc);
CREATE INDEX invoices_customer_idx on invoices(customer_id);
CREATE INDEX invoices_supplier_idx on invoices(supplier_id);

CREATE TABLE invoice_lines (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity     REAL NOT NULL CHECK (quantity > 0),
  unit_price   REAL NOT NULL CHECK (unit_price >= 0),
  tax_percent  REAL NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
  discount     REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total   REAL NOT NULL
);
CREATE INDEX invoice_lines_invoice_idx on invoice_lines(invoice_id);
CREATE INDEX invoice_lines_product_idx on invoice_lines(product_id);

CREATE TABLE returns (
  id                 TEXT PRIMARY KEY,
  shop_id            TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  invoice_id         TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  number             TEXT NOT NULL,
  customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name      TEXT,
  return_date        TEXT NOT NULL DEFAULT (date('now')),
  subtotal           REAL NOT NULL DEFAULT 0,
  tax_amount         REAL NOT NULL DEFAULT 0,
  discount_amount    REAL NOT NULL DEFAULT 0,
  penalty_amount     REAL NOT NULL DEFAULT 0,
  total              REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  refunded           REAL NOT NULL DEFAULT 0 CHECK (refunded >= 0),
  refund_method      TEXT CHECK (refund_method in ('cash','bank','bkash','nagad','other','none')),
  transaction_id     TEXT,
  status             TEXT NOT NULL DEFAULT 'refunded' CHECK (status in ('pending_refund','partially_refunded','refunded')),
  notes              TEXT,
  created_by         TEXT,
  verification_token TEXT NOT NULL UNIQUE,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, number),
  check (refunded <= total)
);
CREATE INDEX returns_invoice_idx on returns(invoice_id);
CREATE INDEX returns_shop_date_idx on returns(shop_id, return_date desc);

CREATE TABLE return_items (
  id              TEXT PRIMARY KEY,
  return_id       TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity        REAL NOT NULL CHECK (quantity > 0),
  unit_price      REAL NOT NULL DEFAULT 0,
  tax_percent     REAL NOT NULL DEFAULT 0,
  tax_amount      REAL NOT NULL DEFAULT 0,
  discount        REAL NOT NULL DEFAULT 0,
  penalty         REAL NOT NULL DEFAULT 0,
  amount          REAL NOT NULL DEFAULT 0,
  reason          TEXT NOT NULL CHECK (reason in ('changed_mind','defective','wrong_product','damaged','wrong_spec','other')),
  reason_note     TEXT,
  condition       TEXT NOT NULL CHECK (condition in ('sellable','damaged','defective','warranty')),
  serial          TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX return_items_return_idx on return_items(return_id);
CREATE INDEX return_items_line_idx on return_items(invoice_line_id);

CREATE TABLE exchanges (
  id                 TEXT PRIMARY KEY,
  shop_id            TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  invoice_id         TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  number             TEXT NOT NULL,
  customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name      TEXT,
  exchange_date      TEXT NOT NULL DEFAULT (date('now')),
  returned_total     REAL NOT NULL DEFAULT 0,
  new_subtotal       REAL NOT NULL DEFAULT 0,
  new_tax            REAL NOT NULL DEFAULT 0,
  new_discount       REAL NOT NULL DEFAULT 0,
  new_total          REAL NOT NULL DEFAULT 0,
  difference         REAL NOT NULL DEFAULT 0,
  settlement         TEXT NOT NULL DEFAULT 'even' CHECK (settlement in ('payment','refund','even')),
  payment_method     TEXT CHECK (payment_method in ('cash','bank','bkash','nagad','other','none')),
  transaction_id     TEXT,
  status             TEXT NOT NULL DEFAULT 'completed' CHECK (status in ('completed','cancelled')),
  notes              TEXT,
  created_by         TEXT,
  verification_token TEXT NOT NULL UNIQUE,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, number)
);
CREATE INDEX exchanges_invoice_idx on exchanges(invoice_id);
CREATE INDEX exchanges_shop_date_idx on exchanges(shop_id, exchange_date desc);

CREATE TABLE exchange_items (
  id              TEXT PRIMARY KEY,
  exchange_id     TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction in ('returned','new')),
  invoice_line_id TEXT REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity        REAL NOT NULL CHECK (quantity > 0),
  unit_price      REAL NOT NULL DEFAULT 0,
  tax_percent     REAL NOT NULL DEFAULT 0,
  tax_amount      REAL NOT NULL DEFAULT 0,
  discount        REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  reason          TEXT CHECK (reason in ('changed_mind','defective','wrong_product','damaged','wrong_spec','other')),
  reason_note     TEXT,
  condition       TEXT CHECK (condition in ('sellable','damaged','defective','warranty')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (direction = 'new' or (invoice_line_id is not null and reason is not null and condition is not null))
);
CREATE INDEX exchange_items_exchange_idx on exchange_items(exchange_id);
CREATE INDEX exchange_items_line_idx on exchange_items(invoice_line_id);

CREATE TABLE stock_movements (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type in ('return_in','return_quarantine','exchange_in','exchange_quarantine','exchange_out')),
  quantity     REAL NOT NULL,
  stock_before REAL NOT NULL,
  stock_after  REAL NOT NULL,
  return_id    TEXT REFERENCES returns(id) ON DELETE SET NULL,
  exchange_id  TEXT REFERENCES exchanges(id) ON DELETE SET NULL,
  condition    TEXT,
  notes        TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX stock_movements_shop_idx on stock_movements(shop_id, created_at desc);
CREATE INDEX stock_movements_product_idx on stock_movements(product_id);

CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  details      TEXT NOT NULL,
  total        REAL NOT NULL CHECK (total > 0),
  paid         REAL NOT NULL DEFAULT 0,
  due          REAL GENERATED ALWAYS AS (total - paid) STORED,
  note         TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, code),
  check (paid >= 0 and paid <= total)
);
CREATE INDEX expenses_shop_date_idx on expenses(shop_id, expense_date desc);

CREATE TABLE due_payments (
  id             TEXT PRIMARY KEY,
  shop_id        TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  source_type    TEXT NOT NULL CHECK (source_type in ('sale','purchase','expense')),
  source_id      TEXT NOT NULL,
  amount         REAL NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method in ('cash','bank','bkash','nagad','other')),
  transaction_id TEXT,
  note           TEXT,
  recorded_by    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX due_payments_shop_idx on due_payments(shop_id, created_at desc);
CREATE INDEX due_payments_source_idx on due_payments(source_type, source_id);

CREATE TABLE attendance (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id    TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status in ('present','absent')),
  note        TEXT,
  recorded_by TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (staff_id, date)
);
CREATE INDEX attendance_shop_date_idx on attendance(shop_id, date);

CREATE TABLE salary_payments (
  id               TEXT PRIMARY KEY,
  shop_id          TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id         TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month            TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]' AND substr(month, 6, 2) BETWEEN '01' AND '12'),
  type             TEXT NOT NULL DEFAULT 'salary' CHECK (type in ('salary','advance')),
  base_amount      REAL NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  attendance_based INTEGER NOT NULL DEFAULT 0 CHECK (attendance_based IN (0, 1)),
  present_days     INTEGER NOT NULL DEFAULT 0 CHECK (present_days >= 0),
  total_days       INTEGER NOT NULL DEFAULT 0 CHECK (total_days >= 0),
  incentive        REAL NOT NULL DEFAULT 0 CHECK (incentive >= 0),
  bonus            REAL NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  fine             REAL NOT NULL DEFAULT 0 CHECK (fine >= 0),
  other_deduction  REAL NOT NULL DEFAULT 0 CHECK (other_deduction >= 0),
  advance_deducted REAL NOT NULL DEFAULT 0 CHECK (advance_deducted >= 0),
  total            REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid             REAL NOT NULL DEFAULT 0,
  due              REAL GENERATED ALWAYS AS (total - paid) STORED,
  note             TEXT,
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (paid >= 0 and paid <= total)
);
CREATE INDEX salary_payments_shop_month_idx on salary_payments(shop_id, month);
CREATE INDEX salary_payments_staff_idx on salary_payments(staff_id, month);

-- Per-scope counters for business numbers (CUS-0001, INV-000001, …).
CREATE TABLE counters (
  scope TEXT NOT NULL,
  name  TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  primary key (scope, name)
);

-- ───────────────────────────── platform content ─────────────────────────────

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE pages (
  slug       TEXT PRIMARY KEY CHECK (slug in ('about','terms','privacy','contact')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES platform_owners(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE blog_posts (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE CHECK (slug <> '' AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'),
  title           TEXT NOT NULL,
  excerpt         TEXT,
  body            TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  published       INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  published_at    TEXT,
  created_by      TEXT REFERENCES platform_owners(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX blog_posts_published_idx on blog_posts(published, published_at desc);

CREATE TABLE contact_messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  subject    TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status in ('new','read','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX contact_messages_status_idx on contact_messages(status, created_at desc);

CREATE TABLE helpdesk_messages (
  id            TEXT PRIMARY KEY,
  admin_id      TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  sender        TEXT NOT NULL CHECK (sender in ('admin','owner')),
  body          TEXT NOT NULL,
  read_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (read_by_admin IN (0, 1)),
  read_by_owner INTEGER NOT NULL DEFAULT 0 CHECK (read_by_owner IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX helpdesk_messages_admin_idx on helpdesk_messages(admin_id, created_at);

CREATE TABLE activity_logs (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT REFERENCES shops(id) ON DELETE CASCADE,
  admin_id    TEXT REFERENCES admins(id) ON DELETE CASCADE,
  actor_type  TEXT NOT NULL CHECK (actor_type in ('owner','admin','staff','system')),
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX activity_logs_shop_idx on activity_logs(shop_id, created_at desc);
CREATE INDEX activity_logs_admin_idx on activity_logs(admin_id, created_at desc);
CREATE INDEX activity_logs_actor_idx on activity_logs(actor_type, created_at desc);

-- ───────────────────────────── integrations ─────────────────────────────

CREATE TABLE email_messages (
  id                  TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  sent_by             TEXT,
  recipient_type      TEXT NOT NULL CHECK (recipient_type in ('customer','supplier','staff','manual')),
  recipient_id        TEXT,
  invoice_id          TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  from_email          TEXT,
  to_emails           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(to_emails)),
  cc_emails           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cc_emails)),
  bcc_emails          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(bcc_emails)),
  subject             TEXT NOT NULL,
  custom_body         TEXT,
  body_html           TEXT,
  provider            TEXT NOT NULL DEFAULT 'brevo',
  provider_message_id TEXT,
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status in ('queued','sent','failed')),
  error               TEXT,
  idempotency_key     TEXT NOT NULL,
  hidden_at           TEXT,
  hidden_by           TEXT,
  sent_at             TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, idempotency_key)
);
CREATE INDEX email_messages_shop_idx on email_messages(shop_id, created_at desc);

CREATE TABLE sms_settings (
  shop_id           TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  enabled           INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  auto_sale         INTEGER NOT NULL DEFAULT 0 CHECK (auto_sale IN (0, 1)),
  auto_payment      INTEGER NOT NULL DEFAULT 0 CHECK (auto_payment IN (0, 1)),
  auto_due_reminder INTEGER NOT NULL DEFAULT 0 CHECK (auto_due_reminder IN (0, 1)),
  auto_return       INTEGER NOT NULL DEFAULT 0 CHECK (auto_return IN (0, 1)),
  auto_exchange     INTEGER NOT NULL DEFAULT 0 CHECK (auto_exchange IN (0, 1)),
  auto_refund       INTEGER NOT NULL DEFAULT 0 CHECK (auto_refund IN (0, 1)),
  templates         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(templates)),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE connect_connections (
  id                      TEXT PRIMARY KEY,
  remote_application_id   TEXT NOT NULL,
  remote_application_name TEXT,
  remote_endpoint         TEXT NOT NULL,
  remote_kind             TEXT,
  permissions             TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
  shared_secret           TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status in ('ACTIVE','PAUSED','DISCONNECTED')),
  display_name            TEXT,
  connected_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  disconnected_at         TEXT,
  last_seen_at            TEXT,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX connect_connections_active_idx on connect_connections(remote_application_id) where status = 'ACTIVE';

CREATE TABLE connect_requests (
  id                      TEXT PRIMARY KEY,
  direction               TEXT NOT NULL CHECK (direction in ('inbound','outbound')),
  pairing_code            TEXT,
  remote_application_id   TEXT,
  remote_application_name TEXT,
  remote_endpoint         TEXT,
  display_name            TEXT,
  requested_permissions   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(requested_permissions)),
  status                  TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status in ('PENDING_APPROVAL','CONSUMED','REJECTED','EXPIRED','CANCELLED','FAILED')),
  connection_id           TEXT REFERENCES connect_connections(id) ON DELETE SET NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at              TEXT NOT NULL
);
CREATE INDEX connect_requests_status_idx on connect_requests(status, expires_at);

CREATE TABLE sms_messages (
  id              TEXT PRIMARY KEY,
  shop_id         TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  sent_by         TEXT,
  recipient_type  TEXT NOT NULL CHECK (recipient_type in ('customer','supplier','staff','manual')),
  recipient_id    TEXT,
  recipient_name  TEXT,
  to_phone        TEXT NOT NULL,
  message_type    TEXT NOT NULL DEFAULT 'manual',
  event_type      TEXT,
  invoice_id      TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status in ('queued','sending','sent','failed','cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  request_id      TEXT UNIQUE,
  connection_id   TEXT REFERENCES connect_connections(id) ON DELETE SET NULL,
  sim_used        TEXT,
  idempotency_key TEXT NOT NULL,
  claimed_at      TEXT,
  result_at       TEXT,
  sent_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (shop_id, idempotency_key)
);
CREATE INDEX sms_messages_shop_idx on sms_messages(shop_id, created_at desc);
CREATE INDEX sms_messages_status_idx on sms_messages(status, created_at);

CREATE TABLE app_store_apps (
  id             TEXT PRIMARY KEY,
  package_name   TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  description    TEXT,
  version        TEXT NOT NULL,
  version_code   INTEGER NOT NULL CHECK (version_code > 0),
  icon_r2_key    TEXT,
  icon_url       TEXT CHECK (icon_url is null or icon_url like 'https://%'),
  apk_r2_key     TEXT,
  apk_url        TEXT CHECK (apk_url is null or apk_url like 'https://%'),
  apk_filename   TEXT,
  apk_size_bytes INTEGER,
  mandatory      INTEGER NOT NULL DEFAULT 0 CHECK (mandatory IN (0, 1)),
  release_notes  TEXT,
  published      INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE vaultium_files (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  invoice_id   TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  expense_id   TEXT REFERENCES expenses(id) ON DELETE SET NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes >= 0),
  r2_key       TEXT NOT NULL UNIQUE,
  uploaded_by  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX vaultium_files_shop_idx on vaultium_files(shop_id, created_at desc);
CREATE INDEX vaultium_files_admin_idx on vaultium_files(admin_id);

CREATE TABLE zudo_conversations (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX zudo_conversations_shop_idx on zudo_conversations(shop_id, user_id, updated_at desc);

CREATE TABLE zudo_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES zudo_conversations(id) ON DELETE CASCADE,
  shop_id         TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role in ('user','assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX zudo_messages_conversation_idx on zudo_messages(conversation_id, created_at);
CREATE INDEX zudo_messages_daily_idx on zudo_messages(shop_id, role, created_at);

CREATE TABLE business_health_reports (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  score      INTEGER NOT NULL CHECK (score between 0 and 100),
  snapshot   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(snapshot)),
  insights   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (end_date >= start_date)
);
CREATE INDEX business_health_reports_shop_idx on business_health_reports(shop_id, created_at desc);

CREATE TABLE verification_scans (
  id              TEXT PRIMARY KEY,
  shop_id         TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL CHECK (document_type in ('invoice','return','exchange')),
  document_id     TEXT NOT NULL,
  document_number TEXT,
  ip              TEXT,
  user_agent      TEXT,
  scanned_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX verification_scans_shop_idx on verification_scans(shop_id, scanned_at desc);

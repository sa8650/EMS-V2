-- EMS 5 — initial schema (PostgreSQL / Supabase).
--
-- For a NEW, empty database only. The guard below stops (and changes nothing)
-- if the database already contains EMS tables, so an existing database is never
-- overwritten. Money is numeric(14,2); quantities numeric(14,3).
-- Every table has Row Level Security enabled and no policies: the application
-- reaches the database only from the server with the service_role key.

do $$
begin
  if to_regclass('public.shops') is not null or to_regclass('public.stores') is not null then
    raise exception 'This database already contains EMS tables. EMS 5 needs a new, empty database (see docs/DATABASE.md). Nothing was changed.';
  end if;
end $$;

-- ───────────────────────────── identity & tenancy ─────────────────────────────

create table public.platform_owners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique check (email = lower(email)),
  password_hash text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.admins (
  id            uuid primary key default gen_random_uuid(),
  admin_code    text not null unique check (admin_code ~ '^[0-9]{4}$'),
  name          text not null,
  email         text not null unique check (email = lower(email)),
  phone         text not null,
  address       text,
  password_hash text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.shops (
  id                  uuid primary key default gen_random_uuid(),
  admin_id            uuid not null references public.admins(id) on delete cascade,
  shop_code           text not null unique check (shop_code ~ '^[0-9]{4}$'),
  name                text not null,
  category            text not null default 'General Store',
  address             text,
  phone               text,
  phone2              text,
  email               text,
  website             text,
  active              boolean not null default true,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index shops_admin_idx on public.shops(admin_id, created_at);

create table public.staff (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  user_id       text not null check (user_id = lower(user_id) and length(user_id) between 3 and 40),
  full_name     text not null,
  position      text,
  phone         text,
  email         text,
  password_hash text not null,
  basic_salary  numeric(14,2) not null default 0 check (basic_salary >= 0),
  permissions   jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (shop_id, user_id)
);

create table public.shop_devices (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  staff_id     uuid references public.staff(id) on delete cascade,
  fingerprint  text not null,
  user_agent   text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (shop_id, fingerprint)
);

create table public.auth_attempts (
  id         uuid primary key default gen_random_uuid(),
  scope      text not null,
  subject    text not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_lookup_idx on public.auth_attempts(scope, subject, created_at desc);

-- ───────────────────────────── licensing & add-ons ─────────────────────────────

create table public.license_plans (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  duration_months integer not null check (duration_months > 0),
  max_shops       integer not null check (max_shops > 0),
  price           numeric(14,2) not null default 0 check (price >= 0),
  benefits        text,
  payment_details text,
  modules         jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.licenses (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.admins(id) on delete cascade,
  plan_id         uuid references public.license_plans(id) on delete set null,
  kind            text not null default 'new' check (kind in ('new','renewal','upgrade','downgrade')),
  title           text not null,
  duration_months integer not null check (duration_months > 0),
  max_shops       integer not null check (max_shops > 0),
  modules         jsonb not null default '{}'::jsonb,
  amount          numeric(14,2) not null default 0 check (amount >= 0),
  payment_method  text not null check (payment_method in ('bkash','nagad','bank','other')),
  payment_number  text,
  transaction_id  text,
  status          text not null default 'pending' check (status in ('pending','active','rejected','expired')),
  starts_at       timestamptz,
  expires_at      timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.platform_owners(id) on delete set null,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status <> 'active' or (starts_at is not null and expires_at is not null and expires_at > starts_at))
);
create index licenses_admin_idx on public.licenses(admin_id, status, expires_at desc);

create table public.addons (
  key        text primary key check (key in ('connectx','zudo','business_health','truebill','vaultium')),
  enabled    boolean not null default false,
  title      text not null,
  details    text,
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  min_days   integer not null default 30 check (min_days > 0),
  max_days   integer not null default 365 check (max_days >= min_days),
  min_limit  integer not null default 1 check (min_limit >= 0),
  max_limit  integer not null default 100 check (max_limit >= min_limit),
  image_url  text,
  url        text,
  updated_by uuid references public.platform_owners(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.coupons (
  code        text primary key check (code = upper(code) and length(code) between 3 and 32),
  percent_off integer not null check (percent_off between 1 and 100),
  active      boolean not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table public.addon_purchases (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.admins(id) on delete cascade,
  addon_key       text not null references public.addons(key),
  days            integer not null check (days > 0),
  daily_limit     integer not null default 0 check (daily_limit >= 0),
  unit_price      numeric(14,2) not null default 0,
  amount          numeric(14,2) not null default 0 check (amount >= 0),
  coupon_code     text,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  payment_method  text not null check (payment_method in ('bkash','nagad','bank','other')),
  payment_number  text,
  transaction_id  text,
  status          text not null default 'pending' check (status in ('pending','active','rejected','expired')),
  starts_at       timestamptz,
  expires_at      timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.platform_owners(id) on delete set null,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index addon_purchases_admin_idx on public.addon_purchases(admin_id, addon_key, status);

-- ───────────────────────────── shop records ─────────────────────────────

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  code       text not null,
  name       text not null,
  phone      text,
  phone2     text,
  email      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);
create index customers_shop_name_idx on public.customers(shop_id, name);

create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  code       text not null,
  name       text not null,
  phone      text,
  phone2     text,
  email      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);
create index suppliers_shop_name_idx on public.suppliers(shop_id, name);

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  code       text not null,
  name       text not null,
  category   text,
  unit       text not null default 'pcs',
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  stock      numeric(14,3) not null default 0 check (stock >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);
create index products_shop_name_idx on public.products(shop_id, name);

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references public.shops(id) on delete cascade,
  kind               text not null check (kind in ('sale','purchase')),
  number             text not null,
  customer_id        uuid references public.customers(id) on delete set null,
  supplier_id        uuid references public.suppliers(id) on delete set null,
  party_name         text,
  party_phone        text,
  party_address      text,
  invoice_date       date not null default current_date,
  payment_method     text not null default 'cash' check (payment_method in ('cash','bank','bkash','nagad','other')),
  transaction_id     text,
  notes              text,
  subtotal           numeric(14,2) not null default 0,
  line_tax           numeric(14,2) not null default 0,
  line_discount      numeric(14,2) not null default 0,
  tax_percent        numeric(6,3) not null default 0 check (tax_percent >= 0),
  tax_amount         numeric(14,2) not null default 0,
  discount           numeric(14,2) not null default 0 check (discount >= 0),
  total              numeric(14,2) not null default 0 check (total >= 0),
  paid               numeric(14,2) not null default 0,
  due                numeric(14,2) generated always as (total - paid) stored,
  created_by         uuid,
  verification_token uuid not null unique default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (shop_id, kind, number),
  check (paid >= 0 and paid <= total),
  check (kind = 'sale' or customer_id is null),
  check (kind = 'purchase' or supplier_id is null)
);
create index invoices_shop_kind_date_idx on public.invoices(shop_id, kind, invoice_date desc);
create index invoices_customer_idx on public.invoices(customer_id);
create index invoices_supplier_idx on public.invoices(supplier_id);

create table public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity     numeric(14,3) not null check (quantity > 0),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  tax_percent  numeric(6,3) not null default 0 check (tax_percent >= 0),
  discount     numeric(14,2) not null default 0 check (discount >= 0),
  line_total   numeric(14,2) not null
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id);
create index invoice_lines_product_idx on public.invoice_lines(product_id);

create table public.returns (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references public.shops(id) on delete cascade,
  invoice_id         uuid not null references public.invoices(id) on delete restrict,
  number             text not null,
  customer_id        uuid references public.customers(id) on delete set null,
  customer_name      text,
  return_date        date not null default current_date,
  subtotal           numeric(14,2) not null default 0,
  tax_amount         numeric(14,2) not null default 0,
  discount_amount    numeric(14,2) not null default 0,
  penalty_amount     numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0 check (total >= 0),
  refunded           numeric(14,2) not null default 0 check (refunded >= 0),
  refund_method      text check (refund_method in ('cash','bank','bkash','nagad','other','none')),
  transaction_id     text,
  status             text not null default 'refunded' check (status in ('pending_refund','partially_refunded','refunded')),
  notes              text,
  created_by         uuid,
  verification_token uuid not null unique default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (shop_id, number),
  check (refunded <= total)
);
create index returns_invoice_idx on public.returns(invoice_id);
create index returns_shop_date_idx on public.returns(shop_id, return_date desc);

create table public.return_items (
  id              uuid primary key default gen_random_uuid(),
  return_id       uuid not null references public.returns(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete restrict,
  product_id      uuid not null references public.products(id) on delete restrict,
  quantity        numeric(14,3) not null check (quantity > 0),
  unit_price      numeric(14,2) not null default 0,
  tax_percent     numeric(6,3) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  discount        numeric(14,2) not null default 0,
  penalty         numeric(14,2) not null default 0,
  amount          numeric(14,2) not null default 0,
  reason          text not null check (reason in ('changed_mind','defective','wrong_product','damaged','wrong_spec','other')),
  reason_note     text,
  condition       text not null check (condition in ('sellable','damaged','defective','warranty')),
  serial          text,
  created_at      timestamptz not null default now()
);
create index return_items_return_idx on public.return_items(return_id);
create index return_items_line_idx on public.return_items(invoice_line_id);

create table public.exchanges (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references public.shops(id) on delete cascade,
  invoice_id         uuid not null references public.invoices(id) on delete restrict,
  number             text not null,
  customer_id        uuid references public.customers(id) on delete set null,
  customer_name      text,
  exchange_date      date not null default current_date,
  returned_total     numeric(14,2) not null default 0,
  new_subtotal       numeric(14,2) not null default 0,
  new_tax            numeric(14,2) not null default 0,
  new_discount       numeric(14,2) not null default 0,
  new_total          numeric(14,2) not null default 0,
  difference         numeric(14,2) not null default 0,
  settlement         text not null default 'even' check (settlement in ('payment','refund','even')),
  payment_method     text check (payment_method in ('cash','bank','bkash','nagad','other','none')),
  transaction_id     text,
  status             text not null default 'completed' check (status in ('completed','cancelled')),
  notes              text,
  created_by         uuid,
  verification_token uuid not null unique default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (shop_id, number)
);
create index exchanges_invoice_idx on public.exchanges(invoice_id);
create index exchanges_shop_date_idx on public.exchanges(shop_id, exchange_date desc);

create table public.exchange_items (
  id              uuid primary key default gen_random_uuid(),
  exchange_id     uuid not null references public.exchanges(id) on delete cascade,
  direction       text not null check (direction in ('returned','new')),
  invoice_line_id uuid references public.invoice_lines(id) on delete restrict,
  product_id      uuid not null references public.products(id) on delete restrict,
  quantity        numeric(14,3) not null check (quantity > 0),
  unit_price      numeric(14,2) not null default 0,
  tax_percent     numeric(6,3) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  discount        numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  reason          text check (reason in ('changed_mind','defective','wrong_product','damaged','wrong_spec','other')),
  reason_note     text,
  condition       text check (condition in ('sellable','damaged','defective','warranty')),
  created_at      timestamptz not null default now(),
  check (direction = 'new' or (invoice_line_id is not null and reason is not null and condition is not null))
);
create index exchange_items_exchange_idx on public.exchange_items(exchange_id);
create index exchange_items_line_idx on public.exchange_items(invoice_line_id);

create table public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  type         text not null check (type in ('return_in','return_quarantine','exchange_in','exchange_quarantine','exchange_out')),
  quantity     numeric(14,3) not null,
  stock_before numeric(14,3) not null,
  stock_after  numeric(14,3) not null,
  return_id    uuid references public.returns(id) on delete set null,
  exchange_id  uuid references public.exchanges(id) on delete set null,
  condition    text,
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index stock_movements_shop_idx on public.stock_movements(shop_id, created_at desc);
create index stock_movements_product_idx on public.stock_movements(product_id);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  code         text not null,
  expense_date date not null default current_date,
  details      text not null,
  total        numeric(14,2) not null check (total > 0),
  paid         numeric(14,2) not null default 0,
  due          numeric(14,2) generated always as (total - paid) stored,
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (shop_id, code),
  check (paid >= 0 and paid <= total)
);
create index expenses_shop_date_idx on public.expenses(shop_id, expense_date desc);

create table public.due_payments (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  source_type    text not null check (source_type in ('sale','purchase','expense')),
  source_id      uuid not null,
  amount         numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash','bank','bkash','nagad','other')),
  transaction_id text,
  note           text,
  recorded_by    uuid,
  created_at     timestamptz not null default now()
);
create index due_payments_shop_idx on public.due_payments(shop_id, created_at desc);
create index due_payments_source_idx on public.due_payments(source_type, source_id);

create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  date        date not null,
  status      text not null check (status in ('present','absent')),
  note        text,
  recorded_by uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (staff_id, date)
);
create index attendance_shop_date_idx on public.attendance(shop_id, date);

create table public.salary_payments (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  staff_id         uuid not null references public.staff(id) on delete cascade,
  month            text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  type             text not null default 'salary' check (type in ('salary','advance')),
  base_amount      numeric(14,2) not null default 0 check (base_amount >= 0),
  attendance_based boolean not null default false,
  present_days     integer not null default 0 check (present_days >= 0),
  total_days       integer not null default 0 check (total_days >= 0),
  incentive        numeric(14,2) not null default 0 check (incentive >= 0),
  bonus            numeric(14,2) not null default 0 check (bonus >= 0),
  fine             numeric(14,2) not null default 0 check (fine >= 0),
  other_deduction  numeric(14,2) not null default 0 check (other_deduction >= 0),
  advance_deducted numeric(14,2) not null default 0 check (advance_deducted >= 0),
  total            numeric(14,2) not null default 0 check (total >= 0),
  paid             numeric(14,2) not null default 0,
  due              numeric(14,2) generated always as (total - paid) stored,
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (paid >= 0 and paid <= total)
);
create index salary_payments_shop_month_idx on public.salary_payments(shop_id, month);
create index salary_payments_staff_idx on public.salary_payments(staff_id, month);

-- Per-scope counters for business numbers (CUS-0001, INV-000001, …).
create table public.counters (
  scope text not null,
  name  text not null,
  value bigint not null default 0,
  primary key (scope, name)
);

-- ───────────────────────────── platform content ─────────────────────────────

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.pages (
  slug       text primary key check (slug in ('about','terms','privacy','contact')),
  title      text not null,
  body       text not null default '',
  updated_by uuid references public.platform_owners(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null,
  excerpt         text,
  body            text not null default '',
  cover_image_url text,
  published       boolean not null default false,
  published_at    timestamptz,
  created_by      uuid references public.platform_owners(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index blog_posts_published_idx on public.blog_posts(published, published_at desc);

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text,
  subject    text,
  message    text not null,
  status     text not null default 'new' check (status in ('new','read','closed')),
  created_at timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages(status, created_at desc);

create table public.helpdesk_messages (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.admins(id) on delete cascade,
  sender        text not null check (sender in ('admin','owner')),
  body          text not null,
  read_by_admin boolean not null default false,
  read_by_owner boolean not null default false,
  created_at    timestamptz not null default now()
);
create index helpdesk_messages_admin_idx on public.helpdesk_messages(admin_id, created_at);

create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid references public.shops(id) on delete cascade,
  admin_id    uuid references public.admins(id) on delete cascade,
  actor_type  text not null check (actor_type in ('owner','admin','staff','system')),
  actor_id    uuid,
  action      text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_shop_idx on public.activity_logs(shop_id, created_at desc);
create index activity_logs_admin_idx on public.activity_logs(admin_id, created_at desc);
create index activity_logs_actor_idx on public.activity_logs(actor_type, created_at desc);

-- ───────────────────────────── integrations ─────────────────────────────

create table public.email_messages (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references public.shops(id) on delete cascade,
  sent_by             uuid,
  recipient_type      text not null check (recipient_type in ('customer','supplier','staff','manual')),
  recipient_id        uuid,
  invoice_id          uuid references public.invoices(id) on delete set null,
  from_email          text,
  to_emails           jsonb not null default '[]'::jsonb,
  cc_emails           jsonb not null default '[]'::jsonb,
  bcc_emails          jsonb not null default '[]'::jsonb,
  subject             text not null,
  custom_body         text,
  body_html           text,
  provider            text not null default 'brevo',
  provider_message_id text,
  status              text not null default 'queued' check (status in ('queued','sent','failed')),
  error               text,
  idempotency_key     text not null,
  hidden_at           timestamptz,
  hidden_by           uuid,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);
create index email_messages_shop_idx on public.email_messages(shop_id, created_at desc);

create table public.sms_settings (
  shop_id           uuid primary key references public.shops(id) on delete cascade,
  enabled           boolean not null default false,
  auto_sale         boolean not null default false,
  auto_payment      boolean not null default false,
  auto_due_reminder boolean not null default false,
  auto_return       boolean not null default false,
  auto_exchange     boolean not null default false,
  auto_refund       boolean not null default false,
  templates         jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

create table public.connect_connections (
  id                      text primary key,
  remote_application_id   text not null,
  remote_application_name text,
  remote_endpoint         text not null,
  remote_kind             text,
  permissions             jsonb not null default '[]'::jsonb,
  shared_secret           text not null,
  status                  text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','DISCONNECTED')),
  display_name            text,
  connected_at            timestamptz not null default now(),
  disconnected_at         timestamptz,
  last_seen_at            timestamptz,
  created_at              timestamptz not null default now()
);
create unique index connect_connections_active_idx on public.connect_connections(remote_application_id) where status = 'ACTIVE';

create table public.connect_requests (
  id                      text primary key,
  direction               text not null check (direction in ('inbound','outbound')),
  pairing_code            text,
  remote_application_id   text,
  remote_application_name text,
  remote_endpoint         text,
  display_name            text,
  requested_permissions   jsonb not null default '[]'::jsonb,
  status                  text not null default 'PENDING_APPROVAL' check (status in ('PENDING_APPROVAL','CONSUMED','REJECTED','EXPIRED','CANCELLED','FAILED')),
  connection_id           text references public.connect_connections(id) on delete set null,
  created_at              timestamptz not null default now(),
  expires_at              timestamptz not null
);
create index connect_requests_status_idx on public.connect_requests(status, expires_at);

create table public.sms_messages (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  sent_by         uuid,
  recipient_type  text not null check (recipient_type in ('customer','supplier','staff','manual')),
  recipient_id    uuid,
  recipient_name  text,
  to_phone        text not null,
  message_type    text not null default 'manual',
  event_type      text,
  invoice_id      uuid references public.invoices(id) on delete set null,
  body            text not null,
  status          text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  attempts        integer not null default 0,
  error           text,
  request_id      text unique,
  connection_id   text references public.connect_connections(id) on delete set null,
  sim_used        text,
  idempotency_key text not null,
  claimed_at      timestamptz,
  result_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);
create index sms_messages_shop_idx on public.sms_messages(shop_id, created_at desc);
create index sms_messages_status_idx on public.sms_messages(status, created_at);

create table public.app_store_apps (
  id             uuid primary key default gen_random_uuid(),
  package_name   text not null unique,
  title          text not null,
  description    text,
  version        text not null,
  version_code   integer not null check (version_code > 0),
  icon_r2_key    text,
  icon_url       text check (icon_url is null or icon_url like 'https://%'),
  apk_r2_key     text,
  apk_url        text check (apk_url is null or apk_url like 'https://%'),
  apk_filename   text,
  apk_size_bytes bigint,
  mandatory      boolean not null default false,
  release_notes  text,
  published      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.vaultium_files (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references public.admins(id) on delete cascade,
  shop_id      uuid not null references public.shops(id) on delete cascade,
  invoice_id   uuid references public.invoices(id) on delete set null,
  expense_id   uuid references public.expenses(id) on delete set null,
  filename     text not null,
  content_type text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  r2_key       text not null unique,
  uploaded_by  uuid,
  created_at   timestamptz not null default now()
);
create index vaultium_files_shop_idx on public.vaultium_files(shop_id, created_at desc);
create index vaultium_files_admin_idx on public.vaultium_files(admin_id);

create table public.zudo_conversations (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  user_id    uuid not null,
  title      text not null,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index zudo_conversations_shop_idx on public.zudo_conversations(shop_id, user_id, updated_at desc);

create table public.zudo_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zudo_conversations(id) on delete cascade,
  shop_id         uuid not null references public.shops(id) on delete cascade,
  user_id         uuid not null,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index zudo_messages_conversation_idx on public.zudo_messages(conversation_id, created_at);
create index zudo_messages_daily_idx on public.zudo_messages(shop_id, role, created_at);

create table public.business_health_reports (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  user_id    uuid not null,
  start_date date not null,
  end_date   date not null,
  score      integer not null check (score between 0 and 100),
  snapshot   jsonb not null default '{}'::jsonb,
  insights   text not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index business_health_reports_shop_idx on public.business_health_reports(shop_id, created_at desc);

create table public.verification_scans (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  document_type   text not null check (document_type in ('invoice','return','exchange')),
  document_id     uuid not null,
  document_number text,
  ip              text,
  user_agent      text,
  scanned_at      timestamptz not null default now()
);
create index verification_scans_shop_idx on public.verification_scans(shop_id, scanned_at desc);

-- ───────────────────────────── access ─────────────────────────────
-- RLS on, no policies: the anon/authenticated (browser) roles can read nothing.
-- Supabase no longer grants table access automatically, so the server key's role
-- (service_role; it bypasses RLS but not privileges) is granted explicitly.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant select, insert, update, delete on all tables in schema public to service_role;
    grant usage, select on all sequences in schema public to service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
    alter default privileges in schema public grant usage, select on sequences to service_role;
  end if;
end $$;

-- EMS 5 — database functions (PostgreSQL / Supabase).
--
-- The Data API (PostgREST) has no client-side transactions, so operations that
-- must be atomic run here. Totals are computed by the application
-- (src/lib/invoice-math.ts) and passed in; these functions enforce tenant
-- ownership, stock rules and numbering inside one transaction.
-- Callable only with the server key (service_role).

-- Next value of a per-scope counter (CUS-0001, INV-000001, …).
create function public.next_counter(p_scope text, p_name text)
returns bigint
language sql
set search_path = public
as $$
  insert into counters (scope, name, value) values (p_scope, p_name, 1)
  on conflict (scope, name) do update set value = counters.value + 1
  returning value;
$$;

-- Post a sale or purchase invoice: number, header, lines and stock in one step.
create function public.post_invoice(p_invoice jsonb, p_lines jsonb)
returns public.invoices
language plpgsql
set search_path = public
as $$
declare
  v_shop     uuid := (p_invoice->>'shop_id')::uuid;
  v_kind     text := p_invoice->>'kind';
  v_customer uuid := nullif(p_invoice->>'customer_id', '')::uuid;
  v_supplier uuid := nullif(p_invoice->>'supplier_id', '')::uuid;
  v_inv      public.invoices;
  v_short    record;
begin
  if v_kind is null or v_kind not in ('sale', 'purchase') then
    raise exception 'Invalid invoice type';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the invoice';
  end if;
  if v_customer is not null and not exists (select 1 from customers where id = v_customer and shop_id = v_shop) then
    raise exception 'Customer not found in this shop';
  end if;
  if v_supplier is not null and not exists (select 1 from suppliers where id = v_supplier and shop_id = v_shop) then
    raise exception 'Supplier not found in this shop';
  end if;

  -- Lock the products involved; they must belong to this shop and be active.
  perform 1 from products
   where id in (select (l->>'product_id')::uuid from jsonb_array_elements(p_lines) l)
   for update;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
      left join products p on p.id = (l->>'product_id')::uuid and p.shop_id = v_shop and p.active
     where p.id is null
  ) then
    raise exception 'Item not found in this shop';
  end if;

  if v_kind = 'sale' then
    select p.code into v_short
      from (select (l->>'product_id')::uuid as pid, sum((l->>'quantity')::numeric) as qty
              from jsonb_array_elements(p_lines) l group by 1) need
      join products p on p.id = need.pid
     where p.stock < need.qty
     limit 1;
    if found then
      raise exception 'Insufficient stock for item %', v_short.code;
    end if;
  end if;

  insert into invoices (
    shop_id, kind, number, customer_id, supplier_id, party_name, party_phone, party_address,
    invoice_date, payment_method, transaction_id, notes,
    subtotal, line_tax, line_discount, tax_percent, tax_amount, discount, total, paid, created_by
  ) values (
    v_shop, v_kind,
    (case v_kind when 'sale' then 'INV-' else 'PUR-' end)
      || lpad(next_counter(v_shop::text, 'invoice:' || v_kind)::text, 6, '0'),
    v_customer, v_supplier,
    nullif(p_invoice->>'party_name', ''), nullif(p_invoice->>'party_phone', ''), nullif(p_invoice->>'party_address', ''),
    coalesce(nullif(p_invoice->>'invoice_date', '')::date, current_date),
    coalesce(nullif(p_invoice->>'payment_method', ''), 'cash'),
    nullif(p_invoice->>'transaction_id', ''), nullif(p_invoice->>'notes', ''),
    (p_invoice->>'subtotal')::numeric, (p_invoice->>'line_tax')::numeric, (p_invoice->>'line_discount')::numeric,
    (p_invoice->>'tax_percent')::numeric, (p_invoice->>'tax_amount')::numeric, (p_invoice->>'discount')::numeric,
    (p_invoice->>'total')::numeric, (p_invoice->>'paid')::numeric,
    nullif(p_invoice->>'created_by', '')::uuid
  ) returning * into v_inv;

  insert into invoice_lines (invoice_id, product_id, product_name, quantity, unit_price, tax_percent, discount, line_total)
  select v_inv.id, p.id, p.name,
         (l->>'quantity')::numeric, (l->>'unit_price')::numeric,
         coalesce((l->>'tax_percent')::numeric, 0), coalesce((l->>'discount')::numeric, 0),
         (l->>'line_total')::numeric
    from jsonb_array_elements(p_lines) with ordinality as e(l, n)
    join products p on p.id = (e.l->>'product_id')::uuid
   order by e.n;

  update products p
     set stock = p.stock + (case v_kind when 'sale' then -need.qty else need.qty end),
         updated_at = now()
    from (select (l->>'product_id')::uuid as pid, sum((l->>'quantity')::numeric) as qty
            from jsonb_array_elements(p_lines) l group by 1) need
   where p.id = need.pid;

  return v_inv;
end $$;

-- Delete a posted invoice and reverse its stock effect.
create function public.delete_invoice(p_shop_id uuid, p_invoice_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_inv   public.invoices;
  v_short record;
begin
  select * into v_inv from invoices where id = p_invoice_id and shop_id = p_shop_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if exists (select 1 from returns where invoice_id = v_inv.id) then
    raise exception 'This invoice has returns and cannot be deleted';
  end if;
  if exists (select 1 from exchanges where invoice_id = v_inv.id) then
    raise exception 'This invoice has exchanges and cannot be deleted';
  end if;
  if exists (select 1 from due_payments where source_type = v_inv.kind and source_id = v_inv.id) then
    raise exception 'Due payments were recorded for this invoice, so it cannot be deleted';
  end if;

  perform 1 from products where id in (select product_id from invoice_lines where invoice_id = v_inv.id) for update;
  if v_inv.kind = 'purchase' then
    select p.code into v_short
      from (select product_id, sum(quantity) as qty from invoice_lines where invoice_id = v_inv.id group by 1) l
      join products p on p.id = l.product_id
     where p.stock < l.qty
     limit 1;
    if found then
      raise exception 'Stock from this purchase was already sold (item %), so it cannot be deleted', v_short.code;
    end if;
  end if;

  update products p
     set stock = p.stock + (case v_inv.kind when 'sale' then l.qty else -l.qty end),
         updated_at = now()
    from (select product_id, sum(quantity) as qty from invoice_lines where invoice_id = v_inv.id group by 1) l
   where p.id = l.product_id;

  delete from invoices where id = v_inv.id;
end $$;

-- Factory reset: remove every record and restore the default settings
-- (the next visitor can create the platform owner again). Owner console only.
-- Runs as the table owner (TRUNCATE is deliberately not granted to service_role).
create function public.factory_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_tables text;
begin
  select string_agg(format('public.%I', tablename), ', ') into v_tables
    from pg_tables where schemaname = 'public' and tablename <> '_ems_migrations';
  execute 'truncate table ' || v_tables || ' restart identity cascade';
  perform seed_defaults();
end $$;

-- Only the server key may call these.
do $$
declare
  f text;
  r text;
begin
  foreach f in array array['next_counter(text, text)', 'post_invoice(jsonb, jsonb)', 'delete_invoice(uuid, uuid)', 'factory_reset()'] loop
    execute format('revoke all on function public.%s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on function public.%s from %I', f, r);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

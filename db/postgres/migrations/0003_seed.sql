-- EMS 5 — essential configuration only (no business records, no accounts).
-- The platform owner account is created in the app (Setup) after deployment.

create function public.seed_defaults()
returns void
language sql
set search_path = public
as $$
  -- Marks this database as an EMS 5 database; the app checks it before use.
  insert into settings (key, value) values ('schema', '{"product": "ems", "version": 5}'::jsonb)
  on conflict (key) do nothing;
  -- Add-on catalogue (disabled until the owner sets it up).
  insert into addons (key, title) values
    ('connectx', 'ConnectX'),
    ('zudo', 'Zudo AI'),
    ('business_health', 'AI Business Health'),
    ('truebill', 'TrueBill'),
    ('vaultium', 'Vaultium')
  on conflict (key) do nothing;
$$;

select public.seed_defaults();

do $$
declare r text;
begin
  revoke all on function public.seed_defaults() from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.seed_defaults() from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.seed_defaults() to service_role;
  end if;
end $$;

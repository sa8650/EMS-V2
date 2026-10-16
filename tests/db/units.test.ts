import { describe, expect, it, vi } from 'vitest';
import { computeInvoiceTotals, round2 } from '@/lib/invoice-math';
import { parseSelect } from '@/server/db/query';
import { mapPostgrestError, SupabaseDatabase } from '@/server/db/supabase';

describe('round2 (PostgreSQL numeric rounding)', () => {
  it.each([
    [1.005, 1.01], [2.675, 2.68], [1.255, 1.26], [-1.005, -1.01], [0.1 + 0.2, 0.3], [1e-9, 0], [123456.785, 123456.79], ['7.125', 7.13], [null, 0],
  ])('round2(%s) = %s', (input, expected) => expect(round2(input)).toBe(expected));
});

describe('computeInvoiceTotals', () => {
  it('matches the documented formula', () => {
    const t = computeInvoiceTotals(
      [{ quantity: 3, unitPrice: 650.5, taxPercent: 7.5, discount: 10 }, { quantity: 1.5, unitPrice: 180.33 }],
      { taxPercent: 5, discount: 20, paid: 1000 },
    );
    expect(t.lines[0]).toMatchObject({ subtotal: 1951.5, tax: 146.36, discount: 10, total: 2087.86 });
    expect(t.lines[1]).toMatchObject({ subtotal: 270.5, tax: 0, total: 270.5 });
    expect(t).toMatchObject({ subtotal: 2222, taxAmount: 111.1, lineTaxAmount: 146.36, lineDiscountAmount: 10, discount: 20, total: 2449.46, totalDue: 1449.46 });
  });
  it('rejects overpayment and oversized discounts', () => {
    expect(() => computeInvoiceTotals([{ quantity: 1, unitPrice: 10 }], { paid: 11 })).toThrow('Paid amount cannot exceed invoice total');
    expect(() => computeInvoiceTotals([{ quantity: 1, unitPrice: 10, discount: 11, label: 'ITM-1' }], {})).toThrow('Item discount cannot exceed the item total for ITM-1');
  });
});

describe('parseSelect', () => {
  it('parses columns, nested embeds, aliases, hints and !inner', () => {
    expect(parseSelect('*,admin:administrators!licenses_admin_id_fkey(name),stores!inner(id,name),invoice_lines(*,inventory_items(item_code))')).toEqual({
      columns: ['*'],
      embeds: [
        { alias: 'admin', resource: 'administrators', hint: 'licenses_admin_id_fkey', inner: false, columns: ['name'], embeds: [] },
        { alias: 'stores', resource: 'stores', hint: undefined, inner: true, columns: ['id', 'name'], embeds: [] },
        { alias: 'invoice_lines', resource: 'invoice_lines', hint: undefined, inner: false, columns: ['*'], embeds: [
          { alias: 'inventory_items', resource: 'inventory_items', hint: undefined, inner: false, columns: ['item_code'], embeds: [] },
        ] },
      ],
    });
  });
  it('rejects malformed input', () => {
    expect(() => parseSelect('stores(name')).toThrow();
    expect(() => parseSelect('a b')).toThrow();
  });
});

describe('Supabase adapter request encoding', () => {
  function capture(body: unknown = []) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { db: new SupabaseDatabase('https://proj.supabase.co/', 'service-key', fetchImpl), calls };
  }

  it('encodes filters, quoting and ordering like PostgREST expects', async () => {
    const { db, calls } = capture();
    await db.from('customers').select('id,name').eq('shop_id', 's 1').in('name', ['a,b', 'plain', 'q"t']).eq('email', null).search(['name', 'phone'], 'Rahim (01711)').order('name', 'desc').limit(5).offset(10);
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/rest/v1/customers');
    expect(u.searchParams.get('select')).toBe('id,name');
    expect(u.searchParams.get('shop_id')).toBe('eq.s 1');
    expect(u.searchParams.get('or')).toBe('(name.ilike."*Rahim 01711*",phone.ilike."*Rahim 01711*")');
    expect(u.searchParams.get('name')).toBe('in.("a,b",plain,"q\\"t")');
    expect(u.searchParams.get('email')).toBe('is.null');
    expect(u.searchParams.get('order')).toBe('name.desc');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('offset')).toBe('10');
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h.apikey).toBe('service-key');
    expect(h.Authorization).toBe('Bearer service-key');
  });

  it('sends sb_secret_ keys only in the apikey header; legacy JWT keys also as bearer', async () => {
    const calls: Headers[] = [];
    const fetchImpl = (async (_u: string | URL | Request, init?: RequestInit) => {
      calls.push(new Headers(init?.headers));
      return new Response('[]', { status: 200 });
    }) as typeof fetch;
    await new SupabaseDatabase('https://p.supabase.co', 'sb_secret_abc123', fetchImpl).from('shops').select('id');
    await new SupabaseDatabase('https://p.supabase.co', 'eyJhbGciOiJIUzI1NiJ9.legacy.sig', fetchImpl).from('shops').select('id');
    expect(calls[0]!.get('apikey')).toBe('sb_secret_abc123');
    expect(calls[0]!.has('authorization')).toBe(false);
    expect(calls[1]!.get('authorization')).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.legacy.sig');
  });

  it('sends upserts with merge-duplicates and on_conflict', async () => {
    const { db, calls } = capture([{ id: 1 }]);
    await db.from('attendance').upsert({ staff_id: 'x', date: '2026-10-01' }, { onConflict: 'staff_id,date' });
    const u = new URL(calls[0]!.url);
    expect(calls[0]!.init.method).toBe('POST');
    expect(u.searchParams.get('on_conflict')).toBe('staff_id,date');
    expect((calls[0]!.init.headers as Record<string, string>).Prefer).toContain('resolution=merge-duplicates');
  });

  it('counts with a HEAD request and Prefer: count=exact', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (u: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(u), init: init ?? {} });
      return new Response(null, { status: 200, headers: { 'content-range': '*/42' } });
    }) as typeof fetch;
    const n = await new SupabaseDatabase('https://p.supabase.co', 'k', fetchImpl).from('customers').eq('shop_id', 's').count();
    expect(n).toBe(42);
    expect(calls[0]!.init.method).toBe('HEAD');
    expect((calls[0]!.init.headers as Record<string, string>).Prefer).toBe('count=exact');
  });

  it('refuses unfiltered updates and deletes', async () => {
    const { db } = capture();
    expect(() => db.from('shops').update({ name: 'x' })).toThrow('without a filter');
    expect(() => db.from('shops').delete()).toThrow('without a filter');
  });

  it('maps PostgREST errors to HTTP semantics', () => {
    expect(mapPostgrestError(400, { code: 'P0001', message: 'Insufficient stock for item ITM-1' }, 'x')).toMatchObject({ status: 400, message: 'Insufficient stock for item ITM-1' });
    expect(mapPostgrestError(409, { code: '23505', message: 'dup' }, 'x')).toMatchObject({ status: 409 });
    expect(mapPostgrestError(500, null, 'boom')).toMatchObject({ status: 500, message: 'boom' });
  });
});

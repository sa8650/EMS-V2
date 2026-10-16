import 'server-only';
import { round2 } from '@/lib/invoice-math';
import { instantRange, today } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { logActivity } from '@/server/activity';
import { aiConfigured, runAI, type ChatMessage } from '@/server/ai';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { AppError, notFound } from '@/server/errors';
import { addonAllowance } from '@/server/licensing';
import { getSetting } from '@/server/settings';
import { zudoLangDirective } from '@/server/zudo/language';

/**
 * Zudo AI (read-only assistant over the shop's own data) and AI Business Health
 * (period score with rule-based findings and AI-written advice). Both are
 * limited per shop per day by the add-on allowance and platform-wide by the
 * owner's daily cap. Customer contact details are never sent to the AI provider.
 */

const dayStart = () => instantRange(today(), today()).start;

async function checkLimits(db: Database, shop: { id: string; admin_id: string }, key: 'zudo' | 'business_health') {
  const [allowance, setting] = await Promise.all([addonAllowance(db, shop.admin_id, key), getSetting(db, key)]);
  if (!setting.enabled) throw new AppError('This AI service is switched off by the platform owner.', 403);
  if (!allowance) throw new AppError('This add-on is not active for your shop.', 403);
  const since = dayStart();
  const [shopUsed, allUsed] = key === 'zudo'
    ? await Promise.all([db.from('zudo_messages').eq('shop_id', shop.id).eq('role', 'user').gte('created_at', since).count(), db.from('zudo_messages').eq('role', 'user').gte('created_at', since).count()])
    : await Promise.all([db.from('business_health_reports').eq('shop_id', shop.id).gte('created_at', since).count(), db.from('business_health_reports').gte('created_at', since).count()]);
  if (shopUsed >= allowance.limit) throw new AppError(`Today's limit of ${allowance.limit} has been reached. It resets at midnight.`, 429);
  if (setting.global_daily_limit > 0 && allUsed >= setting.global_daily_limit) throw new AppError('The platform-wide daily limit has been reached. Please try again tomorrow.', 429);
  return { allowance, setting, used: shopUsed };
}

export async function aiStatus(db: Database, env: AppEnv, shop: { id: string; admin_id: string }, key: 'zudo' | 'business_health') {
  const [allowance, setting] = await Promise.all([addonAllowance(db, shop.admin_id, key), getSetting(db, key)]);
  const since = dayStart();
  const used = key === 'zudo'
    ? await db.from('zudo_messages').eq('shop_id', shop.id).eq('role', 'user').gte('created_at', since).count()
    : await db.from('business_health_reports').eq('shop_id', shop.id).gte('created_at', since).count();
  return { active: !!allowance && setting.enabled, limit: allowance?.limit ?? 0, used, configured: aiConfigured(env, setting.model), enabled: setting.enabled };
}

/* ───────────────────────────── Zudo ───────────────────────────── */

async function shopContextData(db: Database, shopId: string) {
  const [sales, purchases, expenses, products, customers, returns, staff] = await Promise.all([
    db.from('invoices').select('number,invoice_date,party_name,total,paid,due').eq('shop_id', shopId).eq('kind', 'sale').order('invoice_date', 'desc').limit(200),
    db.from('invoices').select('number,invoice_date,party_name,total,paid,due').eq('shop_id', shopId).eq('kind', 'purchase').order('invoice_date', 'desc').limit(150),
    db.from('expenses').select('code,expense_date,details,total,paid,due').eq('shop_id', shopId).order('expense_date', 'desc').limit(150),
    db.from('products').select('code,name,category,unit,sale_price,stock,active').eq('shop_id', shopId).order('stock').limit(400),
    db.from('customers').select('code,name').eq('shop_id', shopId).limit(300),
    db.from('returns').select('number,return_date,customer_name,total,refunded').eq('shop_id', shopId).order('return_date', 'desc').limit(100),
    db.from('staff').select('full_name,position,active').eq('shop_id', shopId).limit(50),
  ]);
  return { today: today(), sales, purchases, expenses, products, customers, returns, staff };
}

export async function conversations(db: Database, shopId: string, userId: string) {
  return db.from('zudo_conversations').select('id,title,updated_at').eq('shop_id', shopId).eq('user_id', userId).is('deleted_at', null).order('updated_at', 'desc').limit(50);
}

export async function conversationMessages(db: Database, shopId: string, userId: string, id: string) {
  const conv = await db.from('zudo_conversations').select('id,title').eq('id', id).eq('shop_id', shopId).eq('user_id', userId).is('deleted_at', null).maybeSingle();
  if (!conv) return null;
  return { conv, messages: await db.from('zudo_messages').select('id,role,content,created_at').eq('conversation_id', id).order('created_at').limit(200) };
}

export async function askZudo(ctx: ShopContext, env: AppEnv, conversationId: string | null, question: string): Promise<string> {
  const { db, shop } = ctx;
  const q = question.trim().slice(0, 2000);
  if (!q) throw new AppError('Write a question.', 400, { question: 'Write a question' });
  const { setting } = await checkLimits(db, shop, 'zudo');
  if (!aiConfigured(env, setting.model)) throw new AppError('The AI provider is not configured. Ask the platform owner to set it up.', 503);

  let conv = conversationId ? await db.from('zudo_conversations').select('id').eq('id', conversationId).eq('shop_id', shop.id).eq('user_id', ctx.actor.id).is('deleted_at', null).maybeSingle() : null;
  if (!conv) conv = await db.from('zudo_conversations').insertOne({ shop_id: shop.id, user_id: ctx.actor.id, title: q.slice(0, 60) });
  const history = await db.from('zudo_messages').select('role,content').eq('conversation_id', conv.id).order('created_at', 'desc').limit(10);

  const data = await shopContextData(db, shop.id);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are Zudo, the read-only assistant of the shop "${shop.name}". Answer only from the shop data below (JSON). You cannot change anything; ` +
        `if asked to, explain where in the app it can be done. Amounts are in BDT (৳). Be concise and exact; say so when the data does not contain the answer. ` +
        `${zudoLangDirective(q)}\n\nSHOP DATA:\n${JSON.stringify(data)}`,
    },
    ...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: q },
  ];
  await db.from('zudo_messages').insert({ conversation_id: conv.id, shop_id: shop.id, user_id: ctx.actor.id, role: 'user', content: q });
  const answer = (await runAI(env, setting.model, messages, 0.2, 900)).trim() || 'I could not find an answer in your shop data.';
  await db.from('zudo_messages').insert({ conversation_id: conv.id, shop_id: shop.id, user_id: ctx.actor.id, role: 'assistant', content: answer });
  await db.from('zudo_conversations').eq('id', conv.id).update({});
  return conv.id;
}

export async function deleteConversation(ctx: ShopContext, id: string) {
  const [row] = await ctx.db.from('zudo_conversations').eq('id', id).eq('shop_id', ctx.shop.id).eq('user_id', ctx.actor.id).update({ deleted_at: new Date().toISOString(), deleted_by: ctx.actor.id });
  if (!row) throw notFound('Conversation');
}

/* ───────────────────────────── Business Health ───────────────────────────── */

export async function healthSnapshot(db: Database, shop: RowOf<'shops'>, from: string, to: string) {
  const { start, end } = instantRange(from, to);
  const [sales, purchases, expenses, returns, exchanges, recoveries, products] = await Promise.all([
    db.from('invoices').select('total,paid,due,discount,line_discount').eq('shop_id', shop.id).eq('kind', 'sale').gte('invoice_date', from).lte('invoice_date', to),
    db.from('invoices').select('total').eq('shop_id', shop.id).eq('kind', 'purchase').gte('invoice_date', from).lte('invoice_date', to),
    db.from('expenses').select('total').eq('shop_id', shop.id).gte('expense_date', from).lte('expense_date', to),
    db.from('returns').select('total').eq('shop_id', shop.id).gte('return_date', from).lte('return_date', to),
    db.from('exchanges').select('new_total').eq('shop_id', shop.id).gte('exchange_date', from).lte('exchange_date', to),
    db.from('due_payments').select('amount').eq('shop_id', shop.id).eq('source_type', 'sale').gte('created_at', start).lt('created_at', end),
    db.from('products').select('name,stock').eq('shop_id', shop.id).eq('active', true).lte('stock', shop.low_stock_threshold).limit(200),
  ]);
  const sum = <T extends Record<string, unknown>>(rows: T[], k: keyof T) => round2(rows.reduce((t, r) => t + Number(r[k] ?? 0), 0));
  const salesTotal = sum(sales, 'total');
  const dueTotal = sum(sales, 'due');
  const discount = round2(sum(sales, 'discount') + sum(sales, 'line_discount'));
  const returnsTotal = sum(returns, 'total');
  const purchaseTotal = sum(purchases, 'total');
  const expenseTotal = sum(expenses, 'total');
  const recovered = sum(recoveries, 'amount');
  const netSales = round2(salesTotal - returnsTotal);
  const profit = round2(netSales - purchaseTotal - expenseTotal);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  const collectionRate = pct(sum(sales, 'paid'), salesTotal);
  const dueRate = pct(dueTotal, salesTotal);
  const discountRate = pct(discount, salesTotal);
  const returnRate = pct(returnsTotal, salesTotal) ?? 0;
  const marginPct = pct(profit, netSales);
  const recoveryRate = dueTotal + recovered > 0 ? Math.round((recovered / (dueTotal + recovered)) * 100) : null;
  const outStock = products.filter((p) => Number(p.stock) <= 0);
  const missing = (['address', 'phone', 'email'] as const).filter((k) => !shop[k]);

  // Score rules carried over unchanged from EMS 4.x.
  let score = 100;
  if (salesTotal <= 0) score -= 15;
  else score -= Math.min(25, Math.round(((dueRate ?? 0) / 100) * 25));
  if (collectionRate !== null && collectionRate < 60) score -= 10;
  if (discountRate !== null) score -= Math.min(10, Math.max(0, Math.round((discountRate - 10) / 2)));
  if (returnRate > 10) score -= Math.min(10, Math.round((returnRate - 10) / 2));
  if (salesTotal > 0) {
    if (profit < 0) score -= 15;
    else if ((marginPct ?? 0) < 10) score -= 8;
  }
  score -= Math.min(10, products.length * 2);
  score -= Math.min(10, missing.length * 3);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const f: string[] = [];
  if (!sales.length) f.push('No sales were recorded in this period.');
  if (dueTotal > 0) f.push(`${formatMoney(dueTotal)} of this period's sales is still owed by customers.`);
  if (collectionRate !== null && collectionRate < 60) f.push(`Only ${collectionRate}% of sales value was collected at the time of sale.`);
  if (discountRate !== null && discountRate > 20) f.push(`Discounts are high: ${discountRate}% of sales (${formatMoney(discount)}).`);
  if (returnsTotal > 0) f.push(`Returns came to ${formatMoney(returnsTotal)} (${returnRate}% of sales).`);
  if (exchanges.length) f.push(`${exchanges.length} exchange(s) gave out ${formatMoney(sum(exchanges, 'new_total'))} in replacement items.`);
  if (profit < 0 && salesTotal > 0) f.push(`Purchases and expenses (${formatMoney(purchaseTotal + expenseTotal)}) were more than net sales (${formatMoney(netSales)}).`);
  else if (marginPct !== null && marginPct < 10) f.push(`Sales minus purchases and expenses is only ${marginPct}% of net sales.`);
  if (outStock.length) f.push(`${outStock.length} product(s) are out of stock.`);
  else if (products.length) f.push(`${products.length} product(s) are at or below the low-stock level (${shop.low_stock_threshold}).`);
  if (recoveryRate !== null && recoveryRate < 20 && dueTotal > 0) f.push(`Only ${recoveryRate}% of dues were collected during the period.`);
  if (missing.length) f.push(`The shop profile is missing: ${missing.join(', ')}. It appears on invoices.`);
  if (!f.length) f.push('No risks were found for this period.');

  return {
    score,
    findings: f,
    snapshot: {
      period: { from, to }, salesTotal, dueTotal, discount, returnsTotal, purchaseTotal, expenseTotal, recovered, netSales, profit,
      ratios: { collectionRate, dueRate, discountRate, returnRate, marginPct, recoveryRate }, lowStock: products.length, outOfStock: outStock.length,
      invoices: sales.length, findings: f,
    },
  };
}

export async function createHealthReport(ctx: ShopContext, env: AppEnv, from: string, to: string) {
  const { db, shop } = ctx;
  if (to < from) throw new AppError('The end date is before the start date.', 400);
  const { setting } = await checkLimits(db, shop, 'business_health');
  if (!aiConfigured(env, setting.model)) throw new AppError('The AI provider is not configured. Ask the platform owner to set it up.', 503);
  const { score, snapshot, findings } = await healthSnapshot(db, shop, from, to);
  const insights = (await runAI(env, setting.model, [
    { role: 'system', content: 'You are a retail business advisor. Using only the numbers given, write 4–6 short, practical recommendations for the shop owner. Amounts are in BDT. No headings, no invented numbers.' },
    { role: 'user', content: `Shop: ${shop.name} (${shop.category}). Health score ${score}/100.\nFindings:\n- ${findings.join('\n- ')}\nNumbers: ${JSON.stringify(snapshot)}` },
  ], 0.3, 700)).trim();
  const report = await db.from('business_health_reports').insertOne({ shop_id: shop.id, user_id: ctx.actor.id, start_date: from, end_date: to, score, snapshot, insights: insights || findings.join('\n') });
  await logActivity(db, { shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'created business health report', entityType: 'business_health_reports', entityId: report.id, metadata: { score } });
  return report;
}

export async function healthReports(db: Database, shopId: string) {
  return db.from('business_health_reports').select('*').eq('shop_id', shopId).order('created_at', 'desc').limit(20);
}

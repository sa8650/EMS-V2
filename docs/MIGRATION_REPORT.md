# Migration report — EMS 4.x → EMS 5

EMS was rebuilt as a Next.js App Router application. The 4.x code (a Cloudflare Pages static SPA with Pages Functions) served as the reference for requirements and behaviour; no legacy file was renamed or wrapped. The database is a fresh EMS 5 schema for a new launch: no records are imported.

Branch: `nextjs-migration` (the original state is tagged `pre-nextjs-migration`). A separate branch, `hotfix/security-supabase-keys`, patches the live 4.x app (password reset and Supabase keys) until the switch.

## Result at a glance

| Area | 4.x | EMS 5 |
| --- | --- | --- |
| UI | one 577 KB `assets/js/app.js` SPA + `index.html`, string-built HTML | 62 server-rendered App Router pages, React components, CSS Modules, design tokens |
| API | `functions/api/[[path]].js` if-chain (134 paths) | Server Actions for the consoles; Route Handlers only for external clients (`/connect`, `/api/app-store/*`, `/api/files/[id]`) |
| Data access | PostgREST paths built as strings; separate D1 emulation | typed query builder over one `Database` interface; D1 and Supabase adapters |
| Schema | ~55 tables accumulated by 46 numbered migrations, legacy fallbacks | 43 tables designed for the product, one migration set per provider, CHECK/FK constraints |
| Hosting | Cloudflare Pages | Cloudflare Workers (OpenNext) or Node.js |

## Structure

See [ARCHITECTURE.md](ARCHITECTURE.md). In short: `src/app` (routes), `src/components` (ui, console, site), `src/server` (db adapters, auth, services, integrations), `src/lib` (shared pure code), `src/config` (module registry), `db/*/migrations`, `tests`, `docs`.

## Feature mapping

| 4.x feature | EMS 5 location |
| --- | --- |
| Owner/admin/staff sign-in, registration, first-owner setup, password reset (email code) | `(auth)/login`, `register`, `setup`, `forgot-password`; `server/auth/*` |
| Owner overview, administrators, shops, factory reset | `/owner`, `/owner/administrators`, `/owner/shops`, `/owner/system` |
| Licence plans, licence purchase/renewal/upgrade, review | `/owner/plans`, `/owner/licenses`, `/admin/licenses` |
| Add-ons (catalogue, coupons, checkout, review, usage) | `/owner/addons`, `/admin/addons` |
| Website: branding, theme colours, pages, blog, contact inbox | `/owner/branding`, `/owner/pages`, `/owner/blog`, `/owner/messages`, public pages |
| Help desk | `/owner/helpdesk`, `/admin/helpdesk` |
| Admin shops (create, edit, capacity, delete, enter shop), devices, profile | `/admin/shops`, `/admin/devices`, `/admin/profile` |
| Shop dashboard, notifications | `/shop` (Bento tiles + "Needs attention"); admin "Needs attention" |
| Customers, suppliers, inventory, expenses | `/shop/customers`, `/shop/suppliers`, `/shop/inventory`, `/shop/expenses` |
| Sale/purchase invoices, printing, deletion with stock reversal | `/shop/sales`, `/shop/purchases` (editor, printable view) |
| Returns, exchanges, damaged/defective quarantine | `/shop/returns` (+ return/exchange documents) |
| Due recovery | `/shop/dues` |
| Staff, permissions, attendance, salary/advances | `/shop/staff` |
| Reports, activity log, shop settings | `/shop/reports`, `/shop/activity`, `/shop/settings` |
| ConnectX email, SMS settings, SMS queue, auto SMS | `/shop/connectx`, `/owner/connectx` |
| Connect App pairing and protocol | `/owner/connect-app`, `POST /connect` |
| Zudo AI, AI Business Health, AI settings | `/shop/zudo`, `/shop/health`, `/owner/ai` |
| TrueBill verification | `/verify/[token]`, `/owner/truebill`, QR codes on documents |
| Vaultium files | `/shop/files`, `/api/files/[id]`, owner storage overview |
| App Store (publish, public API used by Android apps) | `/owner/apps`, `/apps`, `/api/app-store/*` (same URLs) |

Consolidations: per-shop SMS settings are edited inside the shop console (administrators have full access there) instead of a separate admin ConnectX page; the owner's Zudo and Business Health pages became one AI settings page; Vaultium usage moved to the owner System page; the notification bell became "Needs attention" tiles.

## Database decisions

- Fresh schema for a new launch; the first migration stops if EMS tables already exist; the app refuses to use a database without the EMS 5 marker.
- Renamed for the domain: `stores`→`shops`, `administrators`→`admins`, `ems_owners`→`platform_owners`, `inventory_items`→`products`, `due_recoveries`→`due_payments`, `staff_salary_invoices`→`salary_payments`, `connectx_*`→`email_messages`/`sms_messages`/`sms_settings`, `truebill_scans`→`verification_scans`.
- Removed: `current_entitlements` (entitlements are computed from licences, so they cannot drift), `_sequences` (one `counters` table), four single-row settings tables (one `settings` table with validated JSON), `api_keys` (public API was retired), `error_logs`, `platform_activity_logs` (one `activity_logs`).
- Invoices reference `customer_id`/`supplier_id` with checks instead of a polymorphic `party_id`; party name/phone are stored on the invoice so history stays readable.
- Money math lives once in `src/lib/invoice-math.ts`; database functions only perform the atomic writes.
- Supabase: explicit `service_role` grants (Supabase stopped auto-granting new tables), RLS on every table, functions callable only by `service_role`.

## Behaviour changes and fixes

- Salary advances could be deducted repeatedly and outstanding salary counted twice; advances are now repaid through `advance_deducted`, limited to the open balance.
- Invoices with recorded due payments can no longer be deleted (payments were orphaned).
- Products used on invoices are deactivated instead of deleted; customers/suppliers with invoices cannot be deleted.
- Read-only status counts only active shops, so deactivating a shop frees its licence place (replaces the 4.x capacity screen).
- Staff page access is enforced on the server per permission section (navigation hiding alone is not access control — this gap was found by the end-to-end tests and fixed).
- Customer contact details are no longer sent to AI providers.
- Password reset requires the emailed code, single use, 5-try limit; sign-in throttling per account and IP (carried over from the security work on 4.x).
- Business numbers are per shop (`INV-000001`, `RET-000001`, `CUS-0001`…).

## Removed files

The whole 4.x application and its documentation: `functions/` (Pages Functions API, Connect App, ConnectX, App Store, D1 driver), `assets/js/app.js`, `assets/js/qrcode.mjs`, `assets/css/{app,owner,admin,shop}.css`, `index.html`, `ZudoAI.html`, `assets/site.webmanifest`, ten iOS splash images (~12 MB), favicon PNG duplicates, the legacy SQL (`supabase/` → removed with the fresh schema), `wrangler.toml` (Pages), and the root guides `ADDONS.md`, `API.md`, `APP_STORE_RELEASE.md`, `CONNECTX_SMS.md`, `CONNECT_APP.md`, `DATABASE_SETUP.md`, `OWNER-CONSOLE.md`, `admin.md`, `shop.md`. Brand icons were kept and moved to `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` and `public/icons/`. Legacy icon and manifest URLs redirect to the new ones.

## Verification (performed on this branch)

| Check | Result |
| --- | --- |
| `npm run lint` (ESLint, `--max-warnings=0`) | clean |
| `npm run typecheck` (TypeScript strict) | clean |
| `npm test` with D1 and PostgreSQL (local PostgreSQL 18 + PostgREST 16.4, Supabase-style roles, no automatic grants, non-superuser owner) | 70 / 70 passed, twice in a row |
| `npm test` with D1 only | 48 passed, 3 PostgreSQL-only skipped |
| `next build` | success (71 routes) |
| `opennextjs-cloudflare build` (Worker bundle) | success |
| Migrations: `npm run db:pg:migrate` on a fresh database (twice — idempotent) and `wrangler d1 migrations apply DB --local` (twice) | applied once, no-op on re-run; refuse to run on a populated database |
| End-to-end over HTTP, Node.js `next start` + Supabase-style PostgreSQL | public pages, setup, sign-in, licence flow, shop, purchase, sale, oversell refusal — passed |
| End-to-end over HTTP in the Cloudflare Worker runtime (`wrangler dev`, workerd) with D1 | 102 / 102 checks: every console page for owner/admin/shop, setup, licensing, invoices, returns with quarantine, dues, staff permissions (including direct-URL denial), expenses, attendance, reports, activity |
| No legacy records imported | the database starts with the schema marker and five add-on rows only (tested) |

## Not verified / remaining work

- Not run against a real Cloudflare account or a real Supabase project (local equivalents only: workerd via Wrangler, PostgreSQL + PostgREST with Supabase's role model).
- Brevo email, AI providers and the real Connect App phone were not called; tests stub the remote endpoints. R2 uploads (Vaultium, APKs) were not exercised end-to-end.
- No browser automation: client-side interactions (invoice/return editors, dialogs) were checked through types, server behaviour and no-JavaScript form submissions, not in a real browser. A visual review of the Bento layouts on phones and desktops is recommended before launch.
- No importer for 4.x data, by design for the fresh launch.
- The App Store and Connect App keep 4.x wire formats for compatibility; any future protocol version should be documented in `docs/INTEGRATIONS.md`.

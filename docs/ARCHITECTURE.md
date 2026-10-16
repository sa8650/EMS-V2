# Architecture

## Layers

```text
Browser ── HTML/RSC ──▶ src/app (Server Components, Server Actions, Route Handlers)
                             │
                             ▼
                      src/server/services   business rules, one module per domain
                             │
                             ▼
                      src/server/db         Database interface → D1 adapter | Supabase adapter
                             │
                             ▼
                      Cloudflare D1 (SQLite)  or  Supabase PostgreSQL (PostgREST)
```

- **Pages** (`src/app/**/page.tsx`) are Server Components. They resolve the request context (`requireOwner` / `requireAdmin` / `requireShop`), call services and render. Only interactive parts are Client Components (forms, dialogs, the invoice and return editors, the console frame).
- **Mutations** are Server Actions (`actions.ts` next to the route, or `_actions/` for a console). Each action re-checks the session and permission (`shopAction(section, verb)`), validates input with zod, calls a service and returns an `ActionState` that the form renders (field errors, success or error message). Next.js' built-in Origin check protects actions against CSRF.
- **Route Handlers** exist only where an external client needs HTTP: the Connect App protocol (`/connect`), the App Store API used by installed Android apps (`/api/app-store/*`), and Vaultium file downloads (`/api/files/[id]`).
- **Services** (`src/server/services/*`, `src/server/connectx`, `src/server/connect-app`) hold the business rules and never depend on a provider. They receive a `Database` and a context object.
- **Shared pure code** (`src/lib`) runs on both server and browser: invoice and return math (the invoice editor previews totals with the exact code the server uses), permissions, dates and formatting.

## Database layer

`src/server/db` exposes one `Database` interface with a small, typed query builder (a subset of the supabase-js API: `from('customers').select().eq().search().order().limit()`, `insert`, `update`, `upsert`, `delete`, `count`) and four atomic operations (`rpc`): `next_counter`, `post_invoice`, `delete_invoice`, `factory_reset`.

- `schema.ts` describes every table and column once. It types query results and column names (a typo in a table or column name fails `tsc`), drives the D1 value codecs (booleans as 0/1, JSON as text) and is checked against both migration sets by tests.
- `d1.ts` compiles queries to parameterised SQL; `rpc-d1.ts` implements the atomic operations as D1 batches (single transactions) with in-batch guards.
- `supabase.ts` talks to PostgREST with the server key; the atomic operations are SQL functions in `db/postgres/migrations/0002_functions.sql`.
- Provider-independent defaults (new UUIDs, `updated_at`) are applied in the query builder so both providers behave the same.
- `getDb()` verifies once per process that the database carries the EMS 5 schema marker before any read or write.

## Request contexts and tenancy

- The session cookie (`ems_session`, httpOnly, SameSite=Lax, Secure in production) holds only `role`, `id` and, for shop work, `shopId`, signed with `SESSION_SECRET`.
- Every request re-reads the account (and shop) status, so deactivation takes effect immediately; staff permissions and licence read-only state are computed per request.
- Shop isolation: every shop query filters by `ctx.shop.id`; the database functions re-check that products, customers and suppliers belong to the shop.
- An administrator working inside their shop is an admin session with `shopId` and full permissions; "Back to administrator" drops the shop.

## Licensing

A licence is active when its period covers now; the latest-expiring active licence is the entitlement (`src/server/licensing.ts`). A shop is read-only without a licence or when it is beyond the licence's shop count (counting only active shops, oldest first). Add-on allowances come from the licence's `modules` or from approved add-on purchases, whichever is larger.

## Module registry

`src/config/modules.ts` lists every module with its kind (core, add-on, integration), the add-on licence it needs, its capabilities and its navigation per console. Console navigation is generated from it and filtered by staff permissions; a test checks that every navigation entry has a page.

## Security notes

- Passwords: PBKDF2-SHA256 (100,000 iterations, WebCrypto). Sign-in is throttled per account (10/15 min) and per IP (50/15 min); messages do not reveal whether an account exists.
- Password reset: a 6-digit code by email is required, each code works once, 5 wrong tries lock it; unknown emails receive the same response.
- Database keys stay on the server (`server-only` imports); Supabase tables have Row Level Security on with no policies, so the browser-facing roles can read nothing.
- Vaultium files are downloaded as attachments; only images, PDF and plain text may be viewed inline, with `nosniff` and a sandboxing CSP.
- Public verification pages show only shop name, document number, date, amount and status.

## Design system

- `src/styles/tokens.css` — colour, type, spacing, radius, elevation and motion tokens; light and dark themes; motion disabled under `prefers-reduced-motion`. The owner can change the brand and accent colours (Website → Branding).
- `src/components/ui` — buttons, form fields bound to Server Action state, dialogs (native `<dialog>`), tables, badges, alerts, empty states, skeletons.
- `src/components/console` — the console shell (registry navigation, role accent: owner violet, admin sky, shop emerald) and the Bento grid used by dashboards; `loading.tsx` skeletons per console.
- `src/components/site` — public website chrome; its CSS module is not used by the consoles.

# EMS — multi-shop management

EMS runs the day-to-day of one shop or many: inventory, sales and purchase invoices, returns and exchanges, dues, expenses, staff (permissions, attendance, salary) and reports — with licence plans for administrators and optional add-ons (ConnectX email/SMS, Zudo AI, AI Business Health, TrueBill verification, Vaultium file storage).

It is a Next.js App Router application in TypeScript (strict), deployable to **Cloudflare Workers** (OpenNext) or any **Node.js** host, with **Supabase (PostgreSQL)** or **Cloudflare D1 (SQLite)** as the database.

## Who uses it

| Role | Console | Signs in with |
| --- | --- | --- |
| Platform owner | `/owner` — administrators, shops, licence plans and reviews, add-ons, website content, help desk, integrations, system | email + password (created once at `/setup`) |
| Administrator (business owner) | `/admin` — licence, shops, add-ons, help desk, devices, profile; can open any of their shops | email + password (self-registration at `/register`) |
| Shop staff | `/shop` — the shop's work, limited by per-section permissions | 4-digit Shop ID + user ID + password |

The public website (`/`, `/pricing`, `/about`, `/contact`, `/blog`, `/apps`, `/terms`, `/privacy`, `/verify/<token>`) is separate from the consoles and uses only server-rendered pages.

## Put it online (no terminal needed)

Follow **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: GitHub Desktop, the Cloudflare dashboard and the Supabase or Cloudflare D1 dashboard, click by click. The database steps are in **[docs/DATABASE.md](docs/DATABASE.md)**.

## Quick start for developers (local)

Requirements: Node.js 22+, npm 11.

```bash
npm ci
cp .env.example .env.local      # set SESSION_SECRET and a database (see below)
npm run dev                      # http://localhost:3000
```

Database for local work — choose one:

- **Supabase**: create a project, run the SQL in `db/postgres/migrations/` (in order) or `DATABASE_URL=… npm run db:pg:migrate`, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- **D1**: remove the `//` in front of the `d1_databases` block in `wrangler.jsonc`, run `npm run db:d1:migrate:local`, and start with `npm run dev` (bindings are provided by OpenNext's dev integration).

Then open `/setup` to create the platform owner.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server, production build, Node.js server |
| `npm run lint` · `typecheck` · `test` · `check` | ESLint (no warnings allowed), `tsc --noEmit`, Vitest, all three |
| `npm run cf:build` · `cf:preview` · `cf:deploy` | Build/preview/deploy the Cloudflare Worker with OpenNext |
| `npm run db:pg:migrate` | Apply `db/postgres/migrations` to `DATABASE_URL` (tracked, transactional) |
| `npm run db:d1:migrate` · `db:d1:migrate:local` | `wrangler d1 migrations apply DB --remote` / `--local` |

## Project structure

```text
src/
  app/            routes: (site) public pages, (auth) sign-in pages, owner/ admin/ shop/ consoles,
                  api/ + connect/ route handlers for external clients, robots/sitemap/manifest
  components/     ui/ (design-system primitives), console/ (shell, Bento grid), site/ (public chrome)
  config/         module registry (modules, add-ons, console navigation)
  lib/            shared pure code: invoice math, permissions, dates, formatting
  server/         server-only code: db/ adapters, auth/, services/, connect-app/, connectx/, env, AI, email
  styles/         design tokens and base styles
db/
  postgres/migrations/   Supabase / PostgreSQL schema, functions, seed
  d1/migrations/         Cloudflare D1 schema and seed (wrangler-native)
tests/            Vitest suites (database conformance on both providers, services, accounts, protocol)
docs/             architecture, database, deployment, integrations, migration report
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, request flow, security model, design system
- [Database](docs/DATABASE.md) — schema, providers, migrations, verification, fresh-launch policy
- [Deployment](docs/DEPLOYMENT.md) — Cloudflare Workers with Supabase or D1, Node.js, troubleshooting
- [Integrations](docs/INTEGRATIONS.md) — Connect App, ConnectX, AI providers, Vaultium, App Store API
- [Migration report](docs/MIGRATION_REPORT.md) — what was rebuilt, removed, verified, and what remains

EMS is developed by Dexter Studio for DoxTox.

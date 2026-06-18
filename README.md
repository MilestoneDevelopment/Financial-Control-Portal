# Financial Control Portal

Internal Finance Platform for a holding company - accounting file uploads, transaction classification,
cash-flow generation, forecast/budget versions, variance analysis, portfolio overview, reports/export,
company management, and role-based permissions.

> **Status: Phase 0 (Foundation).** This repo currently contains the application foundation only. Feature
> modules are delivered in later phases per [`IMPLEMENTATION_ANALYSIS.md`](./IMPLEMENTATION_ANALYSIS.md).

## Stack

- **Next.js** (App Router) + **TypeScript** + React Server Components
- **Supabase**: Postgres, Auth, Storage, Edge Functions
- Row-Level Security with capability-based permissions
- Excel import/export and NBG FX integration (later phases)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
#   then fill in your Supabase project URL + anon key (and service-role key for
#   server-side provisioning). NEVER commit .env.local.

# 3. Apply the database schema
#   Apply supabase/migrations/0001_core_schema.sql to your Supabase project
#   (Supabase SQL editor, the Supabase CLI `supabase db push`, or the MCP
#   apply_migration tool). Then provision your org:
#     select seed_org_defaults('<org-uuid>', '<owner-user-uuid>');

# 4. Run
npm run dev          # http://localhost:3000
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run unit tests (Node test runner) |

## Project layout

```
app/                 routes: (auth) login, (app) shell + module stubs
components/
  providers/         Period, Currency, AppInfo contexts
  shell/             Sidebar, TopBar, AccountMenu, ShellFrame, ModulePlaceholder
lib/
  domain/period/     period model (spec / label / factor, FY vs YTD)
  format/            accounting-parentheses money + percent formatters
  permissions/       capability keys, role levels, resolution
  supabase/          server / client / admin / middleware clients + env guard
  nav.ts             sidebar navigation config
db/types.ts          Supabase types (regenerated from schema)
supabase/migrations/ SQL migrations (schema + RLS + helpers)
styles/tokens.css    design tokens (brand colors, type, radii)
docs/                phase notes
_handoff/            frozen Claude Design reference bundle (not app source)
```

## Core product rules (enforced across the codebase)

- `Closing Cash Balance = Opening Cash Balance + Net Cash Flow`; balances never sum as flows.
- Negative numbers use **accounting parentheses** `(1,250)` - never a minus sign.
- **GEL** default; **USD/EUR** are read-time conversions via stored/NBG FX (transaction-date policy).
- Per-company configurable base currency (default GEL); no company hardcoded to USD.
- Periods: Draft -> Active -> Locked -> Closed -> Archived (separate from forecast versions).
- Raw export is permission-gated; all exports are audit-logged.

See [`IMPLEMENTATION_ANALYSIS.md`](./IMPLEMENTATION_ANALYSIS.md) for the full architecture and roadmap.

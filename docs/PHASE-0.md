# Phase 0 - Foundation (complete)

Foundation only. No Excel import, classification engine, or full data binding - those are later phases.

## Implemented

- **Next.js 15 + TypeScript** app (App Router, React Server Components), strict TS, path alias `@/*`.
- **App shell**: dark sidebar (brand mark, company-switcher placeholder, grouped nav), top bar (page title +
  live `· period · currency` suffix, read-only period chip, GEL/USD toggle, account menu). Account menu is
  distinct from the Admin Console.
- **Global providers**: `PeriodProvider` (shared period state, resolves label/factor + FY-vs-YTD),
  `CurrencyProvider` (GEL default), `AppInfoProvider`.
- **Period model** (`lib/domain/period`): faithful port of the prototype's `periodModel` math
  (month/quarter/year/custom/multiyear, factor, FY vs YTD), unit-tested.
- **Accounting number formatter** (`lib/format`): parentheses for negatives `(1,250)`, percent sign rules,
  unit-tested.
- **Permissions model** (`lib/permissions`): capability keys + grouped matrix (incl.
  `period.set_opening_balance`), role levels, resolution with override support.
- **Supabase integration**: server / browser / admin (service-role) clients, session-refresh middleware with
  auth redirect, env guard with clear errors. Login page wired to Supabase Auth.
- **Core DB migration** (`supabase/migrations/0001_core_schema.sql`): full schema + RLS + helpers (below).
- **Navigable module stubs** for every screen (each labeled with its delivery phase).
- **Docs**: `README.md`, `supabase/README.md`, this file; `.env.local.example` (no secrets committed).

## Database migration (0001_core_schema.sql)

Tables: `organizations`, `profiles`, `roles`, `capabilities`, `role_permissions`, `companies`
(configurable `base_currency`, default GEL), `memberships` (per-company role; org-level when company is null),
`invitations`, `security_settings`, `cf_structure_versions` (versioning scaffold), `periods` (lifecycle +
opening-balance fields + `structure_version_id`), `fx_rates` (GEL/USD/EUR), `audit_log` (append-only).

RLS: enabled on all tables. Helpers `auth_org_ids()`, `auth_company_ids()`, `auth_role_for_company()`,
`auth_role_for_org()`, `auth_can()`, `auth_can_org()` (SECURITY DEFINER). Policies scope reads to
membership and gate writes by capability. Audit log is insert-only.

Provisioning: `handle_new_user()` trigger auto-creates a profile; `seed_org_defaults(org, owner)` seeds
system roles, default permissions, security settings, and the Owner membership. Capabilities table seeded.

## Validation

- `npm test` -> 11/11 pass (formatter + period model).
- `npm run typecheck` (`tsc --noEmit`) -> clean.
- `npm run build` -> success; 14 routes; middleware compiled.

## Known limitations (by design for Phase 0)

- Active company is a placeholder (`demo`); real company resolution from membership/URL is Phase 1.
- Period Selector and Export menu render as static chips; interactive controls come with their modules.
- ESLint is not yet wired into the build (`eslint.ignoreDuringBuilds`); added in a hardening pass.
- ~~`db/types.ts` is a placeholder~~ — now generated from the live schema (migration 0001 applied to the `financial-control-portal` Supabase project; verified: 13 tables, 8 enums, RLS on all 13, 8 helper functions, 25 policies, 13 indexes, `on_auth_user_created` trigger, `seed_org_defaults`, capabilities seeded, **zero** demo data).
- **Security follow-up (pending approval) — migration 0002:** the Supabase advisor flags that `SECURITY DEFINER` helpers are exposed via PostgREST RPC. Most are benign (the `auth_*` helpers act only on `auth.uid()` inside RLS), but `seed_org_defaults` is `EXECUTE`-able by `anon`/`authenticated` and must be locked down (revoke EXECUTE; relocate the RLS helpers to a non-exposed schema) before real users/Phase 1. `rls_auto_enable()` in the advisor list is a pre-existing project event-trigger guardrail, not from this migration.

## Next: Phase 1 (recommended)

Companies CRUD + Admin-only base-currency setting; `cf_nodes` tree + Structure Builder (drag-drop, inspector,
validation, copy-from-company, change history, versioning); period lifecycle UI + `requirePeriodMutable`
guard + Correction-Mode scaffolding; real active-company resolution; generate `db/types.ts` from the schema.

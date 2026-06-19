# Phase 1 - Companies & Structure (foundation)

Branch: `phase-1-companies-structure`. Foundation only — no Excel import, classification, forecast grid,
reports, or cash-flow engine.

## Implemented

- **Migration 0003** (`cf_nodes`): Section → Group → Class tree scoped to a structure version
  (`cf_node_kind`, `cash_direction` enums; RLS via `auth_can('structure.edit', …)`; indexes). Applied + verified.
- **Real active-company resolution**: the `demo` placeholder is gone. `(app)/layout` loads the user's
  accessible companies (RLS-scoped); the sidebar **company switcher** is wired to real data and the active
  company is derived from the URL (`/c/[id]/…`). `c/[companyId]/layout` validates access (404 otherwise).
- **Companies CRUD foundation** (`/admin/companies`): list, create, and edit **base currency** (GEL/USD/EUR,
  default GEL), status, and portfolio inclusion — org-capability gated (`companies.add`/`companies.manage`),
  audited.
- **Versioned Structure Builder** (`/c/[id]/structure`): initialize v1 active version; add/edit/deactivate
  sections, groups and classes; per-class cash direction; live validation scaffolding (empty containers,
  neutral classes, duplicate names); summary counts; audit logging. No drag-and-drop (deferred polish).
- **Period lifecycle foundation** (on the company Dashboard): open periods; transition
  Draft → Active → Locked → Closed → Archived (gated `period.approve_lock`); **Correction Mode** with required
  reason + audit (`period.correction_mode`); manual **opening balance** entry (`period.set_opening_balance`,
  audited); opening balance carries from the prior period's closing on creation; new periods pin the active
  `structure_version_id`.
- **`requirePeriodMutable` guard** + pure lifecycle helpers (`lib/domain/period/lifecycle.ts`, tested).
- **Capability guards** (`lib/auth/guards.ts`): `requireCapability` / `requireCapabilityOrg` / `capabilityMap`
  delegate to the DB `auth_can` / `auth_can_org` (single source of truth, honors role_permissions overrides).
- **Audit helper** (`lib/audit.ts`): append-only logging on every privileged mutation.
- **Service-role provisioning** (`scripts/provision-org.ts`): calls the `provision_org` SECURITY DEFINER
  function (migration 0004), which creates an org and seeds defaults via `seed_org_defaults` for an existing
  owner. `service_role` has no direct table DML; provisioning goes through SECURITY DEFINER functions only.
  Uses the service-role key, never imported by app/client code. Not run automatically.

## Migrations

- `0003_cf_nodes.sql` — applied to `financial-control-portal` (`vcaobnrunyfazrxusluh`). Verified: table +
  RLS + 2 policies + 4 indexes + 2 enums; 0 rows (no demo data). `db/types.ts` regenerated.

## Validation

- `npm test` → 18/18 pass · `npm run typecheck` → clean · `npm run build` → success (15 routes).
- Supabase security advisor: 14 warnings (unchanged) — the six `auth_*` RLS helpers + the pre-existing
  `rls_auto_enable`; the 0002 hardening on `seed_org_defaults`/`handle_new_user` remains intact.
- Note: `@supabase/supabase-js` and `@supabase/ssr` upgraded to current 2.x to match the new typegen format.

## Known limitations (foundation)

- Structure editing applies directly to the single active version; full **copy-on-edit draft branching** (so a
  structure change never mutates a version a closed period pinned) is deferred. Periods do pin the active
  version at creation, which is the durable hook for it.
- Period management UI lives on the Dashboard (no charts/KPIs yet — Phase 6). No dedicated Periods nav item.
- No realtime collaboration; last-write-wins with audit history.
- Provisioning is a CLI script (no admin UI for creating orgs / inviting users — Phase 8).

## Recommended Phase 2

Accounting Excel upload + transactions + classification engine (rule-based, Georgian-aware) — uploads write
into a draft/active period (gated by `requirePeriodMutable`), classification produces the data the cash-flow
engine consumes in Phase 3.

# Phase 4C - Period setup and opening balances

Branch: `phase-4c-period-setup-opening-balance` (off `main`). Scope: let a company
create accounting periods and set/carry opening balances from the Cash Flow page,
with least-privilege, audited, RLS-safe writes. One focused migration. No export /
forecast / budget / variance / AI. Phase 4B read logic is unchanged.

## Migration

`supabase/migrations/0011_period_opening_balance.sql` adds the SECURITY DEFINER
function `set_period_opening_balance(p_period_id, p_amount, p_source)`:

- `security definer set search_path = public`; `revoke execute from public, anon`;
  `grant execute to authenticated` (same hardened idiom as `cache_fx_rate` /
  `provision_org`).
- Internally enforces `auth_can('period.set_opening_balance', company_id)` for the
  period's company, and writes ONLY the opening-balance columns
  (`opening_balance`, `opening_balance_source`, `opening_balance_set_by`,
  `opening_balance_set_at`).

### Why this fixes the RLS gap (least privilege)

`periods_write` (0001) is `for all` gated by `period.approve_lock`, so opening
balances previously needed the full period-management capability. RLS is
row-level, not column-level: a second permissive UPDATE policy gated on
`period.set_opening_balance` would also let those holders change status / lock
flags / any column. The definer function scopes the write by BOTH the capability
AND the exact columns - genuinely least privilege. `periods_write` is left
unchanged (lifecycle + period creation stay under `period.approve_lock`).

## Server actions (`app/(app)/c/[companyId]/cash-flow/actions.ts`)

All capability-gated at the app layer, company-scoped, and audited:

- `createPeriodAction` - `period.approve_lock`; inserts a `draft` period (RLS
  `periods_write` also enforces it); handles the unique (company, year, month)
  conflict; audit `period.created`.
- `setOpeningBalanceAction` - `period.set_opening_balance`; calls the RPC with
  source `manual`; audit `period.opening_balance.set`.
- `acceptCarriedOpeningAction` - `period.set_opening_balance`; recomputes the
  previous period's closing server-side (previous opening + previous net via the
  pure generator) - the client value is never trusted - then calls the RPC with
  source `carried`; audit `period.opening_balance.carried`.

## Domain (pure, tested)

`lib/domain/cashflow/periods.ts` adds `validatePeriodInput` (year 2000-2100, month
1-12 or null) and `validateOpeningBalanceAmount` (finite, rounded to 2 dp). Opening
resolution / carried chain / closing reuse the existing Phase 4B helpers.

## UI (Cash Flow page)

- A compact "Period setup" card (year + month + Create) shown to
  `period.approve_lock` holders, so a company with zero periods can create its
  first one.
- Opening-balance controls inside the Cash Balance card when a period is selected
  and the user holds `period.set_opening_balance`: "Accept carried opening (value)"
  when a carried candidate exists, plus a manual set/update input.
- Period selector, status badge, opening source tag, carried candidate, YTD line,
  and the whole read path are unchanged from Phase 4B. Counts use `[ N ]`,
  negatives use accounting parentheses, no em/en dash.

## Audit actions added

`period.created`, `period.opening_balance.set`, `period.opening_balance.carried`
(actor defaults to `auth.uid()`; org/company scoped via `logAudit`).

## Security / advisor

RLS preserved; no anon DML; no service_role DML from app code; no secrets. The only
security-advisor delta vs the Phase 4B baseline is one expected new WARN -
`set_period_opening_balance` flagged as an authenticated-executable SECURITY
DEFINER function (the intended, hardened pattern; anon cannot execute it). No new
ERROR/CRITICAL. `periods_write` / `periods_select` unchanged.

## Deferred

Period lifecycle transitions (approve/lock/close) UI, imported opening balances,
and still out of scope: export, forecast, budget, variance, AI.

# Phase 4B - Period-aware cash flow and opening balance chain

Branch: `phase-4b-period-aware-cashflow` (off `phase-4a-...`). Scope: make the
cash-flow statement period-aware and add a controlled opening -> closing balance
chain, read-only. **No schema migration** (the existing `periods` columns already
cover it). No report export / forecast / budget / variance / AI.

## Schema check (no migration)

The `periods` table already exposes everything Phase 4B reads: `year` / `month`
(period bounds derived via `periodDateRange`), `opening_balance`,
`opening_balance_source` (`carried` / `imported` / `manual`), `closing_balance`,
`status` (`draft` / `active` / `locked` / `closed` / `archived`), and
`locked_at` / `closed_at`. No migration was created.

## Implemented

- **Period selector**: when periods exist, the filter offers a period dropdown;
  selecting one drives the generation date range and the opening balance, disabling
  the manual date inputs. With no periods it stays in Phase 4A date-range mode, and
  with no range it shows all transactions (Phase 4A behavior preserved).
- **Period state**: the selected period's status is shown as a badge
  (Draft / Active / Locked / Closed), with locked/closed visually distinguished.
- **Opening / Closing balance**: a stored opening balance is used verbatim and
  tagged by source (manual / carried / imported). With none set, the warning
  "Opening balance is not set for this period." is shown. Closing Cash Balance =
  Opening Cash Balance + Net Cash Flow, computed only once an opening exists -
  never invented.
- **Carried-forward candidate**: when the current period has no opening but the
  previous period has a known closing (its opening + its net, computed live), that
  closing is surfaced read-only as a "carried opening available" candidate.
  Applying it is a controlled action, deferred to Phase 4C (see below).
- **FY/YTD**: in period mode the Totals card shows a compact YTD net line
  (fiscal-year-start through the selected period), without overbuilding a report.

## Domain (pure, tested)

`lib/domain/cashflow/periods.ts`: `periodDateRange`, `ytdDateRange`,
`comparePeriods`, `adjacentPeriods` (generic - keeps the caller's period shape),
`isLockedOrClosed`, `resolveOpeningBalance` (manual overrides carried candidate;
carried candidate only when a previous closing is known; otherwise missing -
never invented), `OPENING_STATE_LABEL`. Closing reuses `computeClosingBalance`
from `generate.ts`.

## Data layer

`lib/data/cashflow.ts`: `listCashFlowPeriods` extended to return `status`,
`opening_balance_source`, and `closing_balance`, with the concrete date range
derived by the pure `periodDateRange`. The previous period's transactions are
fetched (read-only) only to compute the live carried candidate.

## Write actions - deferred to Phase 4C

The opening-balance save / accept-carried actions were intentionally **not** added
in 4B, for two reasons: (1) no periods exist for the verified company, so a write
path is unexercisable without creating data; and (2) the `periods_write` RLS policy
gates all period writes behind the `period.approve_lock` capability, while the
dedicated `period.set_opening_balance` capability is not enforced by any periods
policy - honoring least-privilege opening-balance writes cleanly would require a
new/adjusted RLS policy (a migration). Phase 4C should add that policy plus the
audited, company-scoped server actions (`period.opening_balance.set`,
`period.opening_balance.carried`).

## Security / data

No migration. RLS unchanged; no anon DML; no service_role DML; no secrets. The page
is read-only - it never writes transactions, structure, periods, or balances.

## Tests

`lib/domain/cashflow/periods.test.ts`: period range bounds (incl. leap year),
selected period drives the range, YTD range, opening+net=closing, missing opening
does not invent closing, previous closing becomes carried candidate, manual opening
overrides candidate, stored carried/imported source labels, adjacent period
resolution + edges, compare/locked helpers, and the carried chain end to end.
Existing generate/coverage/format suites still cover sign/parentheses, the coverage
partition identity (no silent drop, range-agnostic), and date-range generation.

## Deferred (Phase 4C+)

Controlled opening-balance write actions (with the RLS policy), and still out of
scope: report export, forecast, budget, variance, AI.

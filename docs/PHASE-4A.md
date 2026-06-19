# Phase 4A - Cash flow generation foundation

Branch: `phase-4a-cashflow-generation-foundation` (off `phase-3b-...`). Scope: the
first read-only cash-flow statement generated from classified transactions and the
active versioned structure. **No schema migration** (the existing `cf_nodes`,
`transactions`, and `periods` columns already cover it); all changes are app/logic
level. No reports/export/forecast/budget/AI.

## Implemented

- **Cash Flow page** (`/c/[companyId]/cash-flow`): replaces the placeholder with a
  generated, read-only statement. Header "Cash Flow Statement"; range/period
  filter; coverage cards; Section / Group / Class statement table; per-section and
  Net totals; Opening / Closing balance handling; exclusions strip linking back to
  Classification.
- **Range / period filter** (`CashFlowFilters`, client): pick an existing accounting
  period (which carries its stored opening balance) or a free from/to date range
  generated straight from transactions. Selecting a period disables the manual
  dates so the active scope is never ambiguous.
- **Coverage cards**: Total, Included, Unclassified, FX pending, Excluded for the
  selected range. Every transaction in range lands in exactly one bucket
  (`included + unclassified + fxPending + excluded === total`) so nothing is
  silently dropped.
- **Statement table**: section / group / class rows in structure order with
  indentation by hierarchy, a per-line item count `[ N ]`, an in/out direction tag
  on class rows, and a GEL amount column. Negatives use accounting parentheses,
  e.g. `(800.00)`.
- **Totals**: one line per section (Operating / Investing / Financing - whichever
  sections exist) plus Net Cash Flow.
- **Opening / Closing balance**: opening is read verbatim from the selected period
  and never invented; with no opening balance the panel shows
  "Opening balance is not set for this period." Closing Cash Balance =
  Opening Cash Balance + Net Cash Flow, shown only once an opening balance exists.

## Generation behavior

Pure logic in `lib/domain/cashflow/*` (no DB imports, fully unit-tested):

- `generate.ts` - `rollupCashFlow` (transaction -> class signed totals),
  `buildCashFlowTree` (class -> group -> section -> net, preserving `sort_order`
  and skipping inactive nodes), `isEligible`, `signedAmount`, `directionSign`,
  `computeNetCashFlow`, `computeClosingBalance`.
- `coverage.ts` - `summarizeCashFlowCoverage` (the partitioned coverage buckets).
- `format.ts` - `formatCashFlowRows` (flatten to ordered display rows with depth,
  emphasis, direction, and accounting-formatted amounts).

A transaction is **included** in the statement only when it is `confirmed`
(`manual` or `rule`), has a non-null `class_id` and `amount_gel`, an `fx_status` of
`resolved` or `not_required`, and a class node carrying a real cash direction
(`in`/`out`). Sign: an inflow class adds the GEL magnitude, an outflow class
subtracts it; the transaction's own amount sign is preserved through the multiply
(so a refund correctly reduces its line).

Anything not included is surfaced in coverage, never dropped:
`unclassified` (no class), `fxPending` (FX not resolved/not_required, incl. manual
rate), or `excluded` (suggested/rejected, missing amount, or a class with no
direction).

## Data layer

`lib/data/cashflow.ts` (read-only, RLS-scoped): `listCashFlowNodes` (active
structure version's nodes), `listCashFlowTransactions` (every status in the range,
so coverage can account for the remainder), `listCashFlowPeriods` (periods as
concrete date ranges + stored opening balance). A date filter excludes rows with no
`transaction_date`; the unbounded view keeps them.

## Security / data

No migration. RLS unchanged; no service_role or anon DML; no secrets. The page is
read-only - it never writes transactions, structure, or balances. Access to the
Classification cleanup link is gated on `classification.review`.

## Tests

`lib/domain/cashflow/{generate,coverage,format}.test.ts`: class aggregation,
group/section rollup, sort_order ordering, sign preservation + parentheses
formatting, unclassified/FX-pending exclusion-but-counted, the coverage partition
identity (no silent drop), opening+net=closing identity, and empty
structure / missing-class behavior.

## Deferred (Phase 4B+)

Saved/generated reports, export (Excel/PDF), forecast, budget, variance, and any AI
remain out of scope.

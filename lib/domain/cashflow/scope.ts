/**
 * Pure Statement reporting-scope helpers (Phase 5D2).
 *
 * The Statement view supports five scopes: a single month (an accounting
 * period), a quarter, a half-year, a full year, or a custom date range. These
 * helpers resolve the scope kind from query params and compute the concrete
 * date range for the calendar scopes. Opening / FX / closing aggregation across
 * the months in a range is done by the caller from the period rows (it needs DB
 * data); this module stays free of DB types.
 *
 * Zero-row pruning hides all-zero class lines (and any container whose entire
 * subtree is zero) so a single-period statement is not cluttered, while always
 * preserving containers that have at least one non-zero descendant.
 */
import type { CashFlowStatement, CashFlowTreeNode } from "./types.ts";

export type StatementScopeKind = "month" | "quarter" | "half" | "fy" | "custom";

export interface ScopeRange {
  dateFrom: string; // inclusive YYYY-MM-DD
  dateTo: string; // inclusive YYYY-MM-DD
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

function monthRange(year: number, startMonth: number, endMonth: number): ScopeRange {
  return {
    dateFrom: `${year}-${pad(startMonth)}-01`,
    dateTo: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`,
  };
}

/** Quarter (1-4) -> inclusive calendar range. */
export function quarterRange(year: number, q: number): ScopeRange {
  const startMonth = (q - 1) * 3 + 1;
  return monthRange(year, startMonth, startMonth + 2);
}

/** Half-year (1 = Jan-Jun, 2 = Jul-Dec) -> inclusive calendar range. */
export function halfRange(year: number, half: number): ScopeRange {
  return half === 1 ? monthRange(year, 1, 6) : monthRange(year, 7, 12);
}

/** Full calendar year -> inclusive range. */
export function fyRange(year: number): ScopeRange {
  return monthRange(year, 1, 12);
}

export const QUARTER_LABEL = (year: number, q: number) => `Quarter: Q${q} ${year}`;
export const HALF_LABEL = (year: number, half: number) => `Half-year: H${half} ${year}`;
export const MONTH_SHORT = (month: number) => MONTHS[month - 1];

/**
 * Resolve the scope kind from query params, with backward compatibility:
 * an explicit `scope` wins; otherwise a `periodId` implies month, a `from`/`to`
 * implies custom, and the default is month (the caller picks the latest period).
 */
export function resolveStatementScopeKind(p: {
  scope?: string;
  periodId?: string;
  from?: string;
  to?: string;
}): StatementScopeKind {
  if (p.scope === "month" || p.scope === "quarter" || p.scope === "half" || p.scope === "fy" || p.scope === "custom") {
    return p.scope;
  }
  if (p.periodId) return "month";
  if (p.from || p.to) return "custom";
  return "month";
}

/** Whether zero-value detail rows should be hidden for a scope (FY always shows all). */
export function shouldHideZeroRows(kind: StatementScopeKind, showZero: boolean): boolean {
  if (kind === "fy") return false;
  return !showZero;
}

/**
 * Return a copy of the statement with all-zero class rows removed and any
 * container whose entire subtree is zero removed. Containers with at least one
 * non-zero descendant are preserved (even if their own signed sum is zero, e.g.
 * offsetting inflow/outflow), and their amounts/counts are untouched.
 */
export function pruneZeroRows(statement: CashFlowStatement): CashFlowStatement {
  function prune(node: CashFlowTreeNode): CashFlowTreeNode | null {
    if (node.kind === "class") {
      return node.amount !== 0 ? node : null;
    }
    const children = node.children
      .map(prune)
      .filter((c): c is CashFlowTreeNode => c !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  }
  const roots = statement.roots
    .map(prune)
    .filter((c): c is CashFlowTreeNode => c !== null);
  return { ...statement, roots };
}

export interface PeriodBridgeRow {
  year: number;
  month: number;
  openingBalance: number | null;
  fxFluctuations: number | null;
}

export interface BridgeAggregate {
  /** First (chronological) month's opening balance. */
  opening: number | null;
  /** Sum of FX fluctuations across the included months. */
  fx: number;
  /** First / last included month labels (for partial-range copy). */
  firstMonth: number | null;
  lastMonth: number | null;
}

/**
 * Aggregate the cash-bridge inputs across the monthly periods inside a scope:
 * opening = the first month's opening, fx = sum of monthly FX. Closing is left
 * to the caller (opening + net + fx) so it stays consistent with the carried
 * chain. Input may be unsorted; it is sorted chronologically here.
 */
export function aggregatePeriodBridge(periods: PeriodBridgeRow[]): BridgeAggregate {
  const sorted = [...periods].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );
  if (sorted.length === 0) {
    return { opening: null, fx: 0, firstMonth: null, lastMonth: null };
  }
  const fx = sorted.reduce((s, p) => s + (p.fxFluctuations ?? 0), 0);
  return {
    opening: sorted[0].openingBalance,
    fx,
    firstMonth: sorted[0].month,
    lastMonth: sorted[sorted.length - 1].month,
  };
}

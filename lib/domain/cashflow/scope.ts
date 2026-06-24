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

export const HALF_LABEL = (year: number, half: number) => `Half-year: H${half} ${year}`;
export const MONTH_SHORT = (month: number) => MONTHS[month - 1];

/** Calendar quarter (1-4) a 1-12 month falls in. */
export function quarterOfMonth(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Parse a quarter param ("Q1,Q3", "1,3", "Q2") into a sorted unique list of
 * quarter numbers (1-4). Invalid / empty input yields an empty list.
 */
export function parseQuarters(raw: string | undefined): number[] {
  if (!raw) return [];
  const set = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.replace(/[^0-9]/g, ""));
    if (Number.isInteger(n) && n >= 1 && n <= 4) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Bounding inclusive range that covers the selected quarters (min quarter start
 * to max quarter end). Non-contiguous selections still return the bounding
 * range; the caller filters transactions to the selected quarters. Null when no
 * quarters are selected.
 */
export function quartersDateRange(year: number, quarters: number[]): ScopeRange | null {
  if (quarters.length === 0) return null;
  const min = Math.min(...quarters);
  const max = Math.max(...quarters);
  return { dateFrom: quarterRange(year, min).dateFrom, dateTo: quarterRange(year, max).dateTo };
}

/**
 * Scope label for one or more quarters:
 *   single        -> "Quarter: Q2 2026"
 *   contiguous    -> "Quarters: Q1-Q2 2025"
 *   non-contiguous-> "Quarters: Q1, Q3 2025"
 */
export function formatQuartersLabel(year: number, quarters: number[]): string {
  const qs = [...quarters].sort((a, b) => a - b);
  if (qs.length === 0) return `Quarter: ${year}`;
  if (qs.length === 1) return `Quarter: Q${qs[0]} ${year}`;
  const contiguous = qs[qs.length - 1] - qs[0] === qs.length - 1;
  if (contiguous) return `Quarters: Q${qs[0]}-Q${qs[qs.length - 1]} ${year}`;
  return `Quarters: ${qs.map((q) => `Q${q}`).join(", ")} ${year}`;
}

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

/** Default zero-row visibility per scope: FY shows the full structure; others hide zeros. */
export function defaultShowZero(kind: StatementScopeKind): boolean {
  return kind === "fy";
}

/**
 * Resolve whether zero rows are shown, from the raw `showZero` param and the
 * scope default. "1" forces on, "0" forces off, anything else uses the default.
 * Every scope (FY included) can be toggled.
 */
export function resolveShowZero(kind: StatementScopeKind, raw: string | undefined): boolean {
  if (raw === "1") return true;
  if (raw === "0") return false;
  return defaultShowZero(kind);
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

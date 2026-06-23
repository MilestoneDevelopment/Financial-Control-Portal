/**
 * Pure cash-flow matrix builder (Phase 5C).
 *
 * Statement view shows a single column (one period or one date range). Matrix
 * view shows the same recursive structure with year-grouped columns: years
 * collapsed by default, expandable to reveal that year's months side by side.
 * A final Total column carries the grand-total rule per row.
 *
 * Per-row aggregation rules (applied per year + grand total):
 *   - line items (section/group/class): arithmetic sum across the months in scope.
 *   - bridge-opening: per-month verbatim opening; year-total = the year's first
 *     month opening (Jan if present, else the earliest month in scope); grand
 *     total = '-' (summing openings would mislead).
 *   - bridge-net: arithmetic sum.
 *   - bridge-fx: arithmetic sum.
 *   - bridge-closing: per-month closing; year-total = the year's last month
 *     closing (carry, not sum); grand total = the last visible period's closing.
 *
 * Row identity uses the active node id (or a synthetic bridge key) so the row
 * order is stable - the matrix can be re-rendered with a different expansion
 * state without recomputing the underlying tree.
 */
import {
  buildCashFlowTree,
  computeClosingBalance,
} from "./generate.ts";
import { isTotalLabel } from "./format.ts";
import { formatAmount } from "../../format/money.ts";
import type {
  CashDirection,
  CashFlowNode,
  CashFlowTreeNode,
  CashFlowTxn,
} from "./types.ts";

export interface MatrixPeriodInput {
  id: string;
  year: number;
  month: number | null;
  label: string;
  openingBalance: number | null;
  fxFluctuations: number | null;
  storedClosingBalance: number | null;
}

export interface MatrixMonth {
  id: string;
  /** Short label inside a year group, e.g. "Jan". */
  label: string;
  /** Full label for tooltips / single-period contexts, e.g. "Jan 2023". */
  fullLabel: string;
  year: number;
  month: number;
}

export interface MatrixYearGroup {
  year: number;
  /** Display label for the year column header, e.g. "2023". */
  label: string;
  months: MatrixMonth[];
}

export type MatrixCellKind =
  | "section"
  | "group"
  | "class"
  | "bridge-opening"
  | "bridge-net"
  | "bridge-fx"
  | "bridge-closing";

/** One column value for a matrix row. Pre-formatted to keep render trivial. */
export interface MatrixCell {
  value: number | null;
  text: string;
  negative: boolean;
}

export interface MatrixRowYearCells {
  /** Parallel to MatrixYearGroup.months. */
  months: MatrixCell[];
  /** The year subtotal cell shown when a year is collapsed (and as a footer when expanded). */
  total: MatrixCell;
}

export interface MatrixRow {
  /** React key + identity. `node:<id>` for tree rows, `bridge:<kind>` otherwise. */
  key: string;
  kind: MatrixCellKind;
  depth: number;
  label: string;
  /** Section rows and "Total ..." subtotal rows render with emphasis. */
  emphasis: boolean;
  /** True for the "Total ..." subtotal footer row. */
  isTotal: boolean;
  /** Class-row cash direction; null otherwise. */
  direction: CashDirection | null;
  /** True for a class node with no direction (data-quality flag). */
  noDirection: boolean;
  /** Parallel to MatrixModel.years. */
  byYear: MatrixRowYearCells[];
  /** Right-most Total column across all years. */
  total: MatrixCell;
}

export interface MatrixModel {
  years: MatrixYearGroup[];
  rows: MatrixRow[];
}

const SHORT_MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function cell(value: number | null): MatrixCell {
  if (value === null) return { value: null, text: "-", negative: false };
  return {
    value,
    text: formatAmount(value, { decimals: 2 }),
    negative: value < 0,
  };
}

function sumNumbers(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * Build the year-grouped matrix model. Periods must be monthly (month != null).
 * Within each year, months are ordered chronologically. The visible Total column
 * spans all months in scope.
 */
export function buildCashFlowMatrix(
  nodes: CashFlowNode[],
  periods: MatrixPeriodInput[],
  txnsByPeriod: ReadonlyMap<string, CashFlowTxn[]>,
): MatrixModel {
  // Discard year-level periods (month=null) - the matrix is monthly by design.
  const monthly = periods
    .filter((p) => p.month !== null)
    .slice()
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : (a.month as number) - (b.month as number)));

  // Per-period rolled-up tree + per-period closing.
  type PerPeriod = {
    period: MatrixPeriodInput;
    statement: ReturnType<typeof buildCashFlowTree>;
    closing: number | null;
  };
  const perPeriod: PerPeriod[] = monthly.map((p) => {
    const txns = txnsByPeriod.get(p.id) ?? [];
    const statement = buildCashFlowTree(nodes, txns);
    const computed = computeClosingBalance(p.openingBalance, statement.net, p.fxFluctuations ?? 0);
    const closing = p.storedClosingBalance ?? computed;
    return { period: p, statement, closing };
  });

  // Bucket months by year, preserving chronological order.
  const yearBuckets = new Map<number, PerPeriod[]>();
  for (const pp of perPeriod) {
    const arr = yearBuckets.get(pp.period.year) ?? [];
    arr.push(pp);
    yearBuckets.set(pp.period.year, arr);
  }
  const yearKeys = [...yearBuckets.keys()].sort((a, b) => a - b);

  const years: MatrixYearGroup[] = yearKeys.map((y) => ({
    year: y,
    label: String(y),
    months: (yearBuckets.get(y) ?? []).map((pp) => ({
      id: pp.period.id,
      label: SHORT_MONTH[(pp.period.month as number) - 1],
      fullLabel: pp.period.label,
      year: pp.period.year,
      month: pp.period.month as number,
    })),
  }));

  // Total per-period count, used to short-circuit empty matrices.
  if (perPeriod.length === 0) return { years, rows: [] };

  // Walk the first period's tree to obtain the canonical row skeleton; the
  // shape is identical across periods (same active nodes).
  const firstRoots = perPeriod[0].statement.roots;
  const allRoots: CashFlowTreeNode[][] = perPeriod.map((pp) => pp.statement.roots);

  const rows: MatrixRow[] = [];

  function lineRow(
    node: CashFlowTreeNode,
    counterparts: CashFlowTreeNode[],
    depth: number,
    kind: "section" | "group" | "class",
    emphasis: boolean,
    isTotal: boolean,
  ): MatrixRow {
    // counterparts[i] is the same node id across periods (same index walk).
    const valuesByPeriod = counterparts.map((n) => n.amount);
    const byYear: MatrixRowYearCells[] = [];
    let idx = 0;
    for (const y of years) {
      const monthValues: number[] = [];
      for (let m = 0; m < y.months.length; m++) {
        monthValues.push(valuesByPeriod[idx]);
        idx++;
      }
      byYear.push({
        months: monthValues.map((v) => cell(v)),
        total: cell(sumNumbers(monthValues)),
      });
    }
    const total = cell(sumNumbers(valuesByPeriod));
    return {
      key: `node:${node.id}`,
      kind,
      depth,
      label: node.label,
      emphasis,
      isTotal,
      direction: kind === "class" ? node.cashDirection : null,
      noDirection: kind === "class" && node.cashDirection === "neutral",
      byYear,
      total,
    };
  }

  function walk(
    treeNodes: ReadonlyArray<CashFlowTreeNode>,
    perPeriodNodes: CashFlowTreeNode[][],
    depth: number,
  ): void {
    for (let i = 0; i < treeNodes.length; i++) {
      const node = treeNodes[i];
      const counterparts = perPeriodNodes.map((arr) => arr[i]);

      if (node.kind === "class") {
        rows.push(lineRow(node, counterparts, depth, "class", false, false));
        continue;
      }

      const totalFooter = node.kind === "group" && isTotalLabel(node.label);
      if (totalFooter) {
        // Footer subtotal: children first (at same depth), then total row.
        walk(node.children, counterparts.map((n) => n.children), depth);
        rows.push(lineRow(node, counterparts, depth, "group", true, true));
        continue;
      }

      // Section / header group: header first, then children indented one deeper.
      rows.push(
        lineRow(node, counterparts, depth, node.kind === "section" ? "section" : "group", node.kind === "section", false),
      );
      walk(node.children, counterparts.map((n) => n.children), depth + 1);
    }
  }

  walk(firstRoots, allRoots, 0);

  // Bridge rows.
  function bridgeRow(
    key: MatrixCellKind,
    label: string,
    emphasis: boolean,
    pickPerMonth: (pp: PerPeriod) => number | null,
    yearTotal: (year: PerPeriod[], monthValues: (number | null)[]) => number | null,
    grandTotal: (allMonthValues: (number | null)[]) => number | null,
  ): MatrixRow {
    const monthValues: (number | null)[] = perPeriod.map(pickPerMonth);
    const byYear: MatrixRowYearCells[] = [];
    let idx = 0;
    for (const y of years) {
      const yearMonths = monthValues.slice(idx, idx + y.months.length);
      const bucket = perPeriod.slice(idx, idx + y.months.length);
      byYear.push({
        months: yearMonths.map((v) => cell(v)),
        total: cell(yearTotal(bucket, yearMonths)),
      });
      idx += y.months.length;
    }
    return {
      key: `bridge:${key.replace("bridge-", "")}`,
      kind: key,
      depth: 0,
      label,
      emphasis,
      isTotal: false,
      direction: null,
      noDirection: false,
      byYear,
      total: cell(grandTotal(monthValues)),
    };
  }

  // Helpers for null-aware totals.
  const sumOrNull = (xs: (number | null)[]): number =>
    xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const lastNonNull = (xs: (number | null)[]): number | null => {
    for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null) return xs[i];
    return null;
  };
  const firstNonNull = (xs: (number | null)[]): number | null => {
    for (let i = 0; i < xs.length; i++) if (xs[i] !== null) return xs[i];
    return null;
  };

  rows.push(
    bridgeRow(
      "bridge-opening",
      "Cash balance at the beginning of the period",
      false,
      (pp) => pp.period.openingBalance,
      (_b, yearMonths) => firstNonNull(yearMonths),
      // Grand-total opening = '-' (summing openings would mislead).
      () => null,
    ),
    bridgeRow(
      "bridge-net",
      "Net cash change",
      true,
      (pp) => pp.statement.net,
      (_b, yearMonths) => sumOrNull(yearMonths),
      (all) => sumOrNull(all),
    ),
    bridgeRow(
      "bridge-fx",
      "FX fluctuations",
      false,
      (pp) => pp.period.fxFluctuations ?? 0,
      (_b, yearMonths) => sumOrNull(yearMonths),
      (all) => sumOrNull(all),
    ),
    bridgeRow(
      "bridge-closing",
      "Cash balance at the end of the period",
      true,
      (pp) => pp.closing,
      // Year closing = the year's last month closing (carry, not sum).
      (_b, yearMonths) => lastNonNull(yearMonths),
      // Grand total = last visible period's closing.
      (all) => lastNonNull(all),
    ),
  );

  return { years, rows };
}

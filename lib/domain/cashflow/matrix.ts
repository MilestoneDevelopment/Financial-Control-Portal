/**
 * Pure cash-flow matrix builder (Phase 5C).
 *
 * Statement view shows a single column (one period or one date range). Matrix
 * view shows the same recursive structure with one column per accounting period
 * plus a Total column - an Excel-style cross-tab.
 *
 * The walk + rollup mirror the statement (buildCashFlowTree + formatCashFlowRows)
 * so every row is identified by node id; only the amounts vary by column. Cash
 * bridge rows (opening, net, fx, closing) are appended after the line items.
 *
 * Total-column rules per spec:
 *   - line items / net / fx -> arithmetic sum across visible periods
 *   - opening               -> '-' (summing openings would mislead)
 *   - closing               -> last visible period's closing balance (carry, not sum)
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

export interface MatrixPeriod {
  id: string;
  label: string;
  year: number;
  month: number | null;
  /** Per-period opening (verbatim from DB, never invented). */
  opening: number | null;
  /** Per-period net cash change rolled up from transactions. */
  net: number;
  /** Per-period FX fluctuations (0 when not stored). */
  fx: number;
  /** Per-period closing: stored value when present, else opening + net + fx; null when opening is missing. */
  closing: number | null;
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
  /** One cell per visible period (same order as `MatrixModel.periods`). */
  cells: MatrixCell[];
  /** Right-most Total column (per-row rule documented above). */
  total: MatrixCell;
}

export interface MatrixModel {
  periods: MatrixPeriod[];
  rows: MatrixRow[];
}

/** Format a value to an accounting cell; null -> "-". */
function cell(value: number | null): MatrixCell {
  if (value === null) return { value: null, text: "-", negative: false };
  return {
    value,
    text: formatAmount(value, { decimals: 2 }),
    negative: value < 0,
  };
}

/**
 * Build the matrix model. `txnsByPeriod` must be keyed by the same period ids
 * as `periods` (caller-prepared; the data layer slices transactions per range).
 * Periods are rendered in the order given - callers sort chronologically.
 */
export function buildCashFlowMatrix(
  nodes: CashFlowNode[],
  periods: MatrixPeriodInput[],
  txnsByPeriod: ReadonlyMap<string, CashFlowTxn[]>,
): MatrixModel {
  // Per-period rolled-up tree + net. The tree shape is identical across periods
  // (same active nodes); only `amount`/`count` per node differ.
  const perPeriodTrees = periods.map((p) => {
    const txns = txnsByPeriod.get(p.id) ?? [];
    const stmt = buildCashFlowTree(nodes, txns);
    return { period: p, statement: stmt };
  });

  // Compute the bridge metrics per period.
  const metrics: MatrixPeriod[] = perPeriodTrees.map(({ period, statement }) => {
    const fx = period.fxFluctuations ?? 0;
    // Prefer the stored closing balance (canonical on imported periods); fall
    // back to opening + net + fx when present. Null opening -> null closing
    // (the bridge cannot complete without an opening).
    const computed = computeClosingBalance(period.openingBalance, statement.net, fx);
    const closing = period.storedClosingBalance ?? computed;
    return {
      id: period.id,
      label: period.label,
      year: period.year,
      month: period.month,
      opening: period.openingBalance,
      net: statement.net,
      fx,
      closing,
    };
  });

  // Build a parallel rows-skeleton from the first period's tree (any period works
  // because the active-structure walk is deterministic). Cell amounts are filled
  // per-period in lock-step using the same walk on each period's tree.
  const rows: MatrixRow[] = [];

  function walk(
    treeNodes: ReadonlyArray<CashFlowTreeNode>,
    perPeriodNodes: CashFlowTreeNode[][],
    depth: number,
  ): void {
    for (let i = 0; i < treeNodes.length; i++) {
      const node = treeNodes[i];
      const matesByPeriod = perPeriodNodes.map((arr) => arr[i]);

      // Pre-compute per-period amounts + total for this node.
      const cells = matesByPeriod.map((n) => cell(n.amount));
      const totalValue = matesByPeriod.reduce((s, n) => s + n.amount, 0);
      const total = cell(totalValue);

      if (node.kind === "class") {
        rows.push({
          key: `node:${node.id}`,
          kind: "class",
          depth,
          label: node.label,
          emphasis: false,
          isTotal: false,
          direction: node.cashDirection,
          noDirection: node.cashDirection === "neutral",
          cells,
          total,
        });
        continue;
      }

      const totalFooter = node.kind === "group" && isTotalLabel(node.label);
      if (totalFooter) {
        // Footer subtotal: children first (at same depth), then total row.
        walk(node.children, matesByPeriod.map((n) => n.children), depth);
        rows.push({
          key: `node:${node.id}`,
          kind: "group",
          depth,
          label: node.label,
          emphasis: true,
          isTotal: true,
          direction: null,
          noDirection: false,
          cells,
          total,
        });
        continue;
      }

      // Section / header group: header first, then children indented one deeper.
      rows.push({
        key: `node:${node.id}`,
        kind: node.kind === "section" ? "section" : "group",
        depth,
        label: node.label,
        emphasis: node.kind === "section",
        isTotal: false,
        direction: null,
        noDirection: false,
        cells,
        total,
      });
      walk(node.children, matesByPeriod.map((n) => n.children), depth + 1);
    }
  }

  if (perPeriodTrees.length > 0) {
    const firstRoots = perPeriodTrees[0].statement.roots;
    walk(firstRoots, perPeriodTrees.map((t) => t.statement.roots), 0);
  }

  // No periods -> no columns and no bridge rows; nothing meaningful to render.
  if (metrics.length === 0) return { periods: metrics, rows };

  // Cash bridge rows. The Total column follows the per-bridge rule.
  const sumNumbers = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const openingRow: MatrixRow = {
    key: "bridge:opening",
    kind: "bridge-opening",
    depth: 0,
    label: "Cash balance at the beginning of the period",
    emphasis: false,
    isTotal: false,
    direction: null,
    noDirection: false,
    cells: metrics.map((m) => cell(m.opening)),
    // Summing opening balances would mislead - show a dash. Callers can label
    // the cell as N/A in UI copy.
    total: cell(null),
  };
  const netRow: MatrixRow = {
    key: "bridge:net",
    kind: "bridge-net",
    depth: 0,
    label: "Net cash change",
    emphasis: true,
    isTotal: false,
    direction: null,
    noDirection: false,
    cells: metrics.map((m) => cell(m.net)),
    total: cell(sumNumbers(metrics.map((m) => m.net))),
  };
  const fxRow: MatrixRow = {
    key: "bridge:fx",
    kind: "bridge-fx",
    depth: 0,
    label: "FX fluctuations",
    emphasis: false,
    isTotal: false,
    direction: null,
    noDirection: false,
    cells: metrics.map((m) => cell(m.fx)),
    total: cell(sumNumbers(metrics.map((m) => m.fx))),
  };
  // Closing total = last visible period's closing balance (not a sum). Documented
  // in the UI label/tooltip so users do not read it as a year-end stack.
  const lastClosing = metrics.length > 0 ? metrics[metrics.length - 1].closing : null;
  const closingRow: MatrixRow = {
    key: "bridge:closing",
    kind: "bridge-closing",
    depth: 0,
    label: "Cash balance at the end of the period",
    emphasis: true,
    isTotal: false,
    direction: null,
    noDirection: false,
    cells: metrics.map((m) => cell(m.closing)),
    total: cell(lastClosing),
  };
  rows.push(openingRow, netRow, fxRow, closingRow);

  return { periods: metrics, rows };
}

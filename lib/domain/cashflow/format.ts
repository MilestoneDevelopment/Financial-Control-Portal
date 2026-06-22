/**
 * Pure flattening of the recursive cash-flow tree into ordered display rows
 * (testable). Each row carries a `depth` for indentation so the UI renders the
 * hierarchy without re-walking the tree. Amounts are accounting-formatted:
 * negatives use parentheses, e.g. (200.00).
 *
 * Subtotal convention (matches the CF_Actual workbook): a container `group`
 * whose label begins with "Total " renders as a FOOTER - its children print
 * first, then the total row. Every other section/group prints as a HEADER before
 * its children. Only leaf (`class`) rows are selectable for classification.
 */
import { formatAmount } from "../../format/money.ts";
import type { CashDirection, CashFlowStatement, CashFlowTreeNode } from "./types.ts";

export type CashFlowRowKind = "section" | "group" | "class";

export interface CashFlowDisplayRow {
  kind: CashFlowRowKind;
  depth: number;
  label: string;
  amount: number;
  amountText: string;
  count: number;
  /** True for section rows and "Total ..." footer rows (rendered with emphasis). */
  emphasis: boolean;
  /** True for a "Total ..." footer subtotal/total row. */
  isTotal: boolean;
  /** Only leaf class rows may be selected for classification. */
  selectable: boolean;
  /** Cash direction for class rows; null for section/group rows. */
  direction: CashDirection | null;
  /** True for a class node that carries no cash direction (data-quality flag). */
  noDirection: boolean;
}

/** A "Total ..." container renders as a footer subtotal rather than a header. */
export function isTotalLabel(label: string): boolean {
  return label.startsWith("Total ");
}

export function formatCashFlowRows(
  statement: CashFlowStatement,
): CashFlowDisplayRow[] {
  const rows: CashFlowDisplayRow[] = [];

  function walk(node: CashFlowTreeNode, depth: number): void {
    if (node.kind === "class") {
      rows.push(makeRow(node, "class", depth, { selectable: true, direction: node.cashDirection }));
      return;
    }
    if (node.kind === "group" && isTotalLabel(node.label)) {
      // Footer subtotal: children first (transparent depth), then the total row.
      for (const child of node.children) walk(child, depth);
      rows.push(makeRow(node, "group", depth, { emphasis: true, isTotal: true }));
      return;
    }
    // Section or header group: header row first, children indented one level.
    rows.push(makeRow(node, node.kind === "section" ? "section" : "group", depth, {
      emphasis: node.kind === "section",
    }));
    for (const child of node.children) walk(child, depth + 1);
  }

  for (const root of statement.roots) walk(root, 0);
  return rows;
}

function makeRow(
  node: CashFlowTreeNode,
  kind: CashFlowRowKind,
  depth: number,
  opts: {
    emphasis?: boolean;
    isTotal?: boolean;
    selectable?: boolean;
    direction?: CashDirection | null;
  },
): CashFlowDisplayRow {
  const direction = opts.direction ?? null;
  return {
    kind,
    depth,
    label: node.label,
    amount: node.amount,
    amountText: formatAmount(node.amount, { decimals: 2 }),
    count: node.count,
    emphasis: opts.emphasis ?? false,
    isTotal: opts.isTotal ?? false,
    selectable: opts.selectable ?? false,
    direction,
    noDirection: kind === "class" && direction === "neutral",
  };
}

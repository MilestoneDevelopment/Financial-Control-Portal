/**
 * Pure flattening of a cash-flow statement into ordered display rows (testable).
 * Hierarchy is encoded as `depth` (0 section, 1 group, 2 class) so the UI renders
 * indentation without re-walking the tree. Amounts are accounting-formatted:
 * negatives use parentheses, e.g. (200.00).
 */
import { formatAmount } from "../../format/money.ts";
import type { CashDirection, CashFlowStatement } from "./types.ts";

export type CashFlowRowKind = "section" | "group" | "class";

export interface CashFlowDisplayRow {
  kind: CashFlowRowKind;
  depth: number;
  label: string;
  amount: number;
  amountText: string;
  count: number;
  /** True for section rows (rendered with statement-total emphasis). */
  emphasis: boolean;
  /** Cash direction for class rows; null for section/group rows. */
  direction: CashDirection | null;
  /** True for a class node that carries no cash direction (data-quality flag). */
  noDirection: boolean;
}

export function formatCashFlowRows(
  statement: CashFlowStatement,
): CashFlowDisplayRow[] {
  const rows: CashFlowDisplayRow[] = [];
  for (const sec of statement.sections) {
    rows.push(makeRow("section", 0, sec.label, sec.amount, sec.count, true, null));
    for (const grp of sec.groups) {
      rows.push(makeRow("group", 1, grp.label, grp.amount, grp.count, false, null));
      for (const cls of grp.classes) {
        rows.push(makeRow("class", 2, cls.label, cls.amount, cls.count, false, cls.cashDirection));
      }
    }
  }
  return rows;
}

function makeRow(
  kind: CashFlowRowKind,
  depth: number,
  label: string,
  amount: number,
  count: number,
  emphasis: boolean,
  direction: CashDirection | null,
): CashFlowDisplayRow {
  return {
    kind,
    depth,
    label,
    amount,
    amountText: formatAmount(amount, { decimals: 2 }),
    count,
    emphasis,
    direction,
    noDirection: direction === "neutral",
  };
}

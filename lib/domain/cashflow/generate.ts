/**
 * Pure cash-flow generation (no DB / server imports - fully testable).
 *
 * Pipeline:
 *   transactions -> eligible signed amounts per class  (rollupCashFlow)
 *   class amounts -> Section / Group / Class tree       (buildCashFlowTree)
 *   section totals -> Net Cash Flow                     (computeNetCashFlow)
 *   opening + net -> Closing Cash Balance               (computeClosingBalance)
 *
 * Sign convention: a class node carries a cash direction. An inflow class adds
 * its GEL magnitude (+), an outflow class subtracts it (-). The transaction's
 * own amount_gel sign is preserved through the multiply, so a refund (negative
 * amount on an inflow class) correctly reduces the inflow.
 *
 * Eligibility is strict and explicit; anything not eligible is reported by the
 * coverage layer and never silently dropped here.
 */
import type {
  CashDirection,
  CashFlowNode,
  CashFlowStatement,
  CashFlowTxn,
  ClassRow,
  GroupRow,
  SectionRow,
} from "./types.ts";

const FX_OK: ReadonlySet<string> = new Set(["resolved", "not_required"]);

/** Statement sign for a class direction: in -> +1, out -> -1, neutral -> 0. */
export function directionSign(dir: CashDirection): number {
  return dir === "in" ? 1 : dir === "out" ? -1 : 0;
}

/**
 * Whether a transaction belongs in the generated statement. Requires a confirmed
 * (manual or rule) classification, a resolved GEL amount, an FX status of
 * resolved/not_required, and a class that carries a real cash direction.
 */
export function isEligible(t: CashFlowTxn, classDir: CashDirection | null): boolean {
  return (
    t.status === "confirmed" &&
    (t.source === "manual" || t.source === "rule") &&
    t.classId !== null &&
    t.amountGel !== null &&
    FX_OK.has(t.fxStatus) &&
    (classDir === "in" || classDir === "out")
  );
}

/** Signed eligible contribution of one transaction given its class direction. */
export function signedAmount(amountGel: number, dir: CashDirection): number {
  return amountGel * directionSign(dir);
}

export interface ClassAggregate {
  amount: number;
  count: number;
}

/**
 * Aggregate eligible transactions into signed totals per class id. This is the
 * transaction -> class rollup; `buildCashFlowTree` lifts it into the hierarchy.
 */
export function rollupCashFlow(
  nodes: CashFlowNode[],
  txns: CashFlowTxn[],
): Map<string, ClassAggregate> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const agg = new Map<string, ClassAggregate>();
  for (const t of txns) {
    if (t.classId === null) continue;
    const cls = byId.get(t.classId);
    if (!cls || cls.kind !== "class" || !cls.isActive) continue;
    if (!isEligible(t, cls.cashDirection)) continue;
    const cur = agg.get(t.classId) ?? { amount: 0, count: 0 };
    cur.amount += signedAmount(t.amountGel as number, cls.cashDirection);
    cur.count += 1;
    agg.set(t.classId, cur);
  }
  return agg;
}

/**
 * Build the Section -> Group -> Class statement tree with rolled-up amounts,
 * preserving the active structure's order (sort_order) and hierarchy. Inactive
 * nodes are excluded from the structure entirely.
 */
export function buildCashFlowTree(
  nodes: CashFlowNode[],
  txns: CashFlowTxn[],
): CashFlowStatement {
  const active = nodes.filter((n) => n.isActive);
  const agg = rollupCashFlow(active, txns);

  const byParent = new Map<string | null, CashFlowNode[]>();
  for (const n of active) {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  }
  const sort = (a: CashFlowNode, b: CashFlowNode) => a.sortOrder - b.sortOrder;

  const sections: SectionRow[] = (byParent.get(null) ?? [])
    .filter((n) => n.kind === "section")
    .sort(sort)
    .map((sec) => {
      const groups: GroupRow[] = (byParent.get(sec.id) ?? [])
        .filter((n) => n.kind === "group")
        .sort(sort)
        .map((grp) => {
          const classes: ClassRow[] = (byParent.get(grp.id) ?? [])
            .filter((n) => n.kind === "class")
            .sort(sort)
            .map((cls) => {
              const a = agg.get(cls.id) ?? { amount: 0, count: 0 };
              return {
                id: cls.id,
                label: cls.label,
                cashDirection: cls.cashDirection,
                amount: a.amount,
                count: a.count,
              };
            });
          return {
            id: grp.id,
            label: grp.label,
            amount: sum(classes.map((c) => c.amount)),
            count: sum(classes.map((c) => c.count)),
            classes,
          };
        });
      return {
        id: sec.id,
        label: sec.label,
        amount: sum(groups.map((g) => g.amount)),
        count: sum(groups.map((g) => g.count)),
        groups,
      };
    });

  return {
    sections,
    net: sum(sections.map((s) => s.amount)),
    includedCount: sum(sections.map((s) => s.count)),
  };
}

/** Net Cash Flow = sum of all section totals. */
export function computeNetCashFlow(sections: SectionRow[]): number {
  return sum(sections.map((s) => s.amount));
}

/**
 * Closing Cash Balance = Opening Cash Balance + Net Cash Flow. Returns null when
 * no opening balance is set - the caller must not invent one.
 */
export function computeClosingBalance(
  openingBalance: number | null,
  net: number,
): number | null {
  return openingBalance === null ? null : openingBalance + net;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

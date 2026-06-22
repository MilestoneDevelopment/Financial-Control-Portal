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
  CashFlowTreeNode,
  CashFlowTxn,
} from "./types.ts";

const FX_OK: ReadonlySet<string> = new Set(["resolved", "not_required"]);

/**
 * Statement sign for a class direction: in -> +1, out -> -1, neutral -> 0.
 * 'both' is bidirectional: it preserves the transaction's own signed amount
 * (factor +1), so a positive amount increases and a negative amount decreases
 * the cash flow.
 */
export function directionSign(dir: CashDirection): number {
  return dir === "in" || dir === "both" ? 1 : dir === "out" ? -1 : 0;
}

/** A directional class (in/out) or a bidirectional one (both) carries amounts. */
export function isDirectional(dir: CashDirection | null): boolean {
  return dir === "in" || dir === "out" || dir === "both";
}

/**
 * Whether a transaction belongs in the generated statement. Requires a confirmed
 * (manual or rule) classification, a resolved GEL amount, an FX status of
 * resolved/not_required, and a class that carries a real cash direction
 * (in, out, or both).
 */
export function isEligible(t: CashFlowTxn, classDir: CashDirection | null): boolean {
  return (
    t.status === "confirmed" &&
    (t.source === "manual" || t.source === "rule") &&
    t.classId !== null &&
    t.amountGel !== null &&
    FX_OK.has(t.fxStatus) &&
    isDirectional(classDir)
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
 * Build the cash-flow statement tree to arbitrary depth from the active nodes,
 * preserving sort_order at every level. A leaf (`class`) carries its own signed
 * rollup; a container (`section`/`group`) carries the signed sum of its
 * descendant leaves. Inactive nodes are excluded entirely.
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

  function build(node: CashFlowNode): CashFlowTreeNode {
    const children = (byParent.get(node.id) ?? []).sort(sort).map(build);
    if (node.kind === "class") {
      const a = agg.get(node.id) ?? { amount: 0, count: 0 };
      return {
        id: node.id,
        kind: node.kind,
        label: node.label,
        cashDirection: node.cashDirection,
        amount: a.amount,
        count: a.count,
        children,
      };
    }
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      cashDirection: node.cashDirection,
      amount: sum(children.map((c) => c.amount)),
      count: sum(children.map((c) => c.count)),
      children,
    };
  }

  const roots = (byParent.get(null) ?? [])
    .filter((n) => n.kind === "section")
    .sort(sort)
    .map(build);

  return {
    roots,
    net: sum(roots.map((r) => r.amount)),
    includedCount: sum(roots.map((r) => r.count)),
  };
}

/** Net Cash Flow = sum of all top-level section totals. */
export function computeNetCashFlow(roots: CashFlowTreeNode[]): number {
  return sum(roots.map((r) => r.amount));
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

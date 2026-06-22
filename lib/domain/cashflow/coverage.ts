/**
 * Pure cash-flow coverage summary (no DB - testable).
 *
 * Every transaction in the selected range lands in exactly one bucket, so
 * included + unclassified + fxPending + excluded === total. This is the
 * "never silently drop a row" guarantee: a row missing from the statement is
 * always visible and explained in one of the non-included buckets.
 *
 * Bucket precedence (first match wins):
 *   1. included    - eligible for the statement
 *   2. unclassified- no class assigned (or status unclassified)
 *   3. fxPending   - FX not resolved/not_required (pending or manual rate)
 *   4. excluded    - everything else (suggested, rejected, missing amount,
 *                    or a class with no cash direction)
 */
import type { CashDirection, CashFlowTxn } from "./types.ts";

export interface CashFlowCoverageFact extends CashFlowTxn {
  classDirection: CashDirection | null;
}

export interface CashFlowCoverage {
  total: number;
  included: number;
  unclassified: number;
  fxPending: number;
  excluded: number;
  /** Signed GEL sum of the included rows - sanity check against statement net. */
  includedAmount: number;
}

const FX_OK: ReadonlySet<string> = new Set(["resolved", "not_required"]);

export function summarizeCashFlowCoverage(
  facts: CashFlowCoverageFact[],
): CashFlowCoverage {
  const c: CashFlowCoverage = {
    total: facts.length,
    included: 0,
    unclassified: 0,
    fxPending: 0,
    excluded: 0,
    includedAmount: 0,
  };
  for (const f of facts) {
    const fxOk = FX_OK.has(f.fxStatus);
    // 'both' is bidirectional and counts; only 'neutral'/null are non-directional.
    const dirOk =
      f.classDirection === "in" || f.classDirection === "out" || f.classDirection === "both";
    const included =
      f.status === "confirmed" &&
      (f.source === "manual" || f.source === "rule" || f.source === "import") &&
      f.classId !== null &&
      f.amountGel !== null &&
      fxOk &&
      dirOk;

    if (included) {
      c.included += 1;
      // in/both preserve the sign (+1); out negates (-1).
      c.includedAmount += (f.amountGel as number) * (f.classDirection === "out" ? -1 : 1);
    } else if (f.classId === null || f.status === "unclassified") {
      c.unclassified += 1;
    } else if (!fxOk) {
      c.fxPending += 1;
    } else {
      c.excluded += 1;
    }
  }
  return c;
}

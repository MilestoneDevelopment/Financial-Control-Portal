import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCashFlowCoverage, type CashFlowCoverageFact } from "./coverage.ts";

function fact(p: Partial<CashFlowCoverageFact> & Pick<CashFlowCoverageFact, "id">): CashFlowCoverageFact {
  return {
    classId: "land",
    status: "confirmed",
    source: "rule",
    amountGel: 100,
    fxStatus: "not_required",
    classDirection: "in",
    ...p,
  };
}

test("summarizeCashFlowCoverage: matches the verified Tsavkisi Heights state", () => {
  // 4 confirmed Land Plot Sales (included) + 4 unclassified.
  const c = summarizeCashFlowCoverage([
    fact({ id: "t1", source: "manual", amountGel: 1250.5 }),
    fact({ id: "t2", amountGel: 500 }),
    fact({ id: "t3", amountGel: 500 }),
    fact({ id: "t4", amountGel: 400 }),
    fact({ id: "u1", classId: null, status: "unclassified", source: null, classDirection: null, amountGel: 265.54, fxStatus: "resolved" }),
    fact({ id: "u2", classId: null, status: "unclassified", source: null, classDirection: null, amountGel: 265.54, fxStatus: "resolved" }),
    fact({ id: "u3", classId: null, status: "unclassified", source: null, classDirection: null, amountGel: -200, fxStatus: "not_required" }),
    fact({ id: "u4", classId: null, status: "unclassified", source: null, classDirection: null, amountGel: 270, fxStatus: "resolved" }),
  ]);
  assert.equal(c.total, 8);
  assert.equal(c.included, 4);
  assert.equal(c.unclassified, 4);
  assert.equal(c.fxPending, 0);
  assert.equal(c.excluded, 0);
  assert.equal(c.includedAmount, 2650.5);
});

test("unclassified rows are excluded from inclusion but counted", () => {
  const c = summarizeCashFlowCoverage([
    fact({ id: "a" }),
    fact({ id: "b", classId: null, status: "unclassified", source: null, classDirection: null }),
  ]);
  assert.equal(c.included, 1);
  assert.equal(c.unclassified, 1);
});

test("FX-pending and manual-rate rows are excluded from inclusion but counted", () => {
  const c = summarizeCashFlowCoverage([
    fact({ id: "a", fxStatus: "pending" }),
    fact({ id: "b", fxStatus: "manual" }),
  ]);
  assert.equal(c.included, 0);
  assert.equal(c.fxPending, 2);
});

test("suggested / missing-amount / no-direction land in excluded, not dropped", () => {
  const c = summarizeCashFlowCoverage([
    fact({ id: "a", status: "suggested", source: null }),
    fact({ id: "b", amountGel: null }),
    fact({ id: "c", classDirection: "neutral" }),
  ]);
  assert.equal(c.included, 0);
  assert.equal(c.excluded, 3);
});

test("partition identity: included + unclassified + fxPending + excluded === total", () => {
  const facts: CashFlowCoverageFact[] = [
    fact({ id: "1" }),
    fact({ id: "2", classId: null, status: "unclassified", source: null, classDirection: null }),
    fact({ id: "3", fxStatus: "pending" }),
    fact({ id: "4", status: "suggested", source: null }),
    fact({ id: "5", amountGel: null }),
    fact({ id: "6", classDirection: "neutral" }),
    fact({ id: "7", status: "rejected", source: null }),
  ];
  const c = summarizeCashFlowCoverage(facts);
  assert.equal(c.included + c.unclassified + c.fxPending + c.excluded, c.total);
  assert.equal(c.total, facts.length);
});

test("empty input -> all zeros", () => {
  const c = summarizeCashFlowCoverage([]);
  assert.deepEqual(c, { total: 0, included: 0, unclassified: 0, fxPending: 0, excluded: 0, includedAmount: 0 });
});

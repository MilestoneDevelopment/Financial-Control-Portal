import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quarterRange,
  halfRange,
  fyRange,
  resolveStatementScopeKind,
  shouldHideZeroRows,
  pruneZeroRows,
  aggregatePeriodBridge,
} from "./scope.ts";
import type { CashFlowStatement, CashFlowTreeNode } from "./types.ts";

test("quarterRange: Q1-Q4 calendar bounds", () => {
  assert.deepEqual(quarterRange(2025, 1), { dateFrom: "2025-01-01", dateTo: "2025-03-31" });
  assert.deepEqual(quarterRange(2025, 2), { dateFrom: "2025-04-01", dateTo: "2025-06-30" });
  assert.deepEqual(quarterRange(2025, 3), { dateFrom: "2025-07-01", dateTo: "2025-09-30" });
  assert.deepEqual(quarterRange(2024, 4), { dateFrom: "2024-10-01", dateTo: "2024-12-31" });
});

test("halfRange: H1 Jan-Jun, H2 Jul-Dec", () => {
  assert.deepEqual(halfRange(2025, 1), { dateFrom: "2025-01-01", dateTo: "2025-06-30" });
  assert.deepEqual(halfRange(2025, 2), { dateFrom: "2025-07-01", dateTo: "2025-12-31" });
});

test("fyRange: full calendar year", () => {
  assert.deepEqual(fyRange(2026), { dateFrom: "2026-01-01", dateTo: "2026-12-31" });
});

test("resolveStatementScopeKind: explicit scope wins, else backward-compatible", () => {
  assert.equal(resolveStatementScopeKind({ scope: "quarter" }), "quarter");
  assert.equal(resolveStatementScopeKind({ scope: "fy" }), "fy");
  assert.equal(resolveStatementScopeKind({ periodId: "p1" }), "month");
  assert.equal(resolveStatementScopeKind({ from: "2024-01-01" }), "custom");
  assert.equal(resolveStatementScopeKind({ to: "2024-01-01" }), "custom");
  assert.equal(resolveStatementScopeKind({}), "month");
  // Unknown scope value falls through to backward-compat logic.
  assert.equal(resolveStatementScopeKind({ scope: "bogus", periodId: "p1" }), "month");
});

test("shouldHideZeroRows: FY always shows all; others hide unless showZero", () => {
  assert.equal(shouldHideZeroRows("fy", false), false);
  assert.equal(shouldHideZeroRows("fy", true), false);
  assert.equal(shouldHideZeroRows("month", false), true);
  assert.equal(shouldHideZeroRows("month", true), false);
  assert.equal(shouldHideZeroRows("quarter", false), true);
  assert.equal(shouldHideZeroRows("custom", false), true);
});

function cls(id: string, label: string, amount: number): CashFlowTreeNode {
  return { id, kind: "class", label, cashDirection: "in", amount, count: amount === 0 ? 0 : 1, children: [] };
}
function group(id: string, label: string, children: CashFlowTreeNode[]): CashFlowTreeNode {
  return {
    id, kind: "group", label, cashDirection: "neutral",
    amount: children.reduce((s, c) => s + c.amount, 0),
    count: children.reduce((s, c) => s + c.count, 0),
    children,
  };
}

test("pruneZeroRows: drops zero leaves and fully-zero containers", () => {
  const statement: CashFlowStatement = {
    roots: [
      group("s1", "Operations", [
        group("g1", "Revenue", [cls("a", "Sales", 100), cls("b", "Refunds", 0)]),
        group("g2", "Empty", [cls("c", "Nothing", 0)]),
      ]),
    ],
    net: 100,
    includedCount: 1,
  };
  const pruned = pruneZeroRows(statement);
  const ops = pruned.roots[0];
  assert.equal(ops.children.length, 1); // "Empty" group removed
  assert.equal(ops.children[0].label, "Revenue");
  assert.equal(ops.children[0].children.length, 1); // zero "Refunds" leaf removed
  assert.equal(ops.children[0].children[0].label, "Sales");
});

test("pruneZeroRows: keeps a container whose signed sum is zero but has non-zero leaves", () => {
  const statement: CashFlowStatement = {
    roots: [
      group("s1", "Financing", [cls("in", "Borrowings", 500), cls("out", "Repayment", -500)]),
    ],
    net: 0,
    includedCount: 2,
  };
  const pruned = pruneZeroRows(statement);
  assert.equal(pruned.roots.length, 1); // section kept (sum 0 but real leaves)
  assert.equal(pruned.roots[0].children.length, 2);
});

test("pruneZeroRows: empty statement stays empty", () => {
  const pruned = pruneZeroRows({ roots: [], net: 0, includedCount: 0 });
  assert.deepEqual(pruned.roots, []);
});

test("aggregatePeriodBridge: opening from first month, fx summed; partial labels", () => {
  const agg = aggregatePeriodBridge([
    { year: 2026, month: 3, openingBalance: 30, fxFluctuations: -3 },
    { year: 2026, month: 1, openingBalance: 10, fxFluctuations: -1 },
    { year: 2026, month: 2, openingBalance: 20, fxFluctuations: -2 },
  ]);
  assert.equal(agg.opening, 10); // first chronological month (Jan)
  assert.equal(agg.fx, -6);
  assert.equal(agg.firstMonth, 1);
  assert.equal(agg.lastMonth, 3);
});

test("aggregatePeriodBridge: empty -> nulls and zero fx", () => {
  const agg = aggregatePeriodBridge([]);
  assert.equal(agg.opening, null);
  assert.equal(agg.fx, 0);
  assert.equal(agg.firstMonth, null);
  assert.equal(agg.lastMonth, null);
});
